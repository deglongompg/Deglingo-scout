#!/usr/bin/env python3
"""
debug_sorare_fields.py — 1) Confirme les valeurs possibles de playingStatus
2) Cherche encore un champ % precis (odds) a cote
"""
import requests, json, os
from collections import Counter
from dotenv import load_dotenv

load_dotenv()
URL = "https://api.sorare.com/federation/graphql"
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
key = os.getenv("SORARE_API_KEY", "")
if key:
    HEADERS["APIKEY"] = key
    print("🔑 API key active\n")

# 1) Sample 50 joueurs (toutes ligues) - quelle est la distribution de playingStatus?
print("=== TEST 1 : distribution playingStatus sur 50 joueurs ===\n")
with open("deglingo-scout-app/public/data/players.json") as f:
    players = json.load(f)
# Priorite : clubs jouant mid-week (Liga, L1 PSG, PL)
midweek_clubs = ["Real Madrid", "FC Barcelona", "Paris Saint-Germain", "Atlético de Madrid",
                 "Manchester City FC", "FC Metz", "Nottingham Forest FC", "Burnley FC"]
sample = []
for c in midweek_clubs:
    sample.extend([p for p in players if p.get("club") == c][:5])
sample = sample[:50]

Q = 'query($s:String!){football{player(slug:$s){displayName playingStatus}}}'
stats = Counter()
results = []
for p in sample:
    r = requests.post(URL, json={"query": Q, "variables": {"s": p["slug"]}}, headers=HEADERS, timeout=10)
    body = r.json()
    pp = (body.get("data") or {}).get("football", {}).get("player") or {}
    ps = pp.get("playingStatus")
    stats[ps] += 1
    results.append((p.get("name"), p.get("club"), ps))

# Resume par club
print("Distribution des valeurs :")
for ps, n in stats.most_common():
    print(f"  {ps}: {n}")
print()
print("Detail (20 premiers) :")
for name, club, ps in results[:20]:
    print(f"  {name:<25} {club:<25} -> {ps}")

# 2) Cherche un champ odds % scoped au prochain match (pas Classic)
print("\n\n=== TEST 2 : cherche champ odds % scoped au next match ===\n")
CANDIDATES = [
    "nextGamePlayingStatusOdds",
    "playingStatusOddsForNextGame",
    "activePlayingStatusOdds",
    "upcomingPlayingStatusOdds",
    "startingOddsBasisPoints",
    "oddsBasisPoints",
    "playingOdds",
    "playingStatusOdds",
]
for c in CANDIDATES:
    q = '{ football { player(slug: "kylian-mbappe-lottin") { %s { starterOddsBasisPoints } } } }' % c
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message","?")[:120]
        if "doesn't exist" in msg:
            print(f"  ❌ {c:<35} : n'existe pas")
        else:
            print(f"  ⚠️  {c:<35} : {msg}")
    else:
        d = body.get("data", {}).get("football", {}).get("player", {}) or {}
        print(f"  ✅ {c:<35} : {json.dumps(d.get(c))[:150]}")

# 3) Teste variantes sans sous-sel (peut-etre scalar)
print("\n\n=== TEST 3 : champs scalar % (sans sous-sel) ===\n")
SCALAR_CANDIDATES = [
    "starterOddsBasisPoints",
    "playingStatusOddsBasisPoints",
    "startingProbability",
    "startingOdds",
    "starterOdds",
    "lineupProbability",
    "titularisationOdds",
]
for c in SCALAR_CANDIDATES:
    q = '{ football { player(slug: "kylian-mbappe-lottin") { %s } } }' % c
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message","?")[:120]
        if "doesn't exist" in msg:
            print(f"  ❌ {c:<35} : n'existe pas")
        else:
            print(f"  ⚠️  {c:<35} : {msg}")
    else:
        d = body.get("data", {}).get("football", {}).get("player", {}) or {}
        print(f"  ✅ {c:<35} : {json.dumps(d.get(c))[:150]}")
