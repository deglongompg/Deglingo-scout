#!/usr/bin/env python3
"""debug_games_approach.py — valide l'approche /games -> /lineups par game_id"""
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
# 1) Liste tous les games du GW
# ═══════════════════════════════════════════════════════════════════════════
print("="*80)
print(f"1) /games?gameweek_slug={GW} — tous les matchs")
print("="*80)
r = session.get(f"{PLATFORM_API}/games", params={"gameweek_slug": GW, "limit": 100}, timeout=30)
games = []
if r.status_code == 200:
    body = r.json()
    if isinstance(body, list):
        games = body
    elif isinstance(body, dict):
        for k in ["games", "data", "items"]:
            if k in body and isinstance(body[k], list):
                games = body[k]
                break
    print(f"  {len(games)} games trouves\n")
    for g in games:
        ht = g.get("homeTeam", {})
        at = g.get("awayTeam", {})
        comp = g.get("competition", {})
        ht_name = ht.get("displayName") or ht.get("name") or ht.get("slug") or "?"
        at_name = at.get("displayName") or at.get("name") or at.get("slug") or "?"
        comp_name = comp.get("displayName") or comp.get("slug") or "?"
        print(f"    {g.get('id','?')[:8]}... {comp_name:<30} {ht_name} vs {at_name} @ {g.get('date','?')}")

# ═══════════════════════════════════════════════════════════════════════════
# 2) Trouve PSG-Nantes (ou autre match L1)
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'='*80}")
print("2) Identification du match PSG-Nantes")
print("="*80)
psg_game = None
l1_games = []
for g in games:
    ht = g.get("homeTeam", {}) or {}
    at = g.get("awayTeam", {}) or {}
    comp = g.get("competition", {}) or {}
    comp_slug = (comp.get("slug") or "").lower()
    ht_slug = (ht.get("slug") or "").lower()
    at_slug = (at.get("slug") or "").lower()
    # PSG-Nantes
    if ("paris" in ht_slug or "paris" in at_slug) and ("nantes" in ht_slug or "nantes" in at_slug):
        psg_game = g
        print(f"  ✅ PSG-Nantes trouve !")
        print(f"     game_id: {g.get('id')}")
        print(f"     home: {ht.get('displayName','?')} (slug={ht.get('slug')})")
        print(f"     away: {at.get('displayName','?')} (slug={at.get('slug')})")
        print(f"     date: {g.get('date')}")
    # tous les matchs L1
    if "ligue-1" in comp_slug or "fr" in comp_slug:
        l1_games.append(g)

if not psg_game:
    print(f"  ⚠️  PSG-Nantes pas trouve dans les {len(games)} games")
print(f"\n  Matchs L1 identifies : {len(l1_games)}")
for g in l1_games:
    ht = g.get("homeTeam",{}).get("displayName", "?")
    at = g.get("awayTeam",{}).get("displayName", "?")
    print(f"    {ht} vs {at}")

# ═══════════════════════════════════════════════════════════════════════════
# 3) Fetch les lineups pour le game_id PSG-Nantes (si trouve)
# ═══════════════════════════════════════════════════════════════════════════
if psg_game:
    gid = psg_game["id"]
    print(f"\n{'='*80}")
    print(f"3) Fetch lineups pour PSG-Nantes (game_id={gid})")
    print("="*80)
    # Essaye different params
    for params in [
        {"gameweek_slug": GW, "game_id": gid, "limit": 50},
        {"game_id": gid, "limit": 50},
        {"gameweek_slug": GW, "gameId": gid, "limit": 50},
    ]:
        r = session.get(f"{PLATFORM_API}/lineups", params=params, timeout=30)
        if r.status_code == 200:
            body = r.json()
            n = body.get("count", "?") if isinstance(body, dict) else "?"
            lineups = body.get("lineups", []) if isinstance(body, dict) else (body if isinstance(body, list) else [])
            print(f"  ✅ params={params} -> count={n} lineups={len(lineups)}")
            if lineups:
                # Groupe par team
                from collections import Counter
                teams = Counter(l.get("team_slug", "?") for l in lineups)
                print(f"    Teams: {dict(teams)}")
                # Premier lineup
                first = lineups[0]
                print(f"    Sample lineup: team={first.get('team_slug')} formation={first.get('formation')} reliability={first.get('reliability')}")
                lid = first.get("id")

                # Essaye d'extraire les players de cette lineup
                print(f"\n  --- Test endpoints pour les players de lineup {lid[:8]}... ---")
                for ep in [
                    f"/lineups/linedup-players?lineup_id={lid}&limit=50",
                    f"/lineups/linedup-players?lineupId={lid}&limit=50",
                    f"/lineups/linedup-players?lineup_ids={lid}&limit=50",
                    f"/lineups/{lid}/linedup-players?limit=50",
                    f"/lineups/{lid}/players",
                ]:
                    r2 = session.get(f"{PLATFORM_API}{ep}", timeout=15)
                    if r2.status_code == 200:
                        body2 = r2.json()
                        if isinstance(body2, list):
                            n2 = len(body2)
                            slugs = set(it.get("players",{}).get("slug","?") for it in body2 if isinstance(it, dict))
                        elif isinstance(body2, dict):
                            items2 = body2.get("data", body2.get("linedUpPlayers", body2.get("players", [])))
                            if isinstance(items2, list):
                                n2 = len(items2)
                                slugs = set(it.get("players",{}).get("slug","?") if isinstance(it.get("players"), dict) else "?"
                                           for it in items2 if isinstance(it, dict))
                            else:
                                n2 = "?"
                                slugs = set()
                        else:
                            n2 = "?"
                            slugs = set()
                        print(f"    ✅ 200 {ep}")
                        print(f"       n={n2} slugs_uniques={len(slugs)} sample={list(slugs)[:8]}")
                    elif r2.status_code != 404:
                        print(f"    ⚠️  {r2.status_code} {ep[:70]}")
            break
        else:
            print(f"  ⚠️  {r.status_code} params={params}")
            print(f"    body={r.text[:150]}")

print("\n✅ Fin du probe")
