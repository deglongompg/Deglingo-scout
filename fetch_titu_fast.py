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
PROBE = "--probe" in sys.argv
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

# Decouverte DevTools 2026-04-22 :
# game.playerGameScores (ou playerGameScore) retourne une liste de So5Score,
# et chaque So5Score a :
#   anyPlayer           -> Player (slug, displayName)
#   anyPlayerGameStats  -> PlayerGameStats (footballPlayingStatusOdds)
#   id                  -> "So5Score:<uuid>"
#
# Confirmation par GraphQL hint "Did you mean playerGameScores or playerGameScore".

def discover_field_and_type(sample_uuid):
    """Trouve le bon field name sur Game qui retourne des So5Score."""
    candidates = ["playerGameScores", "playerGameScore", "anyPlayerGameScores",
                  "so5Scores", "anySo5Scores"]
    print(f"  → Discovery sur Game {sample_uuid[:8]}...")
    for id_variant in [sample_uuid, f"Game:{sample_uuid}"]:
        for field in candidates:
            q = """
            query($id: ID!) {
              football {
                game(id: $id) {
                  __typename
                  %s { __typename id }
                }
              }
            }
            """ % field
            body = gql(q, {"id": id_variant})
            if ok(body):
                game = (body["data"].get("football") or {}).get("game") or {}
                items = game.get(field) or []
                if isinstance(items, list) and items:
                    types = {it.get("__typename") for it in items if it}
                    print(f"  ✅ field={field:<20} id={id_variant!r} → {len(items)} entries, types={types}")
                    return field, id_variant, types
                elif isinstance(items, list):
                    print(f"  ⚠️  field={field} id={id_variant!r} → vide")
            else:
                msg = first_err(body)
                if "doesn't exist" not in msg:
                    print(f"  ❌ field={field} id={id_variant!r} → {msg[:100]}")
    return None, None, set()


def build_game_query(field, typenames):
    """Construit la query finale avec fragments sur So5Score (ou le type trouve)."""
    frags = []
    # Type principal attendu : So5Score
    for tn in typenames or ["So5Score"]:
        frags.append("""
            ... on %s {
              id
              anyPlayer {
                __typename
                ... on Player { slug displayName }
              }
              anyPlayerGameStats {
                __typename
                ... on PlayerGameStats {
                  footballPlayingStatusOdds {
                    starterOddsBasisPoints
                    reliability
                  }
                  anyTeam { __typename ... on Club { slug } }
                }
              }
            }
        """ % tn)
    return """
    query($id: ID!) {
      football {
        game(id: $id) {
          %s {
            __typename
            %s
          }
        }
      }
    }
    """ % (field, "\n".join(frags))


def detect_working_field(sample_game_uuid):
    """Discovery → teste la query finale. Retourne (field, typenames, id_variant)."""
    field, id_variant, typenames = discover_field_and_type(sample_game_uuid)
    if not field:
        return None, None, None
    q = build_game_query(field, typenames)
    body = gql(q, {"id": id_variant})
    if not ok(body):
        print(f"  ❌ query complete : {first_err(body)[:200]}")
        return None, None, None
    items = (body["data"].get("football") or {}).get("game", {}).get(field) or []
    got_odds = sum(
        1 for it in items
        if ((it.get("anyPlayerGameStats") or {}).get("footballPlayingStatusOdds") or {})
           .get("starterOddsBasisPoints") is not None
    )
    print(f"  ✅ query OK : {len(items)} entries, {got_odds} avec starterOddsBasisPoints")
    return field, typenames, id_variant


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


def fetch_game_lineup(game_uuid, field, typenames, id_format):
    q = build_game_query(field, typenames)
    gid = f"Game:{game_uuid}" if id_format == "prefixed" else game_uuid
    body = gql(q, {"id": gid})
    if not ok(body):
        return game_uuid, {}, first_err(body)
    game = (body["data"].get("football") or {}).get("game") or {}
    items = game.get(field) or []
    out = {}
    for it in items:
        pl = it.get("anyPlayer") or {}
        slug = pl.get("slug")
        pgs = it.get("anyPlayerGameStats") or {}
        odds = pgs.get("footballPlayingStatusOdds") or {}
        bp = odds.get("starterOddsBasisPoints")
        if slug and bp is not None:
            out[slug] = {
                "pct": min(round(bp / 100), 99),
                "reliability": odds.get("reliability"),
            }
    return game_uuid, out, None


