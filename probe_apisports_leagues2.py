"""Probe round 2 : confirmer xG Eredivisie + tester Sorare slugs."""
import requests, os, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from dotenv import load_dotenv
load_dotenv()

# === API-FOOTBALL : Eredivisie season 2025 ===
BASE = "https://v3.football.api-sports.io"
KEY = os.getenv("API_FOOTBALL_KEY", "")
HEADERS = {"x-apisports-key": KEY}

print("=== Test xG Eredivisie (id=88) season 2025 ===")
r = requests.get(f"{BASE}/fixtures?league=88&season=2025&last=3", headers=HEADERS, timeout=20)
d = r.json()
fix = d.get("response", [])
print(f"Fixtures recentes: {len(fix)}")
for fx in fix[:3]:
    fid = fx.get("fixture", {}).get("id")
    h = fx.get("teams", {}).get("home", {}).get("name")
    a = fx.get("teams", {}).get("away", {}).get("name")
    print(f"  {h} vs {a} (id={fid}) status={fx.get('fixture', {}).get('status', {}).get('short')}")
    r2 = requests.get(f"{BASE}/fixtures/statistics?fixture={fid}", headers=HEADERS, timeout=20)
    fs = r2.json()
    teams = fs.get("response", [])
    for t in teams:
        tname = t.get("team", {}).get("name", "?")
        xg = next((s.get("value") for s in t.get("statistics", []) if s.get("type") == "expected_goals"), None)
        print(f"    {tname:30s} xG={xg}")

# Test Belgium aussi en 2025
print("\n=== Test xG Jupiler Pro League (id=144) season 2025 ===")
r = requests.get(f"{BASE}/fixtures?league=144&season=2025&last=3", headers=HEADERS, timeout=20)
d = r.json()
fix = d.get("response", [])
for fx in fix[:2]:
    fid = fx.get("fixture", {}).get("id")
    h = fx.get("teams", {}).get("home", {}).get("name")
    a = fx.get("teams", {}).get("away", {}).get("name")
    print(f"  {h} vs {a} (id={fid})")
    r2 = requests.get(f"{BASE}/fixtures/statistics?fixture={fid}", headers=HEADERS, timeout=20)
    fs = r2.json()
    teams = fs.get("response", [])
    for t in teams:
        tname = t.get("team", {}).get("name", "?")
        xg = next((s.get("value") for s in t.get("statistics", []) if s.get("type") == "expected_goals"), None)
        print(f"    {tname:30s} xG={xg}")

# Endpoint /teams pour avoir tous les clubs Belgique + Pays-Bas
print("\n=== Clubs Belgique 2025 ===")
r = requests.get(f"{BASE}/teams?league=144&season=2025", headers=HEADERS, timeout=20)
for t in r.json().get("response", []):
    team = t.get("team", {})
    print(f"  ID={team.get('id'):5d}  {team.get('name')}")

print("\n=== Clubs Pays-Bas 2025 ===")
r = requests.get(f"{BASE}/teams?league=88&season=2025", headers=HEADERS, timeout=20)
for t in r.json().get("response", []):
    team = t.get("team", {})
    print(f"  ID={team.get('id'):5d}  {team.get('name')}")
