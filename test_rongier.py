# test_rongier.py
# Lance: python3 test_rongier.py

import requests, json

URL = "https://api.sorare.com/federation/graphql"
H = {"Content-Type": "application/json"}

# Test 1: Check activePlayers count for Rennes
print("=== TEST 1: activePlayers Rennes ===")
q1 = """
query {
  football {
    club(slug: "stade-rennais-fc") {
      name
      activePlayers(first: 50) {
        nodes { slug displayName position }
      }
    }
  }
}
"""

r = requests.post(URL, json={"query": q1}, headers=H, timeout=30)
data = r.json()
try:
    players = data["data"]["football"]["club"]["activePlayers"]["nodes"]
    print(f"Rennes activePlayers: {len(players)}")
    rongier_found = False
    for p in players:
        flag = " ← RONGIER!" if "rongier" in p["displayName"].lower() else ""
        print(f"  {p['displayName']:25s} | {p['position']:10s} | {p['slug']}{flag}")
        if "rongier" in p["displayName"].lower():
            rongier_found = True
    if not rongier_found:
        print("\n  ❌ Rongier PAS dans activePlayers de Rennes")
except:
    print(f"  Error: {json.dumps(data, indent=2)[:500]}")

# Test 2: Direct slug search
print("\n=== TEST 2: Recherche directe par slug ===")
for slug in ["valentin-rongier", "valentin-rongier-20001212", "v-rongier"]:
    q2 = f"""
    query {{
      football {{
        player(slug: "{slug}") {{
          displayName
          position
          activeClub {{ name slug }}
          so5Scores(last: 3) {{ score }}
        }}
      }}
    }}
    """
    r2 = requests.post(URL, json={"query": q2}, headers=H, timeout=30)
    d2 = r2.json()
    try:
        p = d2["data"]["football"]["player"]
        if p:
            print(f"  ✅ Trouvé avec slug '{slug}':")
            print(f"     {p['displayName']} | {p['position']} | {p['activeClub']['name']}")
            print(f"     Scores: {[s['score'] for s in p['so5Scores']]}")
            break
        else:
            print(f"  ❌ slug '{slug}' → null")
    except:
        print(f"  ❌ slug '{slug}' → error")

# Test 3: Also check Tolisso and other missing players
print("\n=== TEST 3: Autres joueurs manquants ===")
for slug in ["corentin-tolisso", "tolisso", "c-tolisso"]:
    q3 = f"""
    query {{
      football {{
        player(slug: "{slug}") {{
          displayName
          position
          activeClub {{ name slug }}
          so5Scores(last: 3) {{ score }}
        }}
      }}
    }}
    """
    r3 = requests.post(URL, json={"query": q3}, headers=H, timeout=30)
    d3 = r3.json()
    try:
        p = d3["data"]["football"]["player"]
        if p:
            print(f"  ✅ {p['displayName']} | {p['position']} | {p['activeClub']['name']}")
            print(f"     Scores: {[s['score'] for s in p['so5Scores']]}")
            break
        else:
            print(f"  ❌ slug '{slug}' → null")
    except:
        print(f"  ❌ slug '{slug}' → error")

# Test 4: Check Lens (only 1 player in our base!)
print("\n=== TEST 4: RC Lens activePlayers ===")
q4 = """
query {
  football {
    club(slug: "rc-lens") {
      name
      activePlayers(first: 50) {
        nodes { slug displayName position }
      }
    }
  }
}
"""
r4 = requests.post(URL, json={"query": q4}, headers=H, timeout=30)
d4 = r4.json()
try:
    players = d4["data"]["football"]["club"]["activePlayers"]["nodes"]
    print(f"Lens activePlayers: {len(players)}")
    for p in players[:10]:
        print(f"  {p['displayName']:25s} | {p['position']}")
except:
    print(f"  Error: {json.dumps(d4, indent=2)[:500]}")

print("\n=== DONE ===")
