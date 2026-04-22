#!/usr/bin/env python3
"""debug_sorareinside_endpoints.py — trouve l'endpoint qui contient aussi les subs"""
import requests, os, sys
from dotenv import load_dotenv

load_dotenv()
EMAIL    = "damien.gheza@gmail.com"
PASSWORD = os.getenv("SORAREINSIDE_PASSWORD", "")
PLATFORM_API = "https://platform-api.sorareinside.com"

if not PASSWORD:
    print("❌ SORAREINSIDE_PASSWORD manquant dans .env")
    sys.exit(1)

# Login
session = requests.Session()
session.headers.update({
    "Origin": "https://sorareinside.com",
    "Referer": "https://sorareinside.com/",
    "User-Agent": "Mozilla/5.0",
    "Content-Type": "application/json",
})
r = session.post(f"{PLATFORM_API}/auth/login",
                 json={"email": EMAIL, "password": PASSWORD}, timeout=30)
print(f"Login: {r.status_code}")
print(f"Cookies: {list(session.cookies.keys())}")

# GW en cours
GW_SLUG = "football-21-24-apr-2026"

# Teste pleins d'endpoints
ENDPOINTS = [
    "/lineups/linedup-players",
    "/lineups/predicted-players",
    "/lineups/substitutes",
    "/lineups/benched-players",
    "/lineups/all-players",
    "/lineups/predictions",
    "/lineups/players",
    "/lineups",
    "/lineups/teams",
    "/lineups/roster",
    "/lineups/squad",
    "/lineups/expectedPlayers",
    "/lineups/expected-players",
    "/players/predictions",
    "/players/lineup",
    "/players",
    "/predictions",
    "/predictions/players",
    "/predictions/lineup",
]

for ep in ENDPOINTS:
    url = f"{PLATFORM_API}{ep}"
    r = session.get(url, params={"gameweekSlug": GW_SLUG, "limit": 50}, timeout=15)
    body = r.text[:200]
    status = r.status_code
    try:
        js = r.json()
        if isinstance(js, list):
            summary = f"LIST[{len(js)}]"
            if js and isinstance(js[0], dict):
                summary += f" keys={list(js[0].keys())[:5]}"
        elif isinstance(js, dict):
            if "data" in js and isinstance(js["data"], list):
                summary = f"dict.data LIST[{len(js['data'])}]"
                if js["data"] and isinstance(js["data"][0], dict):
                    summary += f" keys={list(js['data'][0].keys())[:6]}"
            else:
                summary = f"dict keys={list(js.keys())[:6]}"
        else:
            summary = str(js)[:100]
    except Exception:
        summary = body
    flag = "✅" if status == 200 else "❌"
    print(f"  {flag} {status} {ep:<40} : {summary[:250]}")

# Special : fetch linedup-players et cherche Doué
print("\n\n=== CHECK : Doué dans /lineups/linedup-players pour PSG vs Nantes ===")
r = session.get(f"{PLATFORM_API}/lineups/linedup-players",
                params={"gameweekSlug": GW_SLUG, "limit": 500}, timeout=30)
if r.status_code == 200:
    data = r.json()
    items = data.get("data", data) if isinstance(data, dict) else data
    print(f"Total items: {len(items)}")
    psg_items = [i for i in items if isinstance(i, dict) and
                 (i.get("players", {}).get("slug") == "desire-doue" or
                  i.get("players", {}).get("slug") == "bradley-barcola" or
                  i.get("players", {}).get("slug") == "fabian-ruiz-pena" or
                  i.get("players", {}).get("slug") == "ousmane-dembele")]
    print(f"Slugs PSG trouves: {len(psg_items)}")
    for i in psg_items:
        p = i.get("players", {})
        print(f"  {p.get('slug')}: confidence={i.get('confidence_percentage')}% is_bench={i.get('is_bench')} is_alternate={i.get('is_alternate')}")
