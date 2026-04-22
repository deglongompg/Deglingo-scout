#!/usr/bin/env python3
"""debug_kaba.py — voir d'ou sortent les titu% pour Kaba et Barcola"""
import requests, json, os
from dotenv import load_dotenv

load_dotenv()

# 1) Data actuelle dans players.json (ce qui est affiche)
print("=== 1) DATA ACTUELLE dans players.json ===\n")
with open('deglingo-scout-app/public/data/players.json') as f:
    players = json.load(f)
for n in ['kaba', 'barcola', 'doue']:
    matches = [p for p in players if n in (p.get('slug','') + p.get('name','')).lower()]
    for p in matches[:3]:
        print(f"  slug={p.get('slug'):<35} name={p.get('name'):<25} club={p.get('club'):<25} titu={p.get('sorare_starter_pct')}% injured={p.get('injured')} suspended={p.get('suspended')}")

# 2) Test direct Sorare API : query player avec tout pour voir ce que Sorare retourne
print("\n\n=== 2) SORARE API direct (injured/suspended/playingStatus) ===\n")
URL = "https://api.sorare.com/federation/graphql"
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
key = os.getenv("SORARE_API_KEY", "")
if key: HEADERS["APIKEY"] = key

# Find Kaba's slug from our DB first
target_players = [p for p in players if 'kaba' in (p.get('slug','') + p.get('name','')).lower() and p.get('club') in ['FC Nantes', 'Nantes']]
print(f"Nantes Kabas trouves: {len(target_players)}")
for p in target_players[:3]:
    slug = p.get('slug')
    if not slug: continue
    Q = '{ football { player(slug: "%s") { displayName playingStatus activeInjuries { active } activeSuspensions { active } nextClassicFixturePlayingStatusOdds { starterOddsBasisPoints } } } }' % slug
    r = requests.post(URL, json={"query": Q}, headers=HEADERS, timeout=10)
    print(f"  {slug}: {json.dumps(r.json(), ensure_ascii=False)[:400]}")

# Barcola
print("\n--- Barcola Sorare API ---")
Q = '{ football { player(slug: "bradley-barcola") { displayName playingStatus activeInjuries { active } activeSuspensions { active } nextClassicFixturePlayingStatusOdds { starterOddsBasisPoints } } } }'
r = requests.post(URL, json={"query": Q}, headers=HEADERS, timeout=10)
print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:500])

# 3) Test direct Sorareinside : cherche Kaba et Barcola dans les 2 GWs upcoming
print("\n\n=== 3) SORAREINSIDE : cherche slugs dans les GW ===\n")
EMAIL = "damien.gheza@gmail.com"
PASSWORD = os.getenv("SORAREINSIDE_PASSWORD", "")
PLATFORM_API = "https://platform-api.sorareinside.com"

session = requests.Session()
session.headers.update({"Origin": "https://sorareinside.com", "Referer": "https://sorareinside.com/", "User-Agent": "Mozilla/5.0", "Content-Type": "application/json"})
r = session.post(f"{PLATFORM_API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
print(f"Login: {r.status_code}")

for gw in ["football-21-24-apr-2026", "football-24-28-apr-2026"]:
    print(f"\n--- GW {gw} ---")
    all_items = []
    for offset in range(0, 2500, 50):
        r = session.get(f"{PLATFORM_API}/lineups/linedup-players", params={"gameweekSlug": gw, "limit": 50, "offset": offset}, timeout=20)
        if r.status_code != 200:
            break
        items = r.json().get("data", r.json()) if isinstance(r.json(), dict) else r.json()
        if not isinstance(items, list) or not items:
            break
        all_items.extend(items)
        if len(items) < 50: break
    print(f"Total items: {len(all_items)}")

    # Cherche Kaba + Barcola + Doue dans la data
    for search in ['kaba', 'barcola', 'doue']:
        matching = []
        for it in all_items:
            pl = it.get('players') or {}
            slug = pl.get('slug','')
            name = pl.get('display_name','') or pl.get('displayName','')
            if search in (slug + name).lower():
                matching.append((slug, name, it.get('confidence_percentage'), it.get('is_bench'), it.get('is_dnp'), it.get('is_alternate')))
        if matching:
            print(f"  '{search}' -> {len(matching)} matches:")
            for (s, n, c, b, d, a) in matching:
                print(f"    slug={s:<35} name={n:<25} conf={c}% bench={b} dnp={d} alt={a}")
        else:
            print(f"  '{search}' -> 0 matches")
