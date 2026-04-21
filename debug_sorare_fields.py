#!/usr/bin/env python3
"""
debug_sorare_fields.py — Test a l'aveugle de champs candidats sur Mbappé.
Sorare bloque l'introspection du schema, on tente des noms plausibles.
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

# Test 1 : Le champ actuel utilise par fetch_player_status.py — est-il a jour?
Q1 = '{ football { player(slug: "%s") { displayName nextClassicFixtureProjectedScore nextClassicFixturePlayingStatusOdds { starterOddsBasisPoints } } } }' % SLUG
print("=== TEST 1 : Champ actuel nextClassicFixture* ===")
r = requests.post(URL, json={"query": Q1}, headers=HEADERS, timeout=15)
print(json.dumps(r.json(), indent=2, ensure_ascii=False))

# Test 2 : Candidats alternatifs
CANDIDATES = [
    "upcomingFixtures",
    "upcomingGames",
    "nextFixture",
    "activeFixture",
    "currentFixture",
    "fixtures",
    "games",
    "anyGame",
    "openFixtures",
    "nextFootballFixture",
    "allFixtures",
    "latestFixture",
    "latestGame",
    "nextGame",
    "activePlayingStatus",
    "playingStatusOdds",
    "startingProbability",
    "startingOdds",
    "lineupOdds",
]

print("\n\n=== TEST 2 : Champs candidats (tente chaque sous-champ avec __typename) ===\n")
for cand in CANDIDATES:
    q = '{ football { player(slug: "%s") { %s { __typename } } } }' % (SLUG, cand)
    try:
        r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
        body = r.json()
        if "errors" in body:
            msg = body["errors"][0].get("message", "?")
            # Si le champ existe mais necessite args -> message different
            if "doesn't exist" in msg or "is not defined" in msg or "Unknown" in msg:
                print(f"  ❌ {cand:<30} : n'existe pas")
            else:
                # Champ existe probablement
                print(f"  ⚠️  {cand:<30} : {msg[:100]}")
        else:
            p = (body.get("data") or {}).get("football", {}).get("player") or {}
            print(f"  ✅ {cand:<30} : {json.dumps(p.get(cand))[:120]}")
    except Exception as e:
        print(f"  💥 {cand}: {e}")

# Test 3 : Tester avec args first: N (liste paginee)
print("\n\n=== TEST 3 : Champs avec pagination (first: 3) ===\n")
LIST_CANDIDATES = ["upcomingFixtures", "upcomingGames", "fixtures", "games", "allFixtures"]
for cand in LIST_CANDIDATES:
    q = '{ football { player(slug: "%s") { %s(first: 3) { nodes { __typename } } } } }' % (SLUG, cand)
    try:
        r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
        body = r.json()
        if "errors" in body:
            msg = body["errors"][0].get("message", "?")[:150]
            print(f"  ❌ {cand:<25}(first:3) : {msg}")
        else:
            p = (body.get("data") or {}).get("football", {}).get("player") or {}
            print(f"  ✅ {cand:<25}(first:3) : {json.dumps(p)[:200]}")
    except Exception as e:
        print(f"  💥 {cand}: {e}")

# Test 4 : Interfaces alternatives — peut-etre qu'on passe par AnyPlayer
print("\n\n=== TEST 4 : Essaie anyPlayer (interface alternative) ===\n")
Q_ANY = '{ football { anyPlayer(slug: "%s") { __typename displayName } } }' % SLUG
r = requests.post(URL, json={"query": Q_ANY}, headers=HEADERS, timeout=10)
print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:400])
