#!/usr/bin/env python3
"""debug_find_real_endpoint.py — Trouve le bon endpoint Sorareinside
================================================================
Le probleme actuel : /lineups/linedup-players?gameweekSlug=X retourne seulement
~60 slugs uniques, PSG/Rennes/Nantes pas dedans.

Ce script teste plusieurs hypotheses :
1. Dump de la structure 'lineups' nested (pour comprendre ce qu'est 1 lineup)
2. Liste les lineup_ids uniques dans les 1000 premiers items
3. Teste des endpoints alternatifs (/lineups, /matches, /fixtures, /predictions...)
4. Cherche des params alternatifs (leagueId, competitionId, matchId...)
5. Verifie si Barcola/Merlin/Kaba existent via recherche directe
"""
import requests, json, os, sys
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
print(f"Cookies: {list(session.cookies.keys())}\n")

GW_MID  = "football-21-24-apr-2026"
GW_WEEK = "football-24-28-apr-2026"

# ═══════════════════════════════════════════════════════════════════════════
# 1) DUMP STRUCTURE 'lineups' NESTED
# ═══════════════════════════════════════════════════════════════════════════
print("="*80)
print("1) DUMP d'UN item complet (voir structure 'lineups' nested)")
print("="*80)
r = session.get(f"{PLATFORM_API}/lineups/linedup-players",
                params={"gameweekSlug": GW_WEEK, "limit": 1, "offset": 0}, timeout=30)
if r.status_code == 200:
    data = r.json()
    items = data.get("data", data) if isinstance(data, dict) else data
    if items:
        print(json.dumps(items[0], indent=2, ensure_ascii=False)[:3000])
else:
    print(f"  Error {r.status_code}: {r.text[:300]}")

# ═══════════════════════════════════════════════════════════════════════════
# 2) COMPTER LINEUP_IDS UNIQUES DANS LES 1000 PREMIERS ITEMS
# ═══════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("2) LINEUP_IDS uniques dans les 1000 premiers items")
print("="*80)
all_lineup_ids = set()
lineup_info = {}  # lineup_id -> sample lineup object
for offset in range(0, 1000, 50):
    r = session.get(f"{PLATFORM_API}/lineups/linedup-players",
                    params={"gameweekSlug": GW_WEEK, "limit": 50, "offset": offset}, timeout=30)
    if r.status_code != 200: break
    data = r.json()
    items = data.get("data", data) if isinstance(data, dict) else data
    if not items: break
    for it in items:
        lid = it.get("lineup_id")
        if lid:
            all_lineup_ids.add(lid)
            if lid not in lineup_info:
                lineup_info[lid] = it.get("lineups")
    if len(items) < 50: break

print(f"  {len(all_lineup_ids)} lineup_ids uniques sur 1000 items")
# Affiche sample lineup info
for i, (lid, lineup) in enumerate(list(lineup_info.items())[:5]):
    print(f"\n  --- Lineup #{i+1} (id={lid}) ---")
    if isinstance(lineup, dict):
        for k, v in lineup.items():
            vs = str(v)[:100]
            print(f"    {k}: {vs}")
    else:
        print(f"    {str(lineup)[:300]}")

# ═══════════════════════════════════════════════════════════════════════════
# 3) TEST D'ENDPOINTS ALTERNATIFS
# ═══════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("3) Test d'endpoints alternatifs (chercher plus de joueurs)")
print("="*80)
ENDPOINTS_TO_TEST = [
    # Sans filter gameweekSlug
    ("/lineups/linedup-players", {"limit": 10}),
    # Avec variations
    ("/lineups",                  {"gameweekSlug": GW_WEEK, "limit": 10}),
    ("/lineups",                  {"limit": 10}),
    ("/matches",                  {"gameweekSlug": GW_WEEK, "limit": 10}),
    ("/matches",                  {"limit": 10}),
    ("/fixtures",                 {"gameweekSlug": GW_WEEK, "limit": 10}),
    ("/fixtures",                 {"limit": 10}),
    ("/gameweeks",                {}),
    ("/gameweeks/current",        {}),
    ("/gameweeks/upcoming",       {}),
    ("/competitions",             {}),
    ("/predictions",              {"gameweekSlug": GW_WEEK, "limit": 10}),
    ("/predictions/all",          {"gameweekSlug": GW_WEEK, "limit": 10}),
    ("/lineups/all",              {"gameweekSlug": GW_WEEK, "limit": 10}),
    ("/lineups/by-match",         {"gameweekSlug": GW_WEEK, "limit": 10}),
    ("/starting-xi",              {"gameweekSlug": GW_WEEK, "limit": 10}),
    ("/player-odds",              {"gameweekSlug": GW_WEEK, "limit": 10}),
]

for ep, params in ENDPOINTS_TO_TEST:
    try:
        r = session.get(f"{PLATFORM_API}{ep}", params=params, timeout=15)
        if r.status_code == 200:
            body = r.json()
            if isinstance(body, list):
                n = len(body)
                sample = body[0] if body else None
            elif isinstance(body, dict):
                if "data" in body and isinstance(body["data"], list):
                    n = len(body["data"])
                    sample = body["data"][0] if body["data"] else None
                else:
                    n = "?"
                    sample = body
            else:
                n = "?"
                sample = None
            keys = list(sample.keys())[:6] if isinstance(sample, dict) else None
            print(f"  ✅ 200 {ep:<30} params={params}  -> n={n} keys={keys}")
        elif r.status_code == 404:
            pass  # skip silencieux, 404 = endpoint n'existe pas
        else:
            print(f"  ⚠️  {r.status_code} {ep:<30} : {r.text[:100]}")
    except Exception as e:
        print(f"  ❌ ERR {ep:<30} : {str(e)[:80]}")

# ═══════════════════════════════════════════════════════════════════════════
# 4) CHERCHE DIRECTEMENT LES JOUEURS PSG/RENNES/NANTES
# ═══════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("4) Recherche directe de joueurs PSG/Rennes/Nantes dans tous endpoints 200")
print("="*80)
TARGET_SLUGS = ["bradley-barcola", "mohamed-kaba", "esteban-lepaul",
                "quentin-merlin", "desire-doue"]
# Essaye /players/{slug} ou /players?slug=...
for slug in TARGET_SLUGS:
    for ep in [f"/players/{slug}",
               f"/players?slug={slug}",
               f"/players/search?q={slug}",
               f"/lineups/linedup-players?playerSlug={slug}",
               f"/lineups/by-player?slug={slug}"]:
        try:
            r = session.get(f"{PLATFORM_API}{ep}", timeout=10)
            if r.status_code == 200:
                body = r.json()
                print(f"  ✅ 200 {ep}")
                print(f"      {json.dumps(body, ensure_ascii=False)[:300]}")
        except Exception:
            pass

print("\n✅ Fin du probe")