def do_probe(game_uuid, player_slug="desire-doue"):
    """Probe aggressif pour trouver le chemin jusqu'a footballPlayingStatusOdds.

    On teste :
      1. Des fields sur Game (au-dela de anyPlayers)
      2. Des fields sur Player (playerGameStats, nextGameStats, ...)
      3. Des fields root (anyPlayerGameStats(id:), node(id:), ...)
    """
    print("=" * 60)
    print(f"PROBE — Game {game_uuid[:8]}... | Player {player_slug}")
    print("=" * 60)

    # 1) Game — teste des fields qui pourraient exposer un acces aux stats
    print("\n[1] Game fields (qui retournent quelque chose de non-null) :")
    GAME_PROBES = [
        "anyPlayers", "playerGameScores", "playerGameScore", "anyPlayerGameScores",
        "footballPlayerGameStats", "homeLineup", "awayLineup", "anyHomeLineup",
        "anyAwayLineup", "lineupPlayers", "lineups", "anyLineups", "formation",
        "homeFormation", "awayFormation", "anyFormation", "footballFormation",
        "footballGameStats", "anyFootballGameStats", "gameStats", "anyGameStats",
        "homeTeam", "awayTeam", "anyHomeTeam", "anyAwayTeam", "homeClub", "awayClub",
        "anyTeams", "teams", "anyParticipants", "participants",
        "playingStatusOdds", "anyPlayingStatusOdds", "footballPlayingStatusOdds",
        "fieldStatus", "status", "statusTyped", "scheduledAt", "date",
    ]
    for field in GAME_PROBES:
        q = "query($id: ID!){football{game(id:$id){%s { __typename }}}}" % field
        body = gql(q, {"id": game_uuid})
        if ok(body):
            val = ((body["data"].get("football") or {}).get("game") or {}).get(field)
            if val is not None:
                sample = json.dumps(val)[:120] if not isinstance(val, str) else val[:120]
                print(f"  ✅ game.{field:<35} = {sample}")
        else:
            # Cas scalar (pas de sous-sel)
            q2 = "query($id: ID!){football{game(id:$id){%s}}}" % field
            body2 = gql(q2, {"id": game_uuid})
            if ok(body2):
                val = ((body2["data"].get("football") or {}).get("game") or {}).get(field)
                if val is not None:
                    print(f"  ✅ (scalar) game.{field:<30} = {json.dumps(val)[:120]}")

    # 2) Player — teste des fields scope au prochain match
    print("\n[2] Player fields (cherche PlayerGameStats ou odds direct) :")
    PLAYER_PROBES = [
        "playerGameStats", "anyPlayerGameStats", "nextPlayerGameStats",
        "upcomingPlayerGameStats", "activePlayerGameStats", "nextGameStats",
        "nextFootballPlayerGameStats", "anyNextGameStats",
        "footballPlayerGameStats", "gameStats",
        "nextGame", "nextFootballGame", "upcomingGames", "anyUpcomingGames",
        "nextFixture", "nextFootballFixture", "anyNextFixture",
        "playingStatusOdds", "anyPlayingStatusOdds", "footballPlayingStatusOdds",
        "nextClassicFixturePlayingStatusOdds", "nextFixturePlayingStatusOdds",
        "nextMidweekFixturePlayingStatusOdds", "anyNextFixturePlayingStatusOdds",
        "starterOddsBasisPoints",
        "playingStatus", "playingStatusReliability",
    ]
    for field in PLAYER_PROBES:
        # Tente avec sous-selection __typename
        q = "query($s: String!){football{player(slug:$s){%s { __typename }}}}" % field
        body = gql(q, {"s": player_slug})
        if ok(body):
            val = ((body["data"].get("football") or {}).get("player") or {}).get(field)
            if val is not None:
                sample = json.dumps(val)[:120]
                print(f"  ✅ player.{field:<40} = {sample}")
        else:
            # Tente en scalar
            q2 = "query($s: String!){football{player(slug:$s){%s}}}" % field
            body2 = gql(q2, {"s": player_slug})
            if ok(body2):
                val = ((body2["data"].get("football") or {}).get("player") or {}).get(field)
                if val is not None:
                    print(f"  ✅ (scalar) player.{field:<34} = {json.dumps(val)[:120]}")

    # 3) Player + gameId arg — cherche playerGameStats(gameId:)
    print("\n[3] Player avec argument gameId :")
    PARAM_VARIANTS = [
        ("playerGameStats", "gameId", "ID"),
        ("playerGameStats", "id", "ID"),
        ("gameStats", "gameId", "ID"),
        ("footballPlayerGameStats", "gameId", "ID"),
        ("anyPlayerGameStats", "gameId", "ID"),
    ]
    for field, arg_name, arg_type in PARAM_VARIANTS:
        q = f'query($s:String!,$g:{arg_type}!){{football{{player(slug:$s){{{field}({arg_name}:$g){{ __typename }}}}}}}}'
        for gid in [game_uuid, f"Game:{game_uuid}"]:
            body = gql(q, {"s": player_slug, "g": gid})
            if ok(body):
                val = ((body["data"].get("football") or {}).get("player") or {}).get(field)
                print(f"  ✅ player.{field}({arg_name}:{gid[:12]}..) → {json.dumps(val)[:120]}")

    # 4) node(id) — acces direct par global ID
    print("\n[4] node(id:) — acces par ID global :")
    for gid in [f"Game:{game_uuid}", game_uuid]:
        q = "query($id:ID!){node(id:$id){__typename}}"
        body = gql(q, {"id": gid})
        if ok(body):
            val = body["data"].get("node")
            print(f"  ✅ node(id={gid[:18]}..) → {json.dumps(val)[:120]}")

    # 5) anyGame / anyPlayerGameStats au root sous football
    print("\n[5] Fields root sous football :")
    ROOT_PROBES = [
        ("anyGame", "id", "ID"),
        ("anyPlayer", "slug", "String"),
        ("anyPlayerGameStats", "id", "ID"),
        ("footballPlayerGameStats", "id", "ID"),
        ("playerGameStats", "id", "ID"),
    ]
    for field, arg, atype in ROOT_PROBES:
        q = "query($v:%s!){football{%s(%s:$v){__typename}}}" % (atype, field, arg)
        for val_arg in ([game_uuid, f"Game:{game_uuid}"] if "ID" in atype else [player_slug]):
            body = gql(q, {"v": val_arg})
            if ok(body):
                val = (body["data"].get("football") or {}).get(field)
                print(f"  ✅ football.{field}({arg}={val_arg[:18]}..) → {json.dumps(val)[:120]}")
            else:
                msg = first_err(body)
                if "doesn't exist" not in msg and "must have a sub-selection" not in msg:
                    print(f"  ⚠️  football.{field}({arg}={val_arg[:18]}..) : {msg[:120]}")

    print("\n=== FIN PROBE ===")
    sys.exit(0)


def main():
    t0 = time.time()

    if INTROSPECT:
        do_introspection()

    if PROBE:
        game = SINGLE_GAME or "db595776-a88c-4846-ae43-83473161e4d1"
        do_probe(game)

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

    # 2. Detecte le field (playerGameScores ?) + typenames (So5Score ?)
    print(f"[2/3] Discovery du field GraphQL sur Game...")
    field, typenames, id_variant = detect_working_field(game_uuids[0])
    if not field:
        print("\n❌ Discovery KO. Lance : python3 fetch_titu_fast.py --probe")
        sys.exit(2)
    id_format = "prefixed" if id_variant.startswith("Game:") else "raw"
    print()

    # 3. Batch parallele
    print(f"[3/3] Fetch {len(game_uuids)} games (workers={WORKERS}, field={field}, types={typenames}, id={id_format})...")
    slug_to_info = {}
    errors = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(fetch_game_lineup, gid, field, typenames, id_format): gid for gid in game_uuids}
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
