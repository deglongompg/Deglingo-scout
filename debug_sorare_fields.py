#!/usr/bin/env python3
"""
debug_sorare_fields.py — Introspecte le Player Sorare pour trouver
le bon champ titu% (pas limite a Classic).

Usage :
  python3 debug_sorare_fields.py
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
    print("⚠️ Pas d'API key — limite complexity 500")

SLUG = "kylian-mbappe-lottin"

# ── 1) Introspection : tous les champs de Player avec "Odds" ou "Starter" ou "PlayingStatus"
INTROSPECT = """
{
  __type(name: "Player") {
    name
    fields {
      name
      type { name kind ofType { name kind } }
      description
    }
  }
}
"""

print(f"\n📋 Introspection du type Player (champs pertinents)...")
r = requests.post(URL, json={"query": INTROSPECT}, headers=HEADERS, timeout=30)
data = r.json()
fields = (data.get("data") or {}).get("__type", {}).get("fields") or []

relevant = [f for f in fields if any(k in f["name"].lower() for k in ["odds", "starter", "playing", "fixture", "game", "lineup", "probab"])]
print(f"\n{len(relevant)} champs potentiels sur Player :")
for f in relevant:
    t = f["type"]
    type_str = t.get("name") or (t.get("ofType") or {}).get("name") or t.get("kind") or "?"
    print(f"  - {f['name']:<55} -> {type_str}")
    if f.get("description"):
        print(f"      \"{f['description'][:100]}\"")

# ── 2) Test sur Mbappé avec plusieurs champs candidats
print(f"\n\n🎯 Test query Mbappé ({SLUG}) avec tous les champs candidats...")
field_names = [f["name"] for f in relevant if "odd" in f["name"].lower() or "status" in f["name"].lower()]

# Construit une query avec tous les champs qui semblent "safe" (pas d'argument requis)
# On tente avec/sans sous-selection
SAFE_TESTS = [
    "nextClassicFixturePlayingStatusOdds { starterOddsBasisPoints noShowOddsBasisPoints substituteOddsBasisPoints }",
    "activeClub { name }",
]

# On rajoute tous les champs *Odds* / *Fixture* / *Game* / *Lineup* et on tente une sous-selection generique
def build_probe_query(fnames):
    parts = []
    for fn in fnames:
        # On tente une intro sans sous-sel d'abord (sera rejete si obj) puis avec
        parts.append(f'    _{fn}: {fn} {{ __typename }}')
    return "{\n  football {\n    player(slug: \"" + SLUG + "\") {\n      displayName\n" + "\n".join(parts) + "\n    }\n  }\n}"

# Tester un par un pour identifier ceux qui marchent
print(f"\nTest individuel des champs pertinents (peut en rater certains) :")
for fname in field_names:
    q = '{ football { player(slug: "' + SLUG + '") { ' + fname + ' { __typename } } }'
    try:
        rr = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=15)
        body = rr.json()
        if "errors" in body:
            msg = body["errors"][0].get("message", "?")[:80]
            print(f"  ❌ {fname}: {msg}")
        else:
            p = (body.get("data") or {}).get("football", {}).get("player") or {}
            print(f"  ✅ {fname}: {json.dumps(p.get(fname))[:120]}")
    except Exception as e:
        print(f"  💥 {fname}: {e}")

# ── 3) Test query complete sur Mbappé avec les meilleurs candidats
print(f"\n\n🎯 Query complete Mbappé avec tous les champs Odds/Probabilities qu'on connait :")
Q_FULL = """{
  football {
    player(slug: "%s") {
      displayName
      activeClub { name }
      nextClassicFixtureProjectedScore
      nextClassicFixturePlayingStatusOdds {
        starterOddsBasisPoints
        noShowOddsBasisPoints
        substituteOddsBasisPoints
      }
    }
  }
}""" % SLUG

r = requests.post(URL, json={"query": Q_FULL}, headers=HEADERS, timeout=30)
print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:3000])
