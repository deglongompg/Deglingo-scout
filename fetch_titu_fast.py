#!/usr/bin/env python3
"""
fetch_titu_fast.py — Titu% precis via API Sorare GraphQL officielle (pas Sorareinside)
=======================================================================================
Screenshot DevTools 2026-04-22 a revele que la reponse GraphQL de la page Sorare
/football/scores/matches/{uuid}/lineups contient par joueur :
    anyPlayerGameStats.footballPlayingStatusOdds.starterOddsBasisPoints (= titu% × 100)
    anyPlayerGameStats.footballPlayingStatusOdds.reliability            ("MEDIUM" / "HIGH" / ...)

C'est le MEME champ pour matchs weekend ET matchs mid-week (≠ nextClassicFixturePlayingStatusOdds).

Strategie :
  1. Recupere la liste des prochains fixtures Sorare sur N jours (so5 fixtures)
  2. Pour chaque fixture, recupere la liste des games + leurs Game UUIDs
  3. Pour chaque Game (en parallele), fetch les PlayerGameStats avec footballPlayingStatusOdds
  4. Map slug -> starter_pct (basisPoints/100) et patche players.json

Duree attendue : ~5-10 sec (batch de games en parallele, 4 workers).

Usage :
  python3 fetch_titu_fast.py
  python3 fetch_titu_fast.py --days 4     # fenetre (default 3)
  python3 fetch_titu_fast.py --dry-run    # pas de patch
"""
import requests, json, os, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
sys.stdout.reconfigure(errors="replace")
from dotenv import load_dotenv

load_dotenv()

URL     = "https://api.sorare.com/federation/graphql"
API_KEY = os.getenv("SORARE_API_KEY", "")
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
if API_KEY:
    HEADERS["APIKEY"] = API_KEY
    print("🔑 API key Sorare active\n")
else:
    print("⚠️  Pas d'API key Sorare (recommande pour complexity limit)\n")

DAYS = 3
if "--days" in sys.argv:
    try: DAYS = int(sys.argv[sys.argv.index("--days") + 1])
    except (IndexError, ValueError): pass
DRY_RUN = "--dry-run" in sys.argv
WORKERS = 4

PLAYERS_IN = "deglingo-scout-app/public/data/players.json"
OUT_PATHS  = [
    "deglingo-scout-app/public/data/players.json",
    "public/data/players.json",
]


def gql(query, variables=None, timeout=30):
    r = requests.post(URL, json={"query": query, "variables": variables or {}},
                      headers=HEADERS, timeout=timeout)
    r.raise_for_status()
    return r.json()


# ── ETAPE 1 : recupere les Game UUIDs des prochains N jours ──────────────────
def fetch_upcoming_games(days=DAYS):
    """Retourne une liste de Game UUIDs pour les matchs qui se jouent dans les N prochains jours.

    Essaye d'abord so5.futureSo5Fixtures (qui ne couvre que Classic weekend).
    Puis complete via player(slug).anyUpcomingGames pour les mid-week.

    Fallback : lit public/data/fixtures.json et mappe club -> Sorare games.
    """
    game_uuids = set()

    # Strategie A : so5.inProgressSo5Fixture + upcoming
    Q_SO5 = """
    {
      so5 {
        inProgressSo5Fixture { slug startDate endDate games { id } }
        futureSo5Fixtures(first: 3) { nodes { slug startDate endDate games { id } } }
      }
    }
    """
    try:
        body = gql(Q_SO5)
        if "data" in body:
            so5 = body["data"].get("so5") or {}
            in_prog = so5.get("inProgressSo5Fixture")
            if in_prog:
                for g in in_prog.get("games", []) or []:
                    gid = g.get("id")
                    if gid: game_uuids.add(gid.split(":")[-1] if ":" in gid else gid)
                print(f"  📅 in-progress fixture {in_prog.get('slug')} → {len(in_prog.get('games') or [])} games")
            for fx in (so5.get("futureSo5Fixtures") or {}).get("nodes", []) or []:
                for g in fx.get("games", []) or []:
                    gid = g.get("id")
                    if gid: game_uuids.add(gid.split(":")[-1] if ":" in gid else gid)
                print(f"  📅 future fixture {fx.get('slug')} → {len(fx.get('games') or [])} games")
    except Exception as e:
        print(f"  ⚠️  so5 fixtures KO : {e}")

    # Strategie B : via chaque club → upcomingGames (au cas ou mid-week non-classic skippe)
    # On sample quelques clubs connus pour avoir un midweek frais (PSG, Real, etc.)
    if not game_uuids:
        print("  ⚠️  Pas de games via so5 — fallback via clubs")
        Q_CLUB = """
        query($s: String!) {
          football {
            club(slug: $s) {
              upcomingGames(first: 3) { id date }
            }
          }
        }
        """
        for club_slug in ["psg-paris", "real-madrid", "fc-barcelona", "manchester-city-fc"]:
            try:
                body = gql(Q_CLUB, {"s": club_slug})
                games = (body.get("data") or {}).get("football", {}).get("club", {}).get("upcomingGames") or []
                for g in games:
                    gid = g.get("id")
                    if gid: game_uuids.add(gid.split(":")[-1] if ":" in gid else gid)
            except Exception as e:
                pass

    print(f"  ✅ {len(game_uuids)} games uniques recuperes\n")
    return list(game_uuids)


