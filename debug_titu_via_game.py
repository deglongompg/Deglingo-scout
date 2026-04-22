#!/usr/bin/env python3
"""
debug_titu_via_game.py — confirme la query GraphQL qui donne `footballPlayingStatusOdds.starterOddsBasisPoints`
============================================================================================================
Basé sur le screenshot DevTools du 2026-04-22 : sur la page lineups d'un Game Sorare,
le frontend recupere pour chaque joueur :
  anyGame           -> Game { id, status }
  anyPlayer         -> Player { slug, displayName, cardPositions }
  anyPlayerGameStats-> PlayerGameStats {
                         anyTeam { slug },
                         footballPlayingStatusOdds { starterOddsBasisPoints, reliability, ... }
                       }

Ce champ `footballPlayingStatusOdds` (sans prefixe "nextClassic") est presumé fonctionner
pour TOUS les matchs, y compris mid-week — contrairement a `nextClassicFixturePlayingStatusOdds`.

But : trouver le bon chemin GraphQL cote federation API (api.sorare.com/federation/graphql).

Usage :
  python3 debug_titu_via_game.py
  python3 debug_titu_via_game.py <game_uuid>
"""
import requests, json, os, sys
from dotenv import load_dotenv

load_dotenv()

URL = "https://api.sorare.com/federation/graphql"
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
key = os.getenv("SORARE_API_KEY", "")
if key:
    HEADERS["APIKEY"] = key
    print("🔑 API key active\n")
else:
    print("⚠️  Pas d'API key (certaines queries vont planter sur complexity)\n")

# UUID connu : PSG-Nantes du 2026-04-23 (depuis le screenshot)
GAME_UUID = sys.argv[1] if len(sys.argv) > 1 else "db595776-a88c-4846-ae43-83473161e4d1"
PLAYER_SLUG_TEST = "desire-doue"

def gql(query, variables=None):
    r = requests.post(URL, json={"query": query, "variables": variables or {}}, headers=HEADERS, timeout=30)
    return r.json()

def ok(body):
    return "errors" not in body and body.get("data")

def err_msg(body):
    errs = body.get("errors") or []
    return (errs[0].get("message") if errs else "?")[:180]

print(f"=== Game UUID: {GAME_UUID}")
print(f"=== Player test: {PLAYER_SLUG_TEST}\n")

# ── PHASE 1 : introspection Game type ───────────────────────────────────────
print("=" * 70)
print("PHASE 1 : Introspection du type Game (cherche field -> PlayerGameStats)")
print("=" * 70)
Q_INTRO = """
{
  __type(name: "Game") {
    name
    fields {
      name
      type { name kind ofType { name kind ofType { name kind } } }
    }
  }
}
"""
body = gql(Q_INTRO)
if ok(body) and body["data"].get("__type"):
    fields = body["data"]["__type"]["fields"] or []
    print(f"  Game a {len(fields)} champs. Candidats lies aux joueurs :")
    for f in fields:
        name = f["name"]
        t = f["type"]
        # Deref wrapped types
        tname = (t.get("name") or
                 (t.get("ofType") or {}).get("name") or
                 (((t.get("ofType") or {}).get("ofType") or {}).get("name")))
        low = name.lower()
        if any(k in low for k in ["player", "lineup", "stats", "starter", "odds"]):
            print(f"    - {name:<40} -> {tname}")
else:
    print(f"  ❌ Introspection KO : {err_msg(body)}")
print()

# ── PHASE 2 : probes directes sur Game ──────────────────────────────────────
print("=" * 70)
print("PHASE 2 : Probes directes sur football.game(id:)")
print("=" * 70)
# Sorare a parfois 2 formats d'ID : UUID brut OU "Game:UUID"
for id_variant in [GAME_UUID, f"Game:{GAME_UUID}"]:
    print(f"\n  → Test id = {id_variant!r}")
    for field_guess in ["playerGameStats", "anyPlayerGameStats", "playingPlayers",
                        "lineup", "lineups", "players", "anyPlayers"]:
        q = """
        query($id: ID!) {
          football {
            game(id: $id) {
              __typename
              %s {
                __typename
              }
            }
          }
        }
        """ % field_guess
        body = gql(q, {"id": id_variant})
        if ok(body):
            data = body["data"].get("football", {}).get("game")
            if data and field_guess in data:
                val = data[field_guess]
                kind = type(val).__name__
                n = len(val) if isinstance(val, list) else 1
                sample = val[0] if isinstance(val, list) and val else val
                print(f"    ✅ game.{field_guess:<22} -> {kind} (n={n}) {json.dumps(sample)[:150]}")
        else:
            msg = err_msg(body)
            if "doesn't exist" not in msg and "Cannot query" not in msg:
                print(f"    ⚠️  game.{field_guess:<22} : {msg}")

