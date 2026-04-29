"""Test API-Sports : vérifier xG/PPDA dispos pour les ligues Sorare.
Free tier = 100 req/jour, on consomme ~5 req."""
import requests, os, json
from dotenv import load_dotenv
load_dotenv()

BASE = "https://v3.football.api-sports.io"
KEY = os.getenv("API_FOOTBALL_KEY", "")
HEADERS = {"x-apisports-key": KEY}
print(f"Key loaded: {KEY[:8]}... (len={len(KEY)})")

# 1. Trouver les IDs des ligues qui nous interessent
print("=== Test 1 : /leagues?country=England (req 1) ===")
r = requests.get(f"{BASE}/leagues?country=England&season=2024", headers=HEADERS, timeout=20)
print(f"Status: {r.status_code}")
print(f"Body raw (first 800): {r.text[:800]}")
d = r.json()
for l in d.get("response", [])[:6]:
    league = l.get("league", {})
    print(f"  ID={league.get('id'):4d}  {league.get('name'):30s}  type={league.get('type')}")

# 2. Tester /teams/statistics sur Premier League (id 39)
print("\n=== Test 2 : /teams/statistics PL Arsenal id=42 (req 2) ===")
r = requests.get(f"{BASE}/teams/statistics?league=39&season=2024&team=42", headers=HEADERS, timeout=20)
d = r.json()
resp = d.get("response", {})
# Dump TOUTES les keys pour voir si xG est exposé
def walk(obj, prefix=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, (dict, list)):
                walk(v, prefix + k + ".")
            else:
                if v not in (None, "", 0):
                    print(f"  {prefix}{k} = {str(v)[:60]}")
walk(resp)

# 3. Tester /fixtures/statistics sur 1 match recent (req 3)
print("\n=== Test 3 : /fixtures/statistics sample match (req 3) ===")
r = requests.get(f"{BASE}/fixtures?league=39&season=2024&last=1", headers=HEADERS, timeout=20)
fd = r.json()
fix = fd.get("response", [])
if fix:
    fid = fix[0].get("fixture", {}).get("id")
    print(f"  Fixture ID: {fid}")
    r2 = requests.get(f"{BASE}/fixtures/statistics?fixture={fid}", headers=HEADERS, timeout=20)
    fs = r2.json()
    teams = fs.get("response", [])
    if teams:
        print(f"  Team 1 stats:")
        for stat in teams[0].get("statistics", [])[:30]:
            print(f"    {stat.get('type'):30s} = {stat.get('value')}")

