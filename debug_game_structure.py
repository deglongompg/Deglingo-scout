#!/usr/bin/env python3
"""debug_game_structure.py — dump la structure brute d'UN game pour connaitre les vrais noms de champs"""
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

GW = "football-21-24-apr-2026"

# Fetch 3 games pour voir la structure
print("="*80)
print(f"Dump BRUT de 3 games de {GW}")
print("="*80)
r = session.get(f"{PLATFORM_API}/games", params={"gameweek_slug": GW, "limit": 3}, timeout=30)
print(f"Status: {r.status_code}")
body = r.json()
print(f"\n--- TYPE racine: {type(body).__name__} ---")
if isinstance(body, dict):
    print(f"Keys racine: {list(body.keys())}")
    # Cherche les games dans une clef racine
    for k in body.keys():
        v = body[k]
        if isinstance(v, list):
            print(f"  {k}: list[{len(v)}]")
            if v:
                print(f"\n--- Premier game (dans body['{k}'][0]) ---")
                print(json.dumps(v[0], indent=2, ensure_ascii=False)[:3500])
                break
elif isinstance(body, list):
    print(f"C'est une LIST de {len(body)} games")
    if body:
        print(f"\n--- Premier game complet ---")
        print(json.dumps(body[0], indent=2, ensure_ascii=False)[:3500])
        print(f"\n--- Keys du premier game ---")
        print(list(body[0].keys()))
        # Cherche PSG / Nantes dans les 3 games
        print("\n--- Recherche slug/name contenant paris/nantes dans les 3 games ---")
        for i, g in enumerate(body):
            txt = json.dumps(g, ensure_ascii=False).lower()
            if "paris" in txt or "nantes" in txt:
                print(f"\n  Game #{i} contient paris/nantes :")
                print(json.dumps(g, indent=2, ensure_ascii=False)[:2000])

# Aussi essaye avec un seul game by id (premier trouve)
if isinstance(body, list) and body:
    gid = body[0].get("id")
    if gid:
        print(f"\n\n{'='*80}")
        print(f"Dump BRUT de /games/{gid} (single game endpoint)")
        print("="*80)
        r2 = session.get(f"{PLATFORM_API}/games/{gid}", timeout=15)
        if r2.status_code == 200:
            print(json.dumps(r2.json(), indent=2, ensure_ascii=False)[:3500])

print("\n✅ Fin du probe")
