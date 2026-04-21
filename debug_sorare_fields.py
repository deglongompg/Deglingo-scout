#!/usr/bin/env python3
"""
debug_sorare_fields.py — On a trouve `nextGame` ! On explore ses sous-champs
pour trouver ou est le titu%.
"""
import requests, json, os
from dotenv import load_dotenv

load_dotenv()
URL = "https://api.sorare.com/federation/graphql"
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
key = os.getenv("SORARE_API_KEY", "")
if key:
    HEADERS["APIKEY"] = key
    print("🔑 API key active\n")

SLUG = "kylian-mbappe-lottin"

# Test candidats de sous-champs sur nextGame
CANDIDATES = [
    "startingOdds",
    "playingStatusOdds",
    "startingProbability",
    "starterOdds",
    "status",
    "date",
    "kickoff",
    "homeTeam",
    "awayTeam",
    "id",
    "fixture",
    "week",
    "competition",
]

print(f"=== TEST 1 : Sous-champs de nextGame (sans sous-sel) ===\n")
for c in CANDIDATES:
    q = '{ football { player(slug: "%s") { nextGame { %s } } } }' % (SLUG, c)
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message", "?")[:150]
        if "doesn't exist" in msg:
            print(f"  ❌ {c:<30} : n'existe pas")
        else:
            print(f"  ⚠️  {c:<30} : {msg}")
    else:
        p = (body.get("data") or {}).get("football", {}).get("player", {}) or {}
        print(f"  ✅ {c:<30} : {json.dumps(p.get('nextGame'))[:150]}")

# Test avec sous-sel __typename pour les champs type objet
print(f"\n=== TEST 2 : Sous-champs (avec __typename, pour objets) ===\n")
OBJECTS = ["startingOdds", "playingStatusOdds", "homeTeam", "awayTeam", "fixture", "competition", "gameWeek"]
for c in OBJECTS:
    q = '{ football { player(slug: "%s") { nextGame { %s { __typename } } } } }' % (SLUG, c)
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message", "?")[:150]
        if "doesn't exist" in msg:
            print(f"  ❌ {c:<25} : n'existe pas")
        else:
            print(f"  ⚠️  {c:<25} : {msg}")
    else:
        print(f"  ✅ {c:<25} : {json.dumps(body.get('data'))[:200]}")

# Test query complete pour voir ce qu'on peut tirer de nextGame
print(f"\n=== TEST 3 : Query complete nextGame + metadata ===\n")
Q = """{
  football {
    player(slug: "%s") {
      displayName
      nextGame {
        __typename
        id
        date
        status
        homeTeam { name }
        awayTeam { name }
      }
    }
  }
}""" % SLUG
r = requests.post(URL, json={"query": Q}, headers=HEADERS, timeout=15)
print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:1500])

# Test 4 : Le game a-t-il un champ pour les odds du joueur specifique?
# Essaie playingStatusOddsForPlayer(slug: X) ou variants
print(f"\n\n=== TEST 4 : Odds sur Game scoped par player ===\n")
GAME_ODDS_CANDIDATES = [
    '{ football { player(slug: "%s") { nextGame { playingStatusOdds { starterOddsBasisPoints } } } } }' % SLUG,
    '{ football { player(slug: "%s") { nextGame { startingOdds { starterOddsBasisPoints } } } } }' % SLUG,
    '{ football { player(slug: "%s") { playingStatusOdds { starterOddsBasisPoints } } } }' % SLUG,
]
for q in GAME_ODDS_CANDIDATES:
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        print(f"  ❌ {body['errors'][0].get('message','?')[:120]}")
    else:
        print(f"  ✅ {json.dumps(body.get('data'))[:200]}")
