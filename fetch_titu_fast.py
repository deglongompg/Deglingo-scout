#!/usr/bin/env python3
"""
fetch_titu_fast.py — Titu% precis via API Sorare GraphQL officielle
====================================================================
Screenshot DevTools 2026-04-22 sur page /football/scores/matches/{uuid}/lineups :
reponse inclut pour chaque joueur :
    anyPlayerGameStats.footballPlayingStatusOdds.starterOddsBasisPoints (= titu% × 100)

Leçons apprises du 1er run :
  - `AnyPlayerGameStatsInterface` est une INTERFACE GraphQL
    → il FAUT `... on PlayerGameStats` pour acceder aux champs concrets (fieldStatus,
      footballPlayingStatusOdds, etc.).
  - Idem probable pour `anyPlayer` (interface) et `anyGame` (interface).

Strategie :
  1. Recupere les Game UUIDs prochains (so5 fixtures + club.upcomingGames en fallback)
  2. Pour chaque game, batch parallele avec fragments inline ... on PlayerGameStats
  3. Patch players.json avec sorare_starter_pct + sorare_starter_reliability

Usage :
  python3 fetch_titu_fast.py
  python3 fetch_titu_fast.py --days 4
  python3 fetch_titu_fast.py --dry-run
  python3 fetch_titu_fast.py --game <uuid>   # force sur 1 game pour debug
  python3 fetch_titu_fast.py --introspect    # introspection pour trouver le bon field name
"""
import requests, json, os, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
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
    print("⚠️  Pas d'API key Sorare\n")

DAYS = 3
if "--days" in sys.argv:
    try: DAYS = int(sys.argv[sys.argv.index("--days") + 1])
    except (IndexError, ValueError): pass
DRY_RUN = "--dry-run" in sys.argv
SINGLE_GAME = None
if "--game" in sys.argv:
    try: SINGLE_GAME = sys.argv[sys.argv.index("--game") + 1]
    except IndexError: pass
INTROSPECT = "--introspect" in sys.argv
WORKERS = 4

PLAYERS_IN = "deglingo-scout-app/public/data/players.json"
OUT_PATHS  = [
    "deglingo-scout-app/public/data/players.json",
    "public/data/players.json",
]


def gql(query, variables=None, timeout=30):
    r = requests.post(URL, json={"query": query, "variables": variables or {}},
                      headers=HEADERS, timeout=timeout)
    try:
        return r.json()
    except Exception:
        return {"errors": [{"message": f"HTTP {r.status_code}: {r.text[:200]}"}]}


def ok(body):
    return not body.get("errors") and body.get("data") is not None


def first_err(body):
    errs = body.get("errors") or []
    return (errs[0].get("message") if errs else "?")[:200]


# ── QUERY avec fragments inline (on target les types concrets) ──────────────
QUERY_GAME_LINEUP = """
query($id: ID!) {
  football {
    game(id: $id) {
      __typename
      ... on Game {
        id
        anyPlayerGameStats {
          __typename
          ... on PlayerGameStats {
            footballPlayingStatusOdds {
              starterOddsBasisPoints
              reliability
            }
            anyPlayer {
              __typename
              ... on Player { slug displayName }
            }
            anyTeam {
              __typename
              ... on Club { slug name }
              ... on NationalTeam { slug name }
            }
          }
        }
      }
    }
  }
}
"""

# GraphQL error hints ont confirme : le bon field sur Game est `anyPlayers`.
# On fait d'abord une discovery (__typename) pour trouver le type concret retourne.
FIELD_NAME = "anyPlayers"


def discover_any_player_type(sample_uuid):
    """Query game(id).anyPlayers { __typename } pour decouvrir le type concret."""
    print(f"  → Discovery du type anyPlayers[] sur Game {sample_uuid[:8]}...")
    for id_variant in [sample_uuid, f"Game:{sample_uuid}"]:
        q = """
        query($id: ID!) {
          football {
            game(id: $id) {
              __typename
              anyPlayers { __typename }
            }
          }
        }
        """
        body = gql(q, {"id": id_variant})
        if ok(body):
            game = (body["data"].get("football") or {}).get("game") or {}
            items = game.get("anyPlayers") or []
            if items:
                types = {it.get("__typename") for it in items if it}
                print(f"  ✅ id={id_variant!r} → {len(items)} entries, types={types}")
                return id_variant, types
            else:
                print(f"  ⚠️  id={id_variant!r} → anyPlayers vide")
        else:
            print(f"  ❌ id={id_variant!r} → {first_err(body)[:150]}")
    return None, set()


