#!/usr/bin/env python3
"""debug_lineups_raw.py — dump BRUT de /lineups pour comprendre la structure"""
import requests, json, os, sys
from dotenv import load_dotenv
load_dotenv()

EMAIL    = "damien.gheza@gmail.com"
PASSWORD = os.getenv("SORAREINSIDE_PASSWORD", "")
PLATFORM_API = "https://platform-api.sorareinside.com"

session = requests.Session()
session.headers.update({
    "Origin": "https://sorareinside.com",
    "Referer": "https://sorareinside.com/",
    "User-Agent": "Mozilla/5.0",
    "Content-Type": "application/json",
})
r = session.post(f"{PLATFORM_API}/auth/login",
                 json={"email": EMAIL, "password": PASSWORD}, timeout=30)
print(f"Login: {r.status_code}\n")

GW = "football-21-24-apr-2026"

# ═══════════════════════════════════════════════════════════════════════════
# 1) Raw response de /lineups — on dump tout
# ═══════════════════════════════════════════════════════════════════════════
print("="*80)
print(f"1) RAW /lineups?gameweek_slug={GW}&limit=50")
print("="*80)
r = session.get(f"{PLATFORM_API}/lineups", params={"gameweek_slug": GW, "limit": 50}, timeout=30)
print(f"Status: {r.status_code}")
print(f"Content-Type: {r.headers.get('Content-Type')}")
body = r.text
print(f"\n--- First 2000 chars of response ---")
print(body[:2000])
print(f"\n--- Length: {len(body)} chars ---")

# Parse et analyse
try:
    data = r.json()
    print(f"\n--- TYPE de la racine : {type(data).__name__} ---")
    if isinstance(data, dict):
        print(f"Keys racine: {list(data.keys())}")
        for k, v in data.items():
            if isinstance(v, list):
                print(f"  {k}: list de {len(v)} items")
            elif isinstance(v, dict):
                print(f"  {k}: dict avec keys {list(v.keys())[:5]}")
            else:
                print(f"  {k}: {str(v)[:100]}")
    elif isinstance(data, list):
        print(f"C'est une LIST de {len(data)} items")
        if data:
            first = data[0]
            if isinstance(first, dict):
                print(f"Keys du 1er item: {list(first.keys())}")
                # Groupe par competition
                from collections import Counter
                comps = Counter(it.get("competition_slug", "?") for it in data)
                print(f"\nCompetitions presentes dans les {len(data)} lineups:")
                for comp, n in comps.most_common():
                    print(f"  {comp}: {n}")
                # Trouve les L1
                l1 = [it for it in data if "ligue" in (it.get("competition_slug") or "").lower()]
                if l1:
                    print(f"\n*** LIGUE 1 ({len(l1)} lineups) ***")
                    for i, lineup in enumerate(l1[:5]):
                        print(f"\n  --- L1 Lineup #{i+1} ---")
                        for k in ['id', 'game_id', 'team_id', 'competition_slug', 'gameweek_slug',
                                  'formation', 'notes', 'user_id', 'is_published', 'reliability']:
                            v = lineup.get(k)
                            print(f"    {k}: {str(v)[:100]}")
                else:
                    print(f"\n⚠️  AUCUN lineup Ligue 1 trouve dans les {len(data)} lineups")
                    print("  -> PSG-Nantes pas dans /lineups endpoint non plus")
except Exception as e:
    print(f"\nErreur parsing JSON: {e}")

# ═══════════════════════════════════════════════════════════════════════════
# 2) Pagination : fetch plus de pages pour couvrir tous les lineups
# ═══════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print(f"2) PAGINATION /lineups (fetch jusqu'a 500 lineups)")
print("="*80)
all_lineups = []
for offset in range(0, 500, 50):
    r = session.get(f"{PLATFORM_API}/lineups",
                    params={"gameweek_slug": GW, "limit": 50, "offset": offset}, timeout=30)
    if r.status_code != 200:
        print(f"  offset={offset}: status={r.status_code}")
        break
    body = r.json()
    if isinstance(body, list):
        items = body
    elif isinstance(body, dict):
        items = body.get("data", [])
        if not items:
            # try other common keys
            for k in ["items", "results", "lineups"]:
                if k in body and isinstance(body[k], list):
                    items = body[k]
                    break
    else:
        items = []
    if not items:
        print(f"  offset={offset}: 0 items (fin)")
        break
    all_lineups.extend(items)
    print(f"  offset={offset}: +{len(items)} (total={len(all_lineups)})")
    if len(items) < 50:
        break

# Stats sur tout ce qu'on a
from collections import Counter
comps_all = Counter(it.get("competition_slug", "?") for it in all_lineups)
print(f"\nToutes competitions vues ({len(all_lineups)} lineups total):")
for comp, n in comps_all.most_common():
    print(f"  {comp}: {n}")

# Trouve PSG ou Nantes
print("\n--- Recherche PSG / Nantes / Rennes dans les notes ---")
for kw in ["PSG", "Paris", "Nantes", "Rennes", "psg", "paris"]:
    found = [it for it in all_lineups if kw.lower() in (it.get("notes","") or "").lower()]
    if found:
        print(f"\n  '{kw}' trouve dans {len(found)} lineups:")
        for it in found[:3]:
            print(f"    notes: {it.get('notes','')[:120]}")
            print(f"    competition: {it.get('competition_slug')}")

# ═══════════════════════════════════════════════════════════════════════════
# 3) Essaye /games pour mapper game_id -> teams
# ═══════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("3) /games ou /matches (mapper game_id -> teams)")
print("="*80)
# Prends un game_id du premier lineup
if all_lineups and all_lineups[0].get("game_id"):
    gid = all_lineups[0]["game_id"]
    for ep in [f"/games/{gid}", f"/matches/{gid}", f"/games?gameweek_slug={GW}",
               f"/matches?gameweek_slug={GW}", f"/games?limit=20",
               f"/fixtures?gameweek_slug={GW}"]:
        r = session.get(f"{PLATFORM_API}{ep}", timeout=15)
        if r.status_code == 200:
            body = r.json()
            if isinstance(body, dict):
                print(f"  ✅ 200 {ep:<50} keys={list(body.keys())[:8]}")
            elif isinstance(body, list):
                print(f"  ✅ 200 {ep:<50} list[{len(body)}]")
        elif r.status_code != 404:
            print(f"  ⚠️  {r.status_code} {ep:<50} : {r.text[:100]}")

print("\n✅ Fin du probe raw")
