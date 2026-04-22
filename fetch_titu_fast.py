#!/usr/bin/env python3
"""
fetch_titu_fast.py — Titu% precis via API Sorare GraphQL officielle
====================================================================
Recupere les titu% precis (equivalent Sorareinside) directement depuis l'API
Sorare federation. Marche pour matchs **weekend ET mid-week**.

Schema cle (voir MEMOIRE.md pour la chasse aux champs) :
  Game.playerGameScores → [PlayerGameScore]
  PlayerGameScore {
    anyPlayer → Player (slug, displayName)
    anyPlayerGameStats → PlayerGameStats {
      footballPlayingStatusOdds {
        starterOddsBasisPoints  # titu% × 100 (4000 = 40%)
        reliability             # HIGH | MEDIUM | LOW
      }
    }
  }

Pipeline :
  1. Charge `sorare_club_slugs.json` (mapping club → slug Sorare officiel)
  2. Query `club.upcomingGames` pour chaque club en parallele → Game UUIDs
  3. Pour chaque game, query `game.playerGameScores` avec fragments PlayerGameScore
  4. Patch `players.json` avec `sorare_starter_pct` + `sorare_starter_reliability`

Usage :
  python3 fetch_titu_fast.py                 # full patch
  python3 fetch_titu_fast.py --dry-run       # pas de patch
  python3 fetch_titu_fast.py --game <uuid>   # 1 game (debug)
  python3 fetch_titu_fast.py --verbose       # detail par game

Pre-requis :
  - `.env` avec SORARE_API_KEY=... (complexity 30000 > 500 sans)
  - `sorare_club_slugs.json` a jour (build via `python3 build_sorare_club_slugs.py`)
  - `deglingo-scout-app/public/data/players.json` present
"""
import requests, json, os, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
sys.stdout.reconfigure(errors="replace")
from dotenv import load_dotenv

load_dotenv()

# ── CONFIG ────────────────────────────────────────────────────────────────────
URL         = "https://api.sorare.com/federation/graphql"
API_KEY     = os.getenv("SORARE_API_KEY", "")
HEADERS     = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
if API_KEY:
    HEADERS["APIKEY"] = API_KEY

CLUB_SLUGS  = "sorare_club_slugs.json"
PLAYERS_IN  = "deglingo-scout-app/public/data/players.json"
OUT_PATHS   = [
    "deglingo-scout-app/public/data/players.json",
    "public/data/players.json",
]

WORKERS_CLUBS = 8   # queries club.upcomingGames en parallele
WORKERS_GAMES = 6   # queries game.playerGameScores en parallele
TIMEOUT       = 20  # seconds par requete
RETRIES       = 3   # retries sur erreur reseau

# ── CLI ───────────────────────────────────────────────────────────────────────
DRY_RUN     = "--dry-run" in sys.argv
VERBOSE     = "--verbose" in sys.argv
SINGLE_GAME = None
if "--game" in sys.argv:
    try: SINGLE_GAME = sys.argv[sys.argv.index("--game") + 1]
    except IndexError: pass


# ── GRAPHQL helper avec retry sur erreurs reseau ──────────────────────────────
def gql(query, variables=None):
    for attempt in range(RETRIES):
        try:
            r = requests.post(URL, json={"query": query, "variables": variables or {}},
                              headers=HEADERS, timeout=TIMEOUT)
            return r.json()
        except (requests.Timeout, requests.ConnectionError) as e:
            if attempt == RETRIES - 1:
                return {"errors": [{"message": f"net: {e}"}]}
            time.sleep(0.5 * (attempt + 1))
        except Exception as e:
            return {"errors": [{"message": f"{type(e).__name__}: {e}"}]}


def ok(body):
    return not body.get("errors") and body.get("data") is not None


def first_err(body):
    errs = body.get("errors") or []
    return (errs[0].get("message") if errs else "?")[:200]


# ── 1. STAGE : Game UUIDs via club.upcomingGames ──────────────────────────────
Q_UPCOMING = """
query($s: String!) {
  football {
    club(slug: $s) {
      upcomingGames(first: 3) { id date }
    }
  }
}
"""


def load_club_slugs():
    if not os.path.exists(CLUB_SLUGS):
        print(f"⚠️  {CLUB_SLUGS} absent — lance 'python3 build_sorare_club_slugs.py'")
        return {}
    with open(CLUB_SLUGS, encoding="utf-8") as f:
        return json.load(f)