def build_game_query(typenames):
    """Construit la query finale avec fragments sur les types concrets detectes."""
    # Fragments a essayer : on couvre les noms plausibles. L'API ignore les fragments
    # pour des types qui ne matchent pas (pas d'erreur).
    frags = []
    for tn in typenames:
        frags.append("""
            ... on %s {
              footballPlayingStatusOdds { starterOddsBasisPoints reliability }
              anyPlayer { __typename ... on Player { slug displayName } }
              player { slug displayName }
            }
        """ % tn)
    # Fallback : tente aussi les noms communs meme s'ils ne sont pas dans typenames
    # (au cas ou l'API retourne un type parent seul en discovery)
    for guess in ["PlayerGameStats", "FootballPlayerGameStats", "AnyPlayer",
                  "LineupEntry", "GameLineupPlayer"]:
        if guess not in typenames:
            frags.append("""
                ... on %s {
                  footballPlayingStatusOdds { starterOddsBasisPoints reliability }
                  anyPlayer { __typename ... on Player { slug displayName } }
                  player { slug displayName }
                }
            """ % guess)
    return """
    query($id: ID!) {
      football {
        game(id: $id) {
          anyPlayers {
            __typename
            %s
          }
        }
      }
    }
    """ % "\n".join(frags)


def detect_working_field(sample_game_uuid):
    """Discovery → teste la query finale. Retourne (typenames, id_variant)."""
    id_variant, typenames = discover_any_player_type(sample_game_uuid)
    if not id_variant:
        return None, None
    # Teste la query avec fragments
    q = build_game_query(typenames)
    body = gql(q, {"id": id_variant})
    if not ok(body):
        print(f"  ❌ query avec fragments : {first_err(body)[:200]}")
        # Retry sans les fragments guess (qui peuvent etre invalides)
        q_min = """
        query($id: ID!) {
          football {
            game(id: $id) {
              anyPlayers {
                __typename
                %s
              }
            }
          }
        }
        """ % "\n".join([
            """... on %s {
                 footballPlayingStatusOdds { starterOddsBasisPoints reliability }
                 anyPlayer { ... on Player { slug displayName } }
               }""" % tn for tn in typenames
        ])
        body = gql(q_min, {"id": id_variant})
        if not ok(body):
            print(f"  ❌ query minimale : {first_err(body)[:200]}")
            return None, None
        print(f"  ✅ query minimale OK")
        return typenames, id_variant
    # Check que les fragments renvoient bien quelque chose d'utile
    items = (body["data"].get("football") or {}).get("game", {}).get("anyPlayers") or []
    got_odds = sum(1 for it in items if (it.get("footballPlayingStatusOdds") or {}).get("starterOddsBasisPoints") is not None)
    print(f"  ✅ query OK : {len(items)} entries, {got_odds} avec starterOddsBasisPoints")
    return typenames, id_variant


# ── introspection utilities ──────────────────────────────────────────────────
def introspect_type(type_name):
    q = """
    query($n: String!) {
      __type(name: $n) {
        name kind
        fields {
          name
          type { name kind ofType { name kind ofType { name kind } } }
        }
        possibleTypes { name }
      }
    }
    """
    body = gql(q, {"n": type_name})
    return (body.get("data") or {}).get("__type")


def do_introspection():
    print("=" * 60)
    print("INTROSPECTION")
    print("=" * 60)
    for tn in ["Game", "AnyGameInterface", "PlayerGameStats", "AnyPlayerGameStatsInterface",
               "Player", "AnyPlayerInterface", "PlayingStatusOdds", "FootballPlayingStatusOdds"]:
        t = introspect_type(tn)
        if not t:
            print(f"  ❌ {tn} : type introuvable")
            continue
        print(f"\n  ✅ {tn} (kind={t['kind']})")
        fields = t.get("fields") or []
        possible = t.get("possibleTypes") or []
        if possible:
            print(f"    possibleTypes : {[p['name'] for p in possible]}")
        keywords = ["player", "stats", "lineup", "starter", "odds", "playing",
                    "status", "team", "game", "projection", "field"]
        for f in fields:
            if any(k in f["name"].lower() for k in keywords):
                t2 = f["type"]
                tname = (t2.get("name") or (t2.get("ofType") or {}).get("name")
                         or (((t2.get("ofType") or {}).get("ofType") or {}).get("name")))
                print(f"    - {f['name']:<40} -> {tname}")
    sys.exit(0)


