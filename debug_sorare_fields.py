#!/usr/bin/env python3
"""
debug_sorare_fields.py — GOLDEN HIT probable : Player.playingStatus
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

# 1) Teste playingStatus direct sur Player
print("=== TEST 1 : player.playingStatus (sans sous-sel) ===")
r = requests.post(URL, json={"query": '{ football { player(slug: "%s") { playingStatus } } }' % SLUG}, headers=HEADERS, timeout=10)
print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:400])

print("\n=== TEST 2 : player.playingStatus avec __typename (objet) ===")
r = requests.post(URL, json={"query": '{ football { player(slug: "%s") { playingStatus { __typename } } } }' % SLUG}, headers=HEADERS, timeout=10)
print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:400])

# 2) Candidats de sous-champs sur playingStatus
SUBFIELDS = [
    "status",
    "starterOddsBasisPoints",
    "oddsBasisPoints",
    "starterOdds",
    "probability",
    "starter",
    "startingProbability",
    "__typename",
    "type",
    "value",
    "kind",
]
print("\n=== TEST 3 : sous-champs de playingStatus ===\n")
for sf in SUBFIELDS:
    q = '{ football { player(slug: "%s") { playingStatus { %s } } } }' % (SLUG, sf)
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message","?")[:140]
        if "doesn't exist" in msg or "No field" in msg:
            print(f"  ❌ {sf:<30} : n'existe pas")
        else:
            print(f"  ⚠️  {sf:<30} : {msg}")
    else:
        d = body.get("data", {}).get("football", {}).get("player", {}) or {}
        print(f"  ✅ {sf:<30} : {json.dumps(d.get('playingStatus'))[:180]}")

# 3) Sample plus large de joueurs : qui a un playingStatus ?
print("\n\n=== TEST 4 : sample 10 joueurs (Liga/L1/Bundes) : playingStatus existe? ===\n")
with open("deglingo-scout-app/public/data/players.json") as f:
    players = json.load(f)
sample = (
    [p for p in players if p.get("league") == "Liga"][:3]
    + [p for p in players if p.get("league") == "L1"][:3]
    + [p for p in players if p.get("league") == "Bundes"][:2]
    + [p for p in players if p.get("league") == "PL"][:2]
)
# Query avec quelques sous-champs prometteurs
Q = """query($slug: String!) {
  football {
    player(slug: $slug) {
      displayName
      playingStatus {
        __typename
      }
    }
  }
}"""
for p in sample:
    slug = p.get("slug")
    r = requests.post(URL, json={"query": Q, "variables": {"slug": slug}}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        print(f"  ❌ {p.get('name'):<25} ({p.get('league'):<6}) : {body['errors'][0].get('message','')[:60]}")
    else:
        pp = (body.get("data") or {}).get("football", {}).get("player") or {}
        ps = pp.get("playingStatus")
        print(f"  {'✅' if ps else '⚠️ '} {p.get('name'):<25} ({p.get('league'):<6}) : playingStatus={json.dumps(ps)[:80]}")
