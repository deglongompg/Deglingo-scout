"""Test Sportmonks : structure stats team-level pour voir xG/PPDA."""
import requests, os, json
from dotenv import load_dotenv
load_dotenv()
BASE = "https://api.sportmonks.com/v3/football"
KEY = os.getenv("API_SPORTMONKS_KEY", "")
PARAMS = {"api_token": KEY}

# 1. Trouver les saisons actives de Scottish Premiership
r = requests.get(f"{BASE}/leagues/501", params={**PARAMS, "include": "seasons"}, timeout=20)
d = r.json()
seasons = d.get("data", {}).get("seasons", [])
current = next((s for s in seasons if s.get("is_current")), seasons[-1] if seasons else None)
print(f"Saison courante Premiership : {current.get('id')} {current.get('name')}")
season_id = current.get("id")

# 2. Liste les types de stats Sportmonks (endpoint /types)
print("\n=== /types (search xG/PPDA/press) ===")
r = requests.get(f"{BASE}/types", params=PARAMS, timeout=20)
d = r.json()
types = d.get("data", []) if "data" in d else []
print(f"Total types : {len(types)}")
keywords = ["xg", "expected", "ppda", "pressure", "press", "tackle", "intercept", "high turnover"]
matched = [t for t in types if any(k in (t.get("name","") + " " + t.get("code","")).lower() for k in keywords)]
print(f"Types avec mots-cles relevants: {len(matched)}")
for t in matched[:30]:
    print(f"  ID={t.get('id'):4d}  code={t.get('code','')[:35]:35s}  name={t.get('name','')[:50]}")

# 3. Stats d'une team / saison via endpoint dedié
print("\n=== /teams/{id}?include=statistics.details (search xG/PPDA in raw) ===")
# Get une team de Premiership
r = requests.get(f"{BASE}/teams/seasons/{season_id}", params=PARAMS, timeout=20)
d = r.json()
teams = d.get("data", [])
if teams:
    tid = teams[0].get("id")
    tname = teams[0].get("name")
    print(f"Team: {tname} (id={tid})")
    # Stats
    r2 = requests.get(f"{BASE}/teams/{tid}", params={**PARAMS, "include": "statistics.details.type"}, timeout=20)
    td = r2.json().get("data", {})
    stats = td.get("statistics", [])
    print(f"Stats blocks : {len(stats)}")
    # Cherche les details avec mots-cles
    for stat_block in stats[:1]:
        for det in stat_block.get("details", [])[:50]:
            type_info = det.get("type", {})
            type_name = (type_info.get("name") or "").lower()
            type_code = (type_info.get("code") or "").lower()
            if any(k in type_name or k in type_code for k in keywords):
                print(f"  TROUVE: type={type_info.get('name')}  code={type_info.get('code')}  value={det.get('value')}")