# ── fetch upcoming games ─────────────────────────────────────────────────────
def fetch_upcoming_games():
    uuids = set()

    # A) so5 fixtures (weekend classic)
    Q_SO5 = """
    {
      so5 {
        inProgressSo5Fixture { slug games { id } }
        futureSo5Fixtures(first: 3) { nodes { slug games { id } } }
      }
    }
    """
    body = gql(Q_SO5)
    if ok(body):
        so5 = body["data"].get("so5") or {}
        ip = so5.get("inProgressSo5Fixture") or {}
        for g in ip.get("games") or []:
            gid = (g.get("id") or "").split(":")[-1]
            if gid: uuids.add(gid)
        print(f"  📅 inProgress {ip.get('slug','-')}: {len(ip.get('games') or [])} games")
        for fx in (so5.get("futureSo5Fixtures") or {}).get("nodes") or []:
            for g in fx.get("games") or []:
                gid = (g.get("id") or "").split(":")[-1]
                if gid: uuids.add(gid)
            print(f"  📅 future {fx.get('slug','-')}: {len(fx.get('games') or [])} games")
    else:
        print(f"  ⚠️  so5 fixtures: {first_err(body)}")

    # B) Complete via club.upcomingGames (pour midweek si so5 ne couvre pas tout)
    # On lit players.json pour avoir la liste des clubs actifs
    try:
        with open(PLAYERS_IN, encoding="utf-8") as f:
            players = json.load(f)
        club_slugs = set()
        for p in players:
            cs = p.get("club_slug") or p.get("clubSlug")
            if cs: club_slugs.add(cs)
        # Si pas de club_slug dans players, on utilise des sluggifications connues par ligue
        # (fallback minimaliste — on reste sur les clubs qui jouent mid-week frequemment)
        if not club_slugs:
            club_slugs = {"psg-paris", "real-madrid", "fc-barcelona", "atletico-de-madrid",
                          "manchester-city-fc", "arsenal-fc", "liverpool-fc", "chelsea-fc"}
        Q_CLUB = """
        query($s: String!) {
          football {
            club(slug: $s) {
              upcomingGames(first: 3) { id date }
            }
          }
        }
        """
        added = 0
        for slug in list(club_slugs)[:30]:  # cap au cas ou
            body = gql(Q_CLUB, {"s": slug})
            if ok(body):
                games = ((body["data"].get("football") or {})
                         .get("club") or {}).get("upcomingGames") or []
                for g in games:
                    gid = (g.get("id") or "").split(":")[-1]
                    if gid and gid not in uuids:
                        uuids.add(gid); added += 1
        if added:
            print(f"  📅 club.upcomingGames: +{added} games mid-week")
    except Exception as e:
        print(f"  ⚠️  club fallback KO: {e}")

    print(f"  ✅ {len(uuids)} games uniques\n")
    return list(uuids)


def fetch_game_lineup(game_uuid, typenames, id_format):
    q = build_game_query(typenames)
    gid = f"Game:{game_uuid}" if id_format == "prefixed" else game_uuid
    body = gql(q, {"id": gid})
    if not ok(body):
        return game_uuid, {}, first_err(body)
    game = (body["data"].get("football") or {}).get("game") or {}
    items = game.get("anyPlayers") or []
    out = {}
    for it in items:
        # anyPlayer peut etre sous 'anyPlayer' (selon fragment) ou 'player'
        pl = it.get("anyPlayer") or it.get("player") or {}
        slug = pl.get("slug")
        odds = it.get("footballPlayingStatusOdds") or {}
        bp = odds.get("starterOddsBasisPoints")
        if slug and bp is not None:
            out[slug] = {
                "pct": min(round(bp / 100), 99),
                "reliability": odds.get("reliability"),
            }
    return game_uuid, out, None


def main():
    t0 = time.time()

    if INTROSPECT:
        do_introspection()

    print("=" * 60)
    print("FETCH TITU% FAST — API Sorare officielle")
    print("=" * 60)

    # 1. Games
    if SINGLE_GAME:
        game_uuids = [SINGLE_GAME]
        print(f"  → single-game mode : {SINGLE_GAME}")
    else:
        print(f"[1/3] Games prochains (fenetre {DAYS}j)...")
        game_uuids = fetch_upcoming_games()
    if not game_uuids:
        print("❌ Aucun game. Abort.")
        sys.exit(1)

    # 2. Detecte types
    print(f"[2/3] Discovery du type GraphQL sur anyPlayers...")
    typenames, id_variant = detect_working_field(game_uuids[0])
    if not typenames:
        print("\n❌ Discovery KO. Copie la sortie ci-dessus et envoie-la.")
        sys.exit(2)
    id_format = "prefixed" if id_variant.startswith("Game:") else "raw"
    print()

    # 3. Batch parallele
    print(f"[3/3] Fetch {len(game_uuids)} games (workers={WORKERS}, types={typenames}, id={id_format})...")
    slug_to_info = {}
    errors = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(fetch_game_lineup, gid, typenames, id_format): gid for gid in game_uuids}
        for fut in as_completed(futs):
            gid, pct_map, err = fut.result()
            if err:
                errors += 1
                print(f"  ⚠️  {gid[:8]}... err: {err[:120]}")
                continue
            for slug, info in pct_map.items():
                slug_to_info.setdefault(slug, info)  # 1er game (plus proche) gagne

    elapsed = time.time() - t0
    print(f"\n⏱  {elapsed:.1f}s · {len(game_uuids)} games ({errors} err) · {len(slug_to_info)} joueurs")

    if slug_to_info:
        print("\n   Echantillon :")
        for slug, info in list(slug_to_info.items())[:10]:
            print(f"     {slug:<35} {info['pct']:>3}%  [{info['reliability']}]")

    if DRY_RUN:
        print("\n--dry-run : pas de patch")
        return

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

    print(f"\n✅ FETCH TITU% FAST OK ({elapsed:.1f}s, {len(slug_to_info)} joueurs)")


if __name__ == "__main__":
    main()
