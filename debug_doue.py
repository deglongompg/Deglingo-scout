#!/usr/bin/env python3
"""debug_doue.py — Exploration finale : football.* root + Game par id + so5Scores"""
import requests, json, os
from dotenv import load_dotenv

load_dotenv()
URL = "https://api.sorare.com/federation/graphql"
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
key = os.getenv("SORARE_API_KEY", "")
if key:
    HEADERS["APIKEY"] = key
    print("🔑 API key active\n")

SLUG = "desire-doue"
GAME_ID = "Game:db595776-a88c-4846-ae43-83473161e4d1"  # PSG-Nantes mid-week

# 1) football.* root — quels champs existent (so5/fixture/game/leaderboard/pro)
print("=== TEST 1 : football.* champs racine ===\n")
ROOT_FIELDS = [
    "so5Fixtures", "openSo5Fixtures", "currentSo5Fixture", "nextSo5Fixture",
    "so5Leaderboard", "upcomingSo5Fixtures", "activeSo5Fixtures",
    "game", "games", "fixture", "fixtures",
    "liveFixtures", "openFixtures", "classicFixture",
    "proFixtures", "proLineups",
]
for rf in ROOT_FIELDS:
    q = '{ football { %s { __typename } } }' % rf
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message","?")[:150]
        if "doesn't exist" in msg:
            print(f"  ❌ football.{rf:<30} : n'existe pas")
        else:
            print(f"  ⚠️  football.{rf:<30} : {msg}")
    else:
        print(f"  ✅ football.{rf:<30} : {json.dumps(body.get('data'))[:180]}")

# 2) football.game(id:) — tenter avec ID du match PSG-Nantes
print("\n\n=== TEST 2 : football.game(id:) avec ID PSG-Nantes ===\n")
Q = '{ football { game(id: "%s") { __typename id date } } }' % GAME_ID
r = requests.post(URL, json={"query": Q}, headers=HEADERS, timeout=10)
print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:500])

# 3) so5Scores sur Player avec filter UPCOMING / orderBy
print("\n\n=== TEST 3 : so5Scores variantes (upcoming/orderBy) ===\n")
SO5_VARIANTS = [
    "so5Scores(first: 1) { score game { id date } }",
    "so5Scores(last: 2) { score game { id date } }",
    "so5Scores(orderBy: PLAYED_AT_DESC, first: 3) { score game { id date } }",
    "upcomingSo5Scores(first: 1) { __typename }",
    "nextSo5Score { __typename }",
    "so5Score { __typename }",
]
for v in SO5_VARIANTS:
    q = '{ football { player(slug: "%s") { %s } } }' % (SLUG, v)
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message","?")[:180]
        if "doesn't exist" in msg:
            print(f"  ❌ {v[:60]:<60} : n'existe pas")
        else:
            print(f"  ⚠️  {v[:60]:<60} : {msg}")
    else:
        d = (body.get("data") or {}).get("football",{}).get("player",{})
        print(f"  ✅ {v[:60]:<60} : {json.dumps(d)[:300]}")

# 4) anyGame / anyPlayer / so5Leaderboard — root-level candidats
print("\n\n=== TEST 4 : autres root candidats ===\n")
OTHER_ROOTS = [
    'anyGame(id: "%s") { __typename }' % GAME_ID,
    'anyCard(slug: "%s") { __typename }' % SLUG,
    'openFootballSo5Fixtures { __typename }',
    'openSo5Fixture { __typename }',
    'currentSo5Fixture { __typename }',
    'nextFootballSo5Fixture { __typename }',
    'activeClassicFixture { __typename }',
    'currentFootballSo5Fixture { __typename }',
]
for v in OTHER_ROOTS:
    q = '{ football { %s } }' % v
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message","?")[:180]
        if "doesn't exist" in msg:
            print(f"  ❌ {v[:55]:<55} : n'existe pas")
        else:
            print(f"  ⚠️  {v[:55]:<55} : {msg}")
    else:
        print(f"  ✅ {v[:55]:<55} : {json.dumps(body.get('data'))[:250]}")
