#!/usr/bin/env python3
"""
debug_sorare_fields.py — Test simple : query Mbappé tel quel, voir la reponse.
"""
import requests, json, os, sys
from dotenv import load_dotenv

load_dotenv()

URL = "https://api.sorare.com/federation/graphql"
API_KEY = os.getenv("SORARE_API_KEY", "")
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
if API_KEY:
    HEADERS["APIKEY"] = API_KEY
    print("🔑 API key active")
else:
    print("⚠️ Pas d'API key")

# Test sur 4 joueurs : 2 Liga (prob. null), 2 autres ligues (prob. OK) pour comparaison
SLUGS = [
    ("kylian-mbappe-lottin",      "Mbappé (Real Madrid, Liga)"),
    ("lamine-yamal",              "Yamal (Barça, Liga)"),
    ("ousmane-dembele",           "Dembélé (PSG, L1)"),
    ("jobe-bellingham",           "Jobe Bellingham (Dortmund, Bundes)"),
]

Q = """query($slug: String!) {
  football {
    player(slug: $slug) {
      displayName
      activeClub { name }
      activeInjuries   { active }
      activeSuspensions { active }
      nextClassicFixtureProjectedScore
      nextClassicFixturePlayingStatusOdds { starterOddsBasisPoints }
    }
  }
}"""

print(f"\n🎯 Test query identique a fetch_player_status.py (ancienne version)")
print("=" * 75)
for slug, label in SLUGS:
    r = requests.post(URL, json={"query": Q, "variables": {"slug": slug}}, headers=HEADERS, timeout=30)
    body = r.json()
    if "errors" in body:
        print(f"\n{label}")
        print(f"  ❌ ERREUR: {body['errors']}")
        continue
    p = ((body.get("data") or {}).get("football") or {}).get("player") or {}
    print(f"\n{label}  (slug={slug})")
    print(f"  displayName         : {p.get('displayName')}")
    print(f"  activeClub          : {(p.get('activeClub') or {}).get('name')}")
    print(f"  activeInjuries      : {p.get('activeInjuries')}")
    print(f"  activeSuspensions   : {p.get('activeSuspensions')}")
    print(f"  projectedScore      : {p.get('nextClassicFixtureProjectedScore')}")
    odds = p.get('nextClassicFixturePlayingStatusOdds')
    if odds is None:
        print(f"  playingStatusOdds   : ❌ NULL (pas de titu%)")
    else:
        bp = odds.get('starterOddsBasisPoints')
        pct = round(bp / 100) if bp is not None else None
        print(f"  playingStatusOdds   : ✅ {pct}% (basisPoints={bp})")

# Test GLOBAL : combien de joueurs Liga dans la DB retournent quoi
print(f"\n\n🔬 Test sur 50 joueurs Liga aleatoires pour voir la proportion")
print("=" * 75)
with open("deglingo-scout-app/public/data/players.json") as f:
    players = json.load(f)
import random
liga = [p for p in players if p.get("league") == "Liga"]
sample = random.sample(liga, min(50, len(liga)))

with_titu, without_titu, null_playerobj = 0, 0, 0
errors_list = []
for p in sample:
    slug = p.get("slug")
    if not slug: continue
    try:
        r = requests.post(URL, json={"query": Q, "variables": {"slug": slug}}, headers=HEADERS, timeout=15)
        body = r.json()
        if "errors" in body:
            errors_list.append(f"{p.get('name')}: {body['errors'][0].get('message','?')[:60]}")
            continue
        pp = ((body.get("data") or {}).get("football") or {}).get("player")
        if pp is None:
            null_playerobj += 1
            continue
        odds = pp.get("nextClassicFixturePlayingStatusOdds")
        if odds and odds.get("starterOddsBasisPoints") is not None:
            with_titu += 1
        else:
            without_titu += 1
    except Exception as e:
        errors_list.append(f"{p.get('name')}: {e}")

print(f"  ✅ Avec titu%              : {with_titu}/50")
print(f"  ❌ Sans titu% (odds null)  : {without_titu}/50")
print(f"  ⚠️  Player object null     : {null_playerobj}/50")
if errors_list:
    print(f"  🐛 Erreurs ({len(errors_list)}):")
    for e in errors_list[:5]:
        print(f"     - {e}")
