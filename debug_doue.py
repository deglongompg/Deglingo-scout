#!/usr/bin/env python3
"""debug_doue.py — player.stats au lieu de player.status !"""
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

# 1) D'abord: verifie que stats existe et voir son __typename
print("=== TEST 1 : player.stats __typename ===")
r = requests.post(URL, json={"query": '{ football { player(slug: "%s") { stats { __typename } } } }' % SLUG},
                  headers=HEADERS, timeout=10)
print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:400])

# 2) Probe plein de sous-champs sur stats
print("\n\n=== TEST 2 : sous-champs de player.stats ===\n")
STATS_FIELDS = [
    "playingStatus",
    "playingStatusOdds",
    "nextFixturePlayingStatusOdds",
    "nextClassicFixturePlayingStatusOdds",
    "starterOddsBasisPoints",
    "playingStatusOddsBasisPoints",
    "nextGamePlayingStatusOdds",
    "lineupProbability",
    "startingProbability",
    "startingOdds",
    "upcomingFixtureOdds",
    "lastFifteenSo5Appearances",
    "projectedScore",
    "__typename",
]
for sf in STATS_FIELDS:
    # Tente d'abord sans sous-sel (scalar)
    q_scalar = '{ football { player(slug: "%s") { stats { %s } } } }' % (SLUG, sf)
    r = requests.post(URL, json={"query": q_scalar}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message", "?")[:200]
        if "doesn't exist" in msg or "No field" in msg:
            print(f"  ❌ stats.{sf:<45} : n'existe pas")
        elif "must have" in msg or "selections" in msg:
            # Objet — tente avec __typename
            q_obj = '{ football { player(slug: "%s") { stats { %s { __typename } } } }' % (SLUG, sf)
            r2 = requests.post(URL, json={"query": q_obj}, headers=HEADERS, timeout=10)
            body2 = r2.json()
            if "errors" in body2:
                print(f"  ⚠️  stats.{sf:<45} : OBJET mais {body2['errors'][0].get('message','?')[:80]}")
            else:
                d = (body2.get("data") or {}).get("football",{}).get("player",{}) or {}
                print(f"  ✅ stats.{sf:<45} : OBJET {json.dumps(d.get('stats'))[:120]}")
        else:
            print(f"  ⚠️  stats.{sf:<45} : {msg}")
    else:
        d = (body.get("data") or {}).get("football", {}).get("player", {}) or {}
        print(f"  ✅ stats.{sf:<45} : {json.dumps(d.get('stats'))[:180]}")

# 3) Query large : on tente stats avec TOUS les champs probables d'un coup
print("\n\n=== TEST 3 : query stats avec playingStatus ===\n")
r = requests.post(URL, json={"query": '{ football { player(slug: "%s") { displayName stats { playingStatus lastFifteenSo5Appearances } } } }' % SLUG},
                  headers=HEADERS, timeout=10)
print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:600])