# ── ETAPE 2 : pour chaque Game, fetch les PlayerGameStats ────────────────────
# Le schema exact est encore a confirmer via debug_titu_via_game.py
# On essaye plusieurs variantes et on garde celle qui marche.
FIELD_CANDIDATES = ["playerGameStats", "anyPlayerGameStats", "lineup", "playingPlayers"]

def build_game_query(field_name):
    return """
    query($id: ID!) {
      football {
        game(id: $id) {
          id
          homeTeam { slug }
          awayTeam { slug }
          %s {
            player { slug displayName }
            footballPlayingStatusOdds {
              starterOddsBasisPoints
              reliability
            }
          }
        }
      }
    }
    """ % field_name


def detect_working_field(sample_game_uuid):
    """Teste les candidats sur un game sample et retourne le premier qui marche."""
    for field in FIELD_CANDIDATES:
        q = build_game_query(field)
        try:
            body = gql(q, {"id": sample_game_uuid})
            if "errors" in body:
                continue
            data = (body.get("data") or {}).get("football", {}).get("game")
            if data and data.get(field) and isinstance(data[field], list):
                print(f"  ✅ Champ actif : game.{field} (n={len(data[field])})")
                return field
        except Exception:
            continue
    return None


def fetch_game_lineup(game_uuid, field):
    q = build_game_query(field)
    try:
        body = gql(q, {"id": game_uuid})
        if "errors" in body:
            return game_uuid, {}, str(body.get("errors"))[:150]
        game = (body.get("data") or {}).get("football", {}).get("game") or {}
        items = game.get(field) or []
        out = {}
        for it in items:
            pl = (it.get("player") or {})
            slug = pl.get("slug")
            odds = (it.get("footballPlayingStatusOdds") or {})
            bp = odds.get("starterOddsBasisPoints")
            if slug and bp is not None:
                out[slug] = {
                    "pct": min(round(bp / 100), 99),
                    "reliability": odds.get("reliability"),
                }
        return game_uuid, out, None
    except Exception as e:
        return game_uuid, {}, str(e)[:150]


# ── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    t0 = time.time()

    print("=" * 60)
    print("FETCH TITU% FAST — via API Sorare GraphQL officielle")
    print("=" * 60)
    print()

    # 1. Liste des games
    print(f"[1/3] Recupere les Game UUIDs (fenetre {DAYS} jours)...")
    game_uuids = fetch_upcoming_games(DAYS)

    if not game_uuids:
        print("❌ Aucun game UUID recupere. Abort.")
        print("   Tips :")
        print("   - Verifie SORARE_API_KEY dans .env")
        print("   - Run `python3 debug_titu_via_game.py` pour introspection")
        sys.exit(1)

    # 2. Detecte le champ qui marche
    print(f"\n[2/3] Detecte le champ GraphQL actif (test sur 1er game)...")
    working_field = detect_working_field(game_uuids[0])
    if not working_field:
        print("❌ Aucun champ ne marche. Check debug_titu_via_game.py pour trouver le bon nom.")
        sys.exit(1)

    # 3. Fetch parallele
    print(f"\n[3/3] Fetch {len(game_uuids)} games en parallele ({WORKERS} workers)...")
    slug_to_info = {}
    errors = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(fetch_game_lineup, gid, working_field): gid for gid in game_uuids}
        for fut in as_completed(futures):
            gid, pct_map, err = fut.result()
            if err:
                errors += 1
                print(f"  ⚠️  game {gid[:8]}... err: {err}")
                continue
            for slug, info in pct_map.items():
                # setdefault : 1er game (= plus proche) prime
                slug_to_info.setdefault(slug, info)

    elapsed = time.time() - t0
    print(f"\n⏱  Fetch termine en {elapsed:.1f}s")
    print(f"   Games fetched: {len(game_uuids)} ({errors} errors)")
    print(f"   Slugs avec titu% precis: {len(slug_to_info)}")

    # Sample output
    if slug_to_info:
        print("\n   Exemples :")
        for slug, info in list(slug_to_info.items())[:8]:
            print(f"     {slug:<35} {info['pct']:>3}% ({info['reliability']})")

    if DRY_RUN:
        print("\n--dry-run : pas de patch players.json")
        return

    # 4. Patch players.json
    print(f"\n💾 Patch players.json...")
    for path in OUT_PATHS:
        if not os.path.exists(path): continue
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

    print(f"\n{'='*60}")
    print(f"✅ FETCH TITU% FAST OK ({elapsed:.1f}s, {len(slug_to_info)} joueurs)")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
