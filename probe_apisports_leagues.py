"""Probe API-Football : trouve IDs Belgique + Pays-Bas + verifier xG dispo via /fixtures/statistics."""
import requests, os, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from dotenv import load_dotenv
load_dotenv()

BASE = "https://v3.football.api-sports.io"
KEY = os.getenv("API_FOOTBALL_KEY", "")
HEADERS = {"x-apisports-key": KEY}
print(f"Key: {KEY[:8]}... (len={len(KEY)})")

# 1. Trouver Belgique + Pays-Bas
for country in ["Belgium", "Netherlands"]:
    print(f"\n=== {country} leagues 2024 ===")
    r = requests.get(f"{BASE}/leagues?country={country}&season=2024", headers=HEADERS, timeout=20)
    d = r.json()
    for l in d.get("response", [])[:10]:
        league = l.get("league", {})
        season = (l.get("seasons") or [{}])[-1]
        cur = "[CURRENT]" if season.get("current") else ""
        print(f"  ID={league.get('id'):4d}  {league.get('name'):40s} type={league.get('type')} {cur}")

# 2. Test xG sur fixture Belgique / Pays-Bas (pour confirmer dispo dans tier Pro)
print("\n=== Test xG Jupiler Pro League (Belgium id=144 supposé) ===")
r = requests.get(f"{BASE}/fixtures?league=144&season=2024&last=2", headers=HEADERS, timeout=20)
fd = r.json()
fix = fd.get("response", [])
print(f"Fixtures recentes Belgium: {len(fix)}")
if fix:
    fid = fix[0].get("fixture", {}).get("id")
    h = fix[0].get("teams", {}).get("home", {}).get("name")
    a = fix[0].get("teams", {}).get("away", {}).get("name")
    print(f"  Sample fixture: {h} vs {a} (id={fid})")
    r2 = requests.get(f"{BASE}/fixtures/statistics?fixture={fid}", headers=HEADERS, timeout=20)
    fs = r2.json()
    teams = fs.get("response", [])
    if teams:
        for t in teams:
            tname = t.get("team", {}).get("name", "?")
            xg = next((s.get("value") for s in t.get("statistics", []) if (s.get("type") or "").lower() in ("expected_goals", "expected goals", "xg")), None)
            print(f"    {tname:25s} xG={xg}")
            # Dump tous les types pour comprendre
            for s in t.get("statistics", [])[:25]:
                print(f"      {s.get('type'):35s} = {s.get('value')}")
            break

# 3. Test Eredivisie (id 88 supposé)
print("\n=== Test xG Eredivisie (Netherlands id=88 supposé) ===")
r = requests.get(f"{BASE}/fixtures?league=88&season=2024&last=2", headers=HEADERS, timeout=20)
fd = r.json()
fix = fd.get("response", [])
print(f"Fixtures recentes NL: {len(fix)}")
if fix:
    fid = fix[0].get("fixture", {}).get("id")
    h = fix[0].get("teams", {}).get("home", {}).get("name")
    a = fix[0].get("teams", {}).get("away", {}).get("name")
    print(f"  Sample fixture: {h} vs {a} (id={fid})")
    r2 = requests.get(f"{BASE}/fixtures/statistics?fixture={fid}", headers=HEADERS, timeout=20)
    fs = r2.json()
    teams = fs.get("response", [])
    if teams:
        for t in teams:
            tname = t.get("team", {}).get("name", "?")
            xg = next((s.get("value") for s in t.get("statistics", []) if (s.get("type") or "").lower() in ("expected_goals", "expected goals", "xg")), None)
            print(f"    {tname:25s} xG={xg}")
