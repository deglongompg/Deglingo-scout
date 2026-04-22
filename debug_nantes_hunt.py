#!/usr/bin/env python3
"""debug_nantes_hunt.py — chasse au PSG-Nantes (mid-week, non-Classic Sorare)
HYPOTHESE : /games ne retourne que les matchs Classic weekend.
Les matchs mid-week sont ailleurs. On cherche comment Sorare.com les fetche.
"""
import requests, json, os
from dotenv import load_dotenv
load_dotenv()

EMAIL    = "damien.gheza@gmail.com"
PASSWORD = os.getenv("SORAREINSIDE_PASSWORD", "")
PLATFORM_API = "https://platform-api.sorareinside.com"
FRONTEND = "https://sorareinside.com"

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
# 1) Cherche TOUTES les occurrences de "nantes" dans les 272 games
# ═══════════════════════════════════════════════════════════════════════════
print("="*80)
print("1) Recherche 'nantes' dans les 272 games de GW72")
print("="*80)
r = session.get(f"{PLATFORM_API}/games",
                params={"gameweek_slug": "football-21-24-apr-2026", "limit": 300}, timeout=30)
body = r.json()
found_nantes = []
for region in (body if isinstance(body, list) else []):
    for comp in region.get("competitions", []):
        for g in comp.get("games", []):
            txt = json.dumps(g, ensure_ascii=False).lower()
            if "nantes" in txt:
                found_nantes.append((comp.get("slug"), g))

print(f"  {len(found_nantes)} games contiennent 'nantes' :")
for cs, g in found_nantes:
    ht = (g.get("homeTeam",{}) or {}).get("name","?")
    at = (g.get("awayTeam",{}) or {}).get("name","?")
    print(f"    [{cs}] {ht} vs {at} @ {g.get('date')}")
    print(f"         game_id = {g.get('id')}")

# ═══════════════════════════════════════════════════════════════════════════
# 2) Test endpoints alternatifs (/matches, /fixtures, /predictions)
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'='*80}")
print("2) Endpoints alternatifs pour trouver PSG-Nantes")
print("="*80)
TEAM_SLUG_PSG = "psg-paris"
TEAM_SLUG_NANTES = "nantes-la-chapelle-sur-erdre"  # vu dans Rennes-Nantes avant
ENDPOINTS = [
    f"/matches",
    f"/matches?limit=50",
    f"/matches?date=2026-04-22",
    f"/fixtures",
    f"/fixtures?limit=50",
    f"/fixtures?team_slug={TEAM_SLUG_PSG}",
    f"/fixtures?team_slug={TEAM_SLUG_NANTES}",
    f"/games?team_slug={TEAM_SLUG_PSG}",
    f"/games?team_slug={TEAM_SLUG_NANTES}",
    f"/games?home_team_slug={TEAM_SLUG_PSG}",
    f"/games/search?q=psg-nantes",
    f"/games/search?q=paris",
    f"/teams/{TEAM_SLUG_PSG}/games",
    f"/teams/{TEAM_SLUG_PSG}/fixtures",
    f"/teams/{TEAM_SLUG_PSG}/next-game",
    f"/teams/{TEAM_SLUG_PSG}/upcoming-games",
    f"/teams/{TEAM_SLUG_PSG}",
    f"/predictions/next-game/{TEAM_SLUG_PSG}",
    f"/non-classic-games",
    f"/non-classic/games",
    f"/mid-week/games",
    f"/midweek-games",
    f"/all-games?limit=50",
    f"/all-matches?limit=50",
]
for ep in ENDPOINTS:
    try:
        r = session.get(f"{PLATFORM_API}{ep}", timeout=15)
        if r.status_code == 200:
            body = r.json()
            if isinstance(body, list):
                n = len(body)
                sample = body[0] if body else None
            elif isinstance(body, dict):
                n = body.get("count", "?")
                sample = body.get("data", body.get("games", body.get("matches", body)))
                if isinstance(sample, list):
                    n = len(sample)
            else:
                n = "?"
                sample = None
            keys = list(sample.keys())[:8] if isinstance(sample, dict) else None
            print(f"  ✅ 200 {ep:<55} -> n={n} keys={keys}")
        elif r.status_code != 404 and r.status_code != 400:
            print(f"  {r.status_code} {ep}")
    except Exception as e:
        pass

# ═══════════════════════════════════════════════════════════════════════════
# 3) Scrape la page publique Sorareinside qui affiche les matchs pour voir quel endpoint elle hit
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'='*80}")
print("3) Scrape le HTML de sorareinside.com pour voir les appels API")
print("="*80)
for url in [
    f"{FRONTEND}/",
    f"{FRONTEND}/matches/2026-04-23",
    f"{FRONTEND}/fixtures/2026-04-23",
    f"{FRONTEND}/games/2026-04-23",
    f"{FRONTEND}/schedule/2026-04-23",
]:
    try:
        r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        if r.status_code == 200 and "html" in r.headers.get("Content-Type","").lower():
            # Cherche des URLs d'API dans le HTML
            html = r.text
            import re
            api_urls = set(re.findall(r'[\'"](https?://[^\'"]*sorareinside[^\'"]*)[\'"]', html))
            api_urls.update(re.findall(r'[\'"]/(api[^\'"]*)[\'"]', html))
            # Cherche des references a psg/nantes/team/match
            psg_mentions = [m for m in re.findall(r'"([^"]*psg[^"]*)"', html.lower()) if "psg" in m][:5]
            print(f"\n  {url}")
            print(f"    HTML size: {len(html)}")
            if api_urls:
                print(f"    API URLs trouvees (max 5):")
                for u in list(api_urls)[:5]:
                    print(f"      {u}")
            if psg_mentions:
                print(f"    PSG mentions: {psg_mentions[:3]}")
    except Exception as e:
        print(f"    ❌ {url}: {str(e)[:80]}")

# ═══════════════════════════════════════════════════════════════════════════
# 4) Recherche team PSG et ses games via team_id
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'='*80}")
print("4) Cherche PSG directement dans /teams")
print("="*80)
for ep in [f"/teams", f"/teams?slug=psg-paris", f"/teams/psg-paris",
          f"/teams/search?q=paris-saint-germain"]:
    r = session.get(f"{PLATFORM_API}{ep}", timeout=15)
    if r.status_code == 200:
        body = r.json()
        if isinstance(body, list):
            psg_teams = [t for t in body if "paris" in str(t.get("slug","")).lower() or "psg" in str(t.get("slug","")).lower()]
            print(f"  ✅ 200 {ep} -> {len(body)} teams (PSG matches: {len(psg_teams)})")
            for t in psg_teams[:3]:
                print(f"      {t}")
        elif isinstance(body, dict):
            print(f"  ✅ 200 {ep} -> keys={list(body.keys())[:8]}")

print("\n✅ Fin du probe")
