#!/usr/bin/env python3
"""
Fetch live standings for L1, PL, Liga, Bundesliga from football-data.org.
Generates standings.json for Deglingo Scout (affiche dans le panneau Calendrier).

Usage:
  python3 fetch_standings.py
  # ou
  FOOTBALL_DATA_API_KEY=xxx python3 fetch_standings.py

Output: deglingo-scout-app/public/data/standings.json
"""

import json, sys, os, time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
sys.stdout.reconfigure(errors="replace")
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

API_KEY = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("FOOTBALL_DATA_API_KEY", "")
if not API_KEY:
    print("Pas de cle API. FOOTBALL_DATA_API_KEY dans .env requise.")
    sys.exit(1)

BASE = "https://api.football-data.org/v4"

# football-data.org competition codes -> nos codes ligue (memes que fetch_fixtures.py)
COMPETITIONS = {
    "FL1": "L1",      # Ligue 1
    "PL":  "PL",      # Premier League
    "PD":  "Liga",    # La Liga
    "BL1": "Bundes",  # Bundesliga
}

# Mapping noms football-data -> noms canoniques Sorare (= ceux dans players.json).
# SACRED : meme source que fetch_fixtures.py, garantit match 1:1 avec players.json.club
try:
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "club_aliases.json"), encoding="utf-8") as f:
        CLUB_ALIASES = json.load(f)
except Exception:
    CLUB_ALIASES = {}

def to_sorare_canonical(name):
    return CLUB_ALIASES.get(name, name)

def fetch(endpoint):
    url = f"{BASE}{endpoint}"
    req = Request(url, headers={"X-Auth-Token": API_KEY})
    try:
        resp = urlopen(req, timeout=30)
        return json.loads(resp.read())
    except HTTPError as e:
        print(f"  Erreur API {e.code}: {e.read().decode()[:200]}")
        return None
    except Exception as e:
        print(f"  Exception: {e}")
        return None

def fetch_standings(comp_code, our_league):
    print(f"  -> {our_league} ({comp_code})...", end=" ", flush=True)
    data = fetch(f"/competitions/{comp_code}/standings")
    if not data or "standings" not in data:
        print("KO (pas de donnees)")
        return None

    # On prend uniquement le tableau TOTAL (pas HOME/AWAY)
    total = next((s for s in data["standings"] if s.get("type") == "TOTAL"), None)
    if not total:
        print("KO (pas de table TOTAL)")
        return None

    rows = []
    for r in total.get("table", []):
        team = r.get("team") or {}
        api_name = team.get("name") or team.get("shortName") or "?"
        rows.append({
            "rank": r.get("position"),
            "club": to_sorare_canonical(api_name),
            "club_api": api_name,                # nom brut football-data, pour debug
            "logo": team.get("crest") or "",
            "played": r.get("playedGames", 0),
            "won": r.get("won", 0),
            "draw": r.get("draw", 0),
            "lost": r.get("lost", 0),
            "gf": r.get("goalsFor", 0),
            "ga": r.get("goalsAgainst", 0),
            "gd": r.get("goalDifference", 0),
            "pts": r.get("points", 0),
            "form": r.get("form") or "",        # ex: "W,W,D,L,W" -> on stocke tel quel
        })
    print(f"OK ({len(rows)} clubs)")
    return rows

def main():
    print("CLASSEMENTS football-data.org")
    print("=" * 50)
    output = {
        "updatedAt": int(time.time()),
        "leagues": {},
    }

    for comp_code, our_league in COMPETITIONS.items():
        rows = fetch_standings(comp_code, our_league)
        if rows:
            output["leagues"][our_league] = rows
        time.sleep(0.5)  # politesse rate-limit (10 req/min en free tier)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(script_dir, "deglingo-scout-app", "public", "data")
    os.makedirs(data_dir, exist_ok=True)
    out_path = os.path.join(data_dir, "standings.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nSauve: {out_path}")
    print(f"  Ligues: {list(output['leagues'].keys())}")

if __name__ == "__main__":
    main()
