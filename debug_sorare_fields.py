#!/usr/bin/env python3
"""
debug_sorare_fields.py — Introspection ciblee :
1) Liste tous les types Player/Football du schema
2) Pour chaque, liste les champs contenant 'odds' 'starter' 'playing' 'fixture'
3) Test sur Mbappé
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

# 1) Liste des types contenant 'Player'
Q1 = '{ __schema { types { name kind } } }'
r = requests.post(URL, json={"query": Q1}, headers=HEADERS, timeout=30)
types = (r.json().get("data") or {}).get("__schema", {}).get("types") or []
relevant_types = [t["name"] for t in types if t["name"] and ("Player" in t["name"] or "Odds" in t["name"] or "Fixture" in t["name"])]
print(f"📋 Types pertinents ({len(relevant_types)}):")
for t in relevant_types:
    print(f"   - {t}")

# 2) Pour chaque type Player-like, lister tous les champs
def introspect_type(name):
    q = '{ __type(name: "%s") { name fields { name type { name kind ofType { name kind ofType { name } } } } } }' % name
    rr = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=15)
    return ((rr.json().get("data") or {}).get("__type") or {})

print(f"\n\n🔍 Champs pertinents (odds/starter/playing/fixture/game/lineup/probab) par type :\n")
for tname in relevant_types:
    t = introspect_type(tname)
    fields = t.get("fields") or []
    if not fields: continue
    hits = [f for f in fields if any(k in f["name"].lower() for k in ["odds","starter","playing","fixture","game","lineup","probab","starting"])]
    if not hits: continue
    print(f"\n=== {tname} ===")
    for f in hits:
        ty = f.get("type") or {}
        # remonter le ofType
        name = ty.get("name") or (ty.get("ofType") or {}).get("name") or (ty.get("ofType") or {}).get("ofType", {}).get("name") or ty.get("kind")
        print(f"   - {f['name']:<50} → {name}")

# 3) Test direct sur Mbappé avec une query qui liste les games a venir
print(f"\n\n🎯 Test query 'games'/'upcomingFixtures'/'fixtures' sur Mbappé :\n")
probes = [
    '{ football { player(slug: "kylian-mbappe-lottin") { __typename } } }',
    # Tests basiques si on trouve des champs dans les types ci-dessus
]
for q in probes:
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=15)
    print(f"Q: {q[:100]}")
    print(f"R: {json.dumps(r.json(), ensure_ascii=False)[:500]}\n")

# 4) Ultra brute force : on tente de lister tous les champs du type retourne par player(slug)
# Comme c'est un PlayerInterface, on cherche le type concret
print("🧪 Query ultra-large pour voir TOUT ce que player retourne :\n")
BROAD = """{
  football {
    player(slug: "kylian-mbappe-lottin") {
      __typename
      ... on Player {
        displayName
      }
    }
  }
}"""
r = requests.post(URL, json={"query": BROAD}, headers=HEADERS, timeout=15)
print(json.dumps(r.json(), ensure_ascii=False, indent=2)[:500])
