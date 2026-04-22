#!/usr/bin/env python3
"""debug_find_real_endpoint_v2.py — probe plus cible
=====================================================
Apres probe v1, on sait :
- /gameweeks existe et retourne 50 GWs (il y en a plus que les "football-X-Y-month-year")
- /lineups existe mais demande gameweek_slug (underscore, pas camelCase)
- Chaque lineup a competition_slug (premier-league-gb-eng, austrian-bundesliga, ligue-1-fr ?)

On teste :
1) Dump /gameweeks pour voir TOUS les slugs et trouver celui qui contient PSG-Nantes
2) /lineups?gameweek_slug=X&competition_slug=ligue-1-fr (filtre par competition)
3) /lineups?gameweek_slug=X (sans filtre comp) pour voir si on a des lineups L1
4) Pour chaque lineup L1 trouve, liste les players
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

# ═══════════════════════════════════════════════════════════════════════════
# 1) LISTE TOUS LES GAMEWEEKS
# ═══════════════════════════════════════════════════════════════════════════
print("="*80)
print("1) /gameweeks — tous les slugs disponibles")
print("="*80)
r = session.get(f"{PLATFORM_API}/gameweeks", timeout=30)
if r.status_code == 200:
    data = r.json()
    items = data.get("data", data) if isinstance(data, dict) else data
    if isinstance(items, list):
        print(f"  {len(items)} gameweeks retournes")
        for gw in items[:30]:
            slug = gw.get("slug", "?")
            display = gw.get("shortDisplayName", gw.get("displayName", "?"))
            state = gw.get("aasmState", "?")
            live = gw.get("live", "?")
            print(f"    slug={slug:<40} state={state:<12} live={live} display={display}")

# ═══════════════════════════════════════════════════════════════════════════
# 2) /lineups avec gameweek_slug (underscore)
# ═══════════════════════════════════════════════════════════════════════════
GW = "football-21-24-apr-2026"
print(f"\n{'='*80}")
print(f"2) /lineups?gameweek_slug={GW}  (underscore)")
print("="*80)
r = session.get(f"{PLATFORM_API}/lineups", params={"gameweek_slug": GW, "limit": 50}, timeout=30)
print(f"  Status: {r.status_code}")
if r.status_code == 200:
    data = r.json()
    items = data.get("data", data) if isinstance(data, dict) else data
    if isinstance(items, list):
        print(f"  {len(items)} lineups retournes")
        # Compte par competition
        from collections import Counter
        comps = Counter(l.get("competition_slug", "?") for l in items)
        print(f"  Competitions presents :")
        for comp, n in comps.most_common():
            print(f"    {comp}: {n} lineups")
        # Dump sample L1 si dispo
        l1 = [l for l in items if "ligue" in (l.get("competition_slug") or "").lower()]
        print(f"\n  Lineups L1 trouves : {len(l1)}")
        for i, lineup in enumerate(l1[:3]):
            print(f"\n  --- L1 Lineup #{i+1} (id={lineup.get('id','?')[:8]}...) ---")
            for k, v in lineup.items():
                vs = str(v)[:150]
                print(f"    {k}: {vs}")

# ═══════════════════════════════════════════════════════════════════════════
# 3) Meme requete mais filtre competition_slug
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'='*80}")
print("3) /lineups avec filtre competition_slug=ligue-1-fr")
print("="*80)
for comp_slug in ["ligue-1-fr", "ligue-1-france", "ligue-1", "fr-ligue-1"]:
    r = session.get(f"{PLATFORM_API}/lineups",
                    params={"gameweek_slug": GW, "competition_slug": comp_slug, "limit": 20}, timeout=20)
    n = "?"
    if r.status_code == 200:
        data = r.json()
        items = data.get("data", data) if isinstance(data, dict) else data
        n = len(items) if isinstance(items, list) else "?"
    print(f"  {r.status_code} competition_slug={comp_slug:<20} -> n={n}")

# ═══════════════════════════════════════════════════════════════════════════
# 4) /lineups/{id} pour voir la structure complete d'une lineup
# ═══════════════════════════════════════════════════════════════════════════
# Prend le premier lineup_id vu
print(f"\n{'='*80}")
print("4) Structure complete d'UN lineup + ses players")
print("="*80)
r = session.get(f"{PLATFORM_API}/lineups", params={"gameweek_slug": GW, "limit": 1}, timeout=30)
if r.status_code == 200:
    data = r.json()
    items = data.get("data", data) if isinstance(data, dict) else data
    if items:
        lineup_id = items[0].get("id")
        print(f"  Test sur lineup id={lineup_id}\n")
        for endpoint in [f"/lineups/{lineup_id}",
                         f"/lineups/{lineup_id}/players",
                         f"/lineups/{lineup_id}/linedup-players",
                         f"/lineups/linedup-players?lineup_id={lineup_id}",
                         f"/lineups/linedup-players?lineupId={lineup_id}"]:
            r2 = session.get(f"{PLATFORM_API}{endpoint}", timeout=15)
            if r2.status_code == 200:
                body = r2.json()
                if isinstance(body, list):
                    n = len(body)
                    sample_keys = list(body[0].keys())[:10] if body else []
                elif isinstance(body, dict):
                    if "data" in body and isinstance(body["data"], list):
                        n = len(body["data"])
                        sample_keys = list(body["data"][0].keys())[:10] if body["data"] else []
                    else:
                        n = "?"
                        sample_keys = list(body.keys())[:10]
                else:
                    n = "?"
                    sample_keys = []
                print(f"  ✅ 200 {endpoint:<60} -> n={n} keys={sample_keys}")
            elif r2.status_code != 404:
                print(f"  ⚠️  {r2.status_code} {endpoint:<60} : {r2.text[:100]}")

# ═══════════════════════════════════════════════════════════════════════════
# 5) Recherche de joueurs specifiques (peut-etre accessible via un playerId)
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'='*80}")
print("5) Recherche de Barcola/Kaba via endpoints players")
print("="*80)
for ep in ["/players",
           "/players/search?q=barcola",
           "/players/search?name=barcola",
           "/players?slug=bradley-barcola",
           "/players/bradley-barcola",
           "/players/bradley-barcola/predictions",
           "/linedup-players?player_slug=bradley-barcola"]:
    try:
        r = session.get(f"{PLATFORM_API}{ep}", timeout=10)
        if r.status_code == 200:
            body = r.json()
            if isinstance(body, dict) and "data" in body:
                n = len(body["data"]) if isinstance(body["data"], list) else "?"
            elif isinstance(body, list):
                n = len(body)
            else:
                n = "?"
            print(f"  ✅ 200 {ep:<50} -> n={n}")
        elif r.status_code != 404:
            print(f"  ⚠️  {r.status_code} {ep}")
    except Exception as e:
        pass

print("\n✅ Fin du probe v2")