# ── PHASE 3 : champs odds sur Player type ───────────────────────────────────
print()
print("=" * 70)
print("PHASE 3 : Cherche sur Player un acces aux PlayerGameStats/odds du prochain match")
print("=" * 70)
# Candidats : fields sur Player qui retournent une liste de PlayerGameStats / games
PLAYER_PROBES = [
    "upcomingGames",
    "anyUpcomingGames",
    "nextGames",
    "nextGame",
    "anyNextGame",
    "footballUpcomingGames",
    "playerGameStats",
    "anyPlayerGameStats",
    "nextGameStats",
    "nextFixturePlayingStatusOdds",
    "nextFixture",
    "nextMidweekFixturePlayingStatusOdds",
    "activeFixturePlayingStatusOdds",
]
for probe in PLAYER_PROBES:
    q = """
    query($s: String!) {
      football {
        player(slug: $s) {
          __typename
          %s {
            __typename
          }
        }
      }
    }
    """ % probe
    body = gql(q, {"s": PLAYER_SLUG_TEST})
    if ok(body):
        data = body["data"].get("football", {}).get("player")
        if data and probe in data:
            val = data[probe]
            print(f"  ✅ player.{probe:<38} -> {json.dumps(val)[:200]}")
    else:
        msg = err_msg(body)
        if "doesn't exist" not in msg and "Cannot query" not in msg:
            print(f"  ⚠️  player.{probe:<38} : {msg}")

# ── PHASE 4 : introspection PlayerGameStats type ────────────────────────────
print()
print("=" * 70)
print("PHASE 4 : Introspection PlayerGameStats (confirme footballPlayingStatusOdds)")
print("=" * 70)
Q_PGS = """
{
  __type(name: "PlayerGameStats") {
    name
    fields { name type { name kind ofType { name kind } } }
  }
}
"""
body = gql(Q_PGS)
if ok(body) and body["data"].get("__type"):
    fields = body["data"]["__type"]["fields"] or []
    print(f"  PlayerGameStats a {len(fields)} champs. Liste des champs odds/status :")
    for f in fields:
        name = f["name"]
        if any(k in name.lower() for k in ["odds", "status", "starter", "playing", "team", "game", "projection"]):
            t = f["type"]
            tname = (t.get("name") or
                     (t.get("ofType") or {}).get("name"))
            print(f"    - {name:<45} -> {tname}")
else:
    print(f"  ❌ Introspection KO : {err_msg(body)}")

# ── PHASE 5 : test concret en combinant ce qui marche ───────────────────────
print()
print("=" * 70)
print("PHASE 5 : Test final — essaye de recup starterOddsBasisPoints")
print("=" * 70)

# Essai via Game + `anyPlayerGameStats` ou `playerGameStats`
for id_variant in [GAME_UUID, f"Game:{GAME_UUID}"]:
    for list_field in ["playerGameStats", "anyPlayerGameStats", "lineup", "lineups"]:
        q = """
        query($id: ID!) {
          football {
            game(id: $id) {
              %s {
                footballPlayingStatusOdds { starterOddsBasisPoints reliability }
                player { slug displayName }
              }
            }
          }
        }
        """ % list_field
        body = gql(q, {"id": id_variant})
        if ok(body):
            items = body["data"].get("football", {}).get("game", {}).get(list_field)
            if isinstance(items, list) and items:
                print(f"  ✅✅✅ WIN : game(id={id_variant!r}).{list_field}[] (n={len(items)})")
                for it in items[:5]:
                    print(f"     {json.dumps(it)[:200]}")
                break

print("\n=== Fin probes ===")
print("Si aucun ✅ n'est sorti : regarde la doc GraphQL interne de Sorare")
print("via le DevTools Network → Request Payload pour recuperer la query exacte.")
