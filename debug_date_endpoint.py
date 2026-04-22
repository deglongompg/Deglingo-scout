#!/usr/bin/env python3
"""debug_date_endpoint.py — Sorareinside UI filtre par DATE, pas par GW !
Teste /games et /lineups avec params date-based.

Indice : screenshot 2026-04-22 montre 'jeu 23' (MY) = mercredi 22 soir Europe
avec 1 match L1 (PSG-Nantes), 2 PL, 3 Liga, 3 Bundes, 11 MLS = ~20 games
"""
import requests, json, os
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

# PSG-Nantes : mercredi 22 avril soir Paris = jeudi 23 avril Malaisie
# Teste les 2 dates UTC potentielles
TARGET_DATES = ["2026-04-22", "2026-04-23"]

# ═══════════════════════════════════════════════════════════════════════════
# 1) Test de paramètres DATE sur /games
# ═══════════════════════════════════════════════════════════════════════════
print("="*80)
print("1) /games avec differents params date-based")
print("="*80)
for date in TARGET_DATES:
    for params in [
        {"date": date, "limit": 100},
        {"kickoff_date": date, "limit": 100},
        {"from_date": date, "to_date": date, "limit": 100},
        {"from": date, "to": date, "limit": 100},
        {"start_date": date, "end_date": date, "limit": 100},
        {"day": date, "limit": 100},
        {"match_date": date, "limit": 100},
    ]:
        r = session.get(f"{PLATFORM_API}/games", params=params, timeout=20)
        n_regions = "?"
        n_games = 0
        psg_found = False
        if r.status_code == 200:
            body = r.json()
            if isinstance(body, list):
                n_regions = len(body)
                for region in body:
                    for comp in (region.get("competitions") or []):
                        for g in (comp.get("games") or []):
                            n_games += 1
                            ht = (g.get("homeTeam") or {}).get("slug","").lower()
                            at = (g.get("awayTeam") or {}).get("slug","").lower()
                            if ("paris" in ht+at or "psg" in ht+at) and "nantes" in ht+at:
                                psg_found = True
            elif isinstance(body, dict):
                # Peut-etre {data: [...]} ou autre wrapper
                for k, v in body.items():
                    if isinstance(v, list):
                        n_regions = f"dict.{k}[{len(v)}]"
        star = "⭐" if psg_found else ""
        if r.status_code == 200 and n_games > 0:
            print(f"  {star} ✅ 200 params={params} -> regions={n_regions} games={n_games} PSG-Nantes={'✅' if psg_found else '❌'}")
        elif r.status_code != 200 and r.status_code != 400:
            print(f"    {r.status_code} params={params}")

# ═══════════════════════════════════════════════════════════════════════════
# 2) Dump structure complete du 1er game de jeu 23 si trouve
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'='*80}")
print("2) Test /games sans GW (maybe returns ALL)")
print("="*80)
r = session.get(f"{PLATFORM_API}/games", params={"limit": 100}, timeout=20)
print(f"Status: {r.status_code}")
if r.status_code == 200:
    body = r.json()
    if isinstance(body, list):
        print(f"  {len(body)} regions retournees")
        # Count games
        n = sum(len(comp.get("games", [])) for region in body for comp in region.get("competitions", []))
        print(f"  {n} games total\n")
        # Cherche PSG-Nantes
        for region in body:
            for comp in (region.get("competitions") or []):
                for g in (comp.get("games") or []):
                    ht = (g.get("homeTeam") or {}).get("slug","").lower()
                    at = (g.get("awayTeam") or {}).get("slug","").lower()
                    if ("paris" in ht+at or "psg" in ht+at) and "nantes" in ht+at:
                        print(f"  ✅ PSG-Nantes trouve !")
                        print(f"     date={g.get('date')} game_id={g.get('id')}")
                        print(f"     competition={(g.get('competition') or {}).get('slug')}")

# ═══════════════════════════════════════════════════════════════════════════
# 3) Test /lineups avec date
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'='*80}")
print("3) /lineups avec params date-based")
print("="*80)
for date in TARGET_DATES:
    for params in [
        {"date": date, "limit": 50},
        {"kickoff_date": date, "limit": 50},
        {"match_date": date, "limit": 50},
    ]:
        r = session.get(f"{PLATFORM_API}/lineups", params=params, timeout=20)
        if r.status_code == 200:
            body = r.json()
            if isinstance(body, dict):
                n = body.get("count", len(body.get("lineups", [])))
                print(f"  ✅ 200 params={params} -> count={n}")
            else:
                print(f"  ✅ 200 params={params} -> {type(body).__name__}")

# ═══════════════════════════════════════════════════════════════════════════
# 4) Fetch les 2 GWs adjacentes et cherche PSG-Nantes
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'='*80}")
print("4) Scan complet GW72 (mid-week) + GW73 (weekend) pour PSG-Nantes")
print("="*80)
for gw in ["football-21-24-apr-2026", "football-24-28-apr-2026", "football-17-21-apr-2026"]:
    r = session.get(f"{PLATFORM_API}/games", params={"gameweek_slug": gw, "limit": 200}, timeout=30)
    if r.status_code != 200:
        continue
    body = r.json()
    all_games = []
    for region in (body if isinstance(body, list) else []):
        for comp in region.get("competitions", []):
            for g in comp.get("games", []):
                all_games.append((comp.get("slug"), g))
    n_l1 = sum(1 for cs, _ in all_games if cs == "ligue-1-fr")
    psg_games = [(cs, g) for cs, g in all_games
                 if "paris" in (g.get("homeTeam",{}) or {}).get("slug","").lower() + (g.get("awayTeam",{}) or {}).get("slug","").lower()
                 or "psg" in (g.get("homeTeam",{}) or {}).get("slug","").lower() + (g.get("awayTeam",{}) or {}).get("slug","").lower()]
    print(f"\n  GW {gw}: {len(all_games)} games, {n_l1} en L1")
    if psg_games:
        print(f"    Matchs PSG : {len(psg_games)}")
        for cs, g in psg_games:
            ht = (g.get('homeTeam',{}) or {}).get('name','?')
            at = (g.get('awayTeam',{}) or {}).get('name','?')
            print(f"      [{cs}] {ht} vs {at} @ {g.get('date')}")

print("\n✅ Fin du probe date")
