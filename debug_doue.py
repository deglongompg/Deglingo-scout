#!/usr/bin/env python3
"""debug_doue.py — Game par UUID nu + club.upcomingGames + dernieres tentatives"""
import requests, json, os
from dotenv import load_dotenv

load_dotenv()
URL = "https://api.sorare.com/federation/graphql"
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
key = os.getenv("SORARE_API_KEY", "")
if key:
    HEADERS["APIKEY"] = key
    print("🔑 API key active\n")

UUID = "db595776-a88c-4846-ae43-83473161e4d1"
GAME_RELAY = f"Game:{UUID}"

# 1) football.game avec differents formats d'id
print("=== TEST 1 : football.game avec plusieurs formats d'ID ===\n")
for gid in [UUID, GAME_RELAY, f"FootballGame:{UUID}", f"FootballRegularGame:{UUID}"]:
    q = '{ football { game(id: "%s") { __typename id } } }' % gid
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        print(f"  ❌ id={gid!r:<60} : {body['errors'][0].get('message','?')[:100]}")
    else:
        d = (body.get("data") or {}).get("football",{})
        print(f"  ✅ id={gid!r:<60} : {json.dumps(d)[:200]}")

# 2) club(slug: "paris").upcomingGames avec sous-champs odds
print("\n=== TEST 2 : club.upcomingGames + sous-champs ===\n")
# Chercher slug du PSG
Q_CLUB = '{ football { club(slug: "paris-saint-germain") { name upcomingGames(first: 3) { id date homeTeam { name } awayTeam { name } } } } }'
r = requests.post(URL, json={"query": Q_CLUB}, headers=HEADERS, timeout=15)
print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:800])

# 3) Si on a un Game directement, tester tous ses sous-champs potentiels
print("\n=== TEST 3 : sous-champs Game via upcomingGames ===\n")
GAME_SUBFIELDS = [
    "id",
    "date",
    "competition { displayName }",
    "gameWeek { id }",
    "playingStatusOddsList { __typename }",
    "playingStatusOdds(playerSlug: \"desire-doue\") { starterOddsBasisPoints }",
    "playerStatusOdds { __typename }",
    "startingLineups { __typename }",
    "playerOdds { __typename }",
    "odds { __typename }",
    "so5Scores(first: 3) { __typename }",
    "lineup { __typename }",
    "homeLineup { __typename }",
]
for sf in GAME_SUBFIELDS:
    q = '{ football { club(slug: "paris-saint-germain") { upcomingGames(first: 1) { id %s } } } }' % sf
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message","?")[:180]
        if "doesn't exist" in msg:
            print(f"  ❌ {sf[:60]:<60} : n'existe pas")
        else:
            print(f"  ⚠️  {sf[:60]:<60} : {msg}")
    else:
        d = body.get("data") or {}
        # Juste regarder si la data est non-trivial (pas null/empty)
        print(f"  ✅ {sf[:60]:<60} : {json.dumps(d)[:300]}")

# 4) Recherche du slug correct pour PSG (variantes)
print("\n=== TEST 4 : trouve le slug du club PSG ===\n")
for club_slug in ["paris-saint-germain", "paris-saint-germain-fc", "psg", "paris-sg"]:
    q = '{ football { club(slug: "%s") { name slug } } }' % club_slug
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=5)
    body = r.json()
    if "errors" not in body:
        d = (body.get("data") or {}).get("football",{}).get("club")
        if d:
            print(f"  ✅ slug={club_slug!r} -> {d}")