def fetch_upcoming_games():
    """Retourne la liste des Game UUIDs prochains en interrogeant TOUS les clubs."""
    mapping = load_club_slugs()  # {club_name: sorare_slug}
    slugs   = sorted(set(mapping.values()))
    if not slugs:
        print("❌ Aucun club slug. Abort.")
        sys.exit(1)
    print(f"  → {len(slugs)} clubs Sorare a interroger")

    uuids = set()
    failed = []
    t0 = time.time()

    def fetch(slug):
        body = gql(Q_UPCOMING, {"s": slug})
        if not ok(body):
            return slug, [], first_err(body)
        club = ((body["data"].get("football") or {}).get("club") or {})
        games = club.get("upcomingGames") or []
        return slug, games, None

    with ThreadPoolExecutor(max_workers=WORKERS_CLUBS) as ex:
        futs = {ex.submit(fetch, s): s for s in slugs}
        for fut in as_completed(futs):
            slug, games, err = fut.result()
            if err:
                failed.append((slug, err))
                continue
            for g in games:
                gid = (g.get("id") or "").split(":")[-1]
                if gid: uuids.add(gid)

    dt = time.time() - t0
    print(f"  ✅ {len(uuids)} games uniques en {dt:.1f}s")
    if failed and VERBOSE:
        print(f"  ⚠️  {len(failed)} clubs sans upcomingGames (ok pour clubs non-Sorare) :")
        for s, e in failed[:5]: print(f"     - {s} : {e[:80]}")
    return list(uuids)


# ── 2. STAGE : titu% par game via game.playerGameScores ──────────────────────
Q_LINEUP = """
query($id: ID!) {
  football {
    game(id: $id) {
      playerGameScores {
        ... on PlayerGameScore {
          anyPlayer {
            ... on Player { slug }
          }
          anyPlayerGameStats {
            ... on PlayerGameStats {
              footballPlayingStatusOdds {
                starterOddsBasisPoints
                reliability
              }
            }
          }
        }
      }
    }
  }
}
"""


def fetch_game_titu(game_uuid):
    """Fetch les titu% d'un game. Retourne {slug: {pct, reliability}}."""
    body = gql(Q_LINEUP, {"id": game_uuid})
    if not ok(body):
        return game_uuid, {}, first_err(body)
    game = (body["data"].get("football") or {}).get("game") or {}
    items = game.get("playerGameScores") or []
    out = {}
    for it in items:
        slug = ((it.get("anyPlayer") or {}).get("slug"))
        odds = ((it.get("anyPlayerGameStats") or {}).get("footballPlayingStatusOdds") or {})
        bp = odds.get("starterOddsBasisPoints")
        if slug and bp is not None:
            out[slug] = {
                "pct": min(round(bp / 100), 99),
                "reliability": odds.get("reliability"),
            }
    return game_uuid, out, None


# ── 3. MAIN ───────────────────────────────────────────────────────────────────
def main():
    t_start = time.time()
    print("=" * 60)
    print("FETCH TITU% FAST — API Sorare officielle")
    print("=" * 60)
    if API_KEY:
        print("🔑 API key Sorare active")
    else:
        print("⚠️  Pas d'API key (complexity limit reduite)")
    print()

    # 1. Game UUIDs
    if SINGLE_GAME:
        game_uuids = [SINGLE_GAME]
        print(f"[1/3] Single game mode : {SINGLE_GAME}")
    else:
        print("[1/3] Games prochains via club.upcomingGames...")
        game_uuids = fetch_upcoming_games()
    if not game_uuids:
        print("❌ Aucun game. Abort.")
        sys.exit(1)
    print()

    # 2. Titu% par game
    print(f"[2/3] Fetch titu% pour {len(game_uuids)} games (workers={WORKERS_GAMES})...")
    slug_to_info = {}
    errors = 0
    t_fetch = time.time()
    with ThreadPoolExecutor(max_workers=WORKERS_GAMES) as ex:
        futs = {ex.submit(fetch_game_titu, gid): gid for gid in game_uuids}
        for fut in as_completed(futs):
            gid, pct_map, err = fut.result()
            if err:
                errors += 1
                if VERBOSE: print(f"  ⚠️  {gid[:8]}: {err[:100]}")
                continue
            # 1er game (= plus proche) gagne si doublon (grace a setdefault)
            for slug, info in pct_map.items():
                slug_to_info.setdefault(slug, info)
            if VERBOSE:
                print(f"  ✓ {gid[:8]}: {len(pct_map)} joueurs")

    dt_fetch = time.time() - t_fetch
    print(f"  ✅ {len(slug_to_info)} joueurs avec titu% en {dt_fetch:.1f}s ({errors} errs)")

    # Sample
    print("\n  Echantillon :")
    for slug, info in list(sorted(slug_to_info.items()))[:10]:
        print(f"     {slug:<35} {info['pct']:>3}%  [{info['reliability']}]")
    print()

    # 3. Patch
    if DRY_RUN:
        print("[3/3] --dry-run : pas de patch")
    else:
        print("[3/3] Patch players.json...")
        total_patched = 0
        for path in OUT_PATHS:
            if not os.path.exists(path):
                continue
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            patched = 0
            for p in data:
                info = slug_to_info.get(p.get("slug", ""))
                if info:
                    p["sorare_starter_pct"] = info["pct"]
                    p["sorare_starter_reliability"] = info["reliability"]
                    patched += 1
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            print(f"  ✅ {patched:>4} joueurs patches → {path}")
            total_patched = max(total_patched, patched)

    dt_total = time.time() - t_start
    print(f"\n{'='*60}")
    print(f"✅ TERMINE en {dt_total:.1f}s — {len(slug_to_info)} joueurs avec titu% precis")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
