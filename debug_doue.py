#!/usr/bin/env python3
"""debug_doue.py — ultime chasse : so5Fixture + competition + routes proprietaires"""
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

# 1) competition / so5Fixture — explorer le namespace football et so5
print("=== TEST 1 : namespace so5 / competition ===\n")
ROOT_PROBES = [
    "so5 { __typename }",
    "so5Fixture { __typename }",
    "so5Fixtures { __typename }",
    "classicSo5Fixture { __typename }",
    "currentSo5Fixture { __typename }",
    "so5Lineups { __typename }",
    "competition { __typename }",
    "competitions { __typename }",
    "currentCompetition { __typename }",
    "activeCompetition { __typename }",
]
for p in ROOT_PROBES:
    q = '{ football { %s } }' % p
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message","?")[:180]
        if "doesn't exist" not in msg:
            print(f"  ⚠️  {p[:50]:<50} : {msg}")
    else:
        print(f"  ✅ {p[:50]:<50} : {json.dumps(body.get('data'))[:200]}")

# 2) Scraper la page Sorare du joueur en HTTP direct (frontend public)
print("\n=== TEST 2 : SCRAPE page Sorare Doue (frontend) ===\n")
import urllib.request, re
PLAYER_URL = "https://sorare.com/football/players/desire-doue"
try:
    req = urllib.request.Request(PLAYER_URL, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        html = resp.read().decode("utf-8", errors="ignore")
    # Cherche les __NEXT_DATA__ qui contient toutes les data de la page
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if m:
        next_data = m.group(1)
        print(f"   __NEXT_DATA__ trouve ({len(next_data)} bytes)")
        # Cherche des patterns lies aux odds
        for keyword in ["starterOdds", "playingStatusOdds", "Odds", "Probability", "40", "basisPoints"]:
            hits = [m2.start() for m2 in re.finditer(keyword, next_data)][:3]
            if hits:
                for h in hits:
                    snippet = next_data[max(0,h-80):h+120]
                    print(f"   🎯 '{keyword}' trouve: ...{snippet}...")
    else:
        print("   Pas de __NEXT_DATA__ dans la page")
        # Cherche des appels GraphQL ou autre pattern
        for keyword in ["playingStatusOdds", "starterOdds", "40%", "basisPoints"]:
            hits = [m2.start() for m2 in re.finditer(keyword, html)][:3]
            if hits:
                for h in hits:
                    snippet = html[max(0,h-100):h+200]
                    print(f"   🎯 '{keyword}': ...{snippet}...")
except Exception as e:
    print(f"   ❌ Erreur scrape: {e}")

# 3) Chercher directement le endpoint interne Sorare (API REST pas GraphQL)
print("\n=== TEST 3 : endpoints REST potentiels ===\n")
for path in [
    "/api/v1/football/players/desire-doue",
    "/api/football/players/desire-doue/odds",
    "/_next/data/BUILD_ID/football/players/desire-doue.json",
]:
    try:
        req = urllib.request.Request(f"https://sorare.com{path}", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"   {resp.status} {path[:60]}: {resp.read()[:200]}")
    except Exception as e:
        print(f"   ❌ {path[:60]}: {str(e)[:80]}")
