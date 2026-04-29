#!/usr/bin/env python3
"""
Fetch live standings for L1, PL, Liga, Bundesliga from football-data.org
                       + Belgique (JPL) + Pays-Bas (Ere) via API-Football (Pro).
Generates standings.json for Deglingo Scout (affiche dans le panneau Calendrier).

Usage:
  python3 fetch_standings.py
  # ou
  FOOTBALL_DATA_API_KEY=xxx API_FOOTBALL_KEY=yyy python3 fetch_standings.py

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
import requests

API_KEY = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("FOOTBALL_DATA_API_KEY", "")
if not API_KEY:
    print("Pas de cle API. FOOTBALL_DATA_API_KEY dans .env requise.")
    sys.exit(1)

API_FOOTBALL_KEY = os.environ.get("API_FOOTBALL_KEY", "")

BASE = "https://api.football-data.org/v4"
APIFOOT_BASE = "https://v3.football.api-sports.io"

# Source unique : API-Football Pro plan (decision 2026-04-29).
# football-data.org abandonne — couverture limitee, format fragile, doublait l'effort.
# Toutes les ligues passent par /standings + applique club_aliases.json.
COMPETITIONS = {}  # legacy, vide

# API-Football : SOURCE UNIQUE pour standings de toutes nos ligues.
APISPORTS_COMPETITIONS = {
    "L1":     (61,  2025),   # Ligue 1
    "PL":     (39,  2025),   # Premier League
    "Liga":   (140, 2025),   # La Liga
    "Bundes": (78,  2025),   # Bundesliga
    "MLS":    (253, 2025),   # MLS (saison cal en, 2025 = saison courante US)
    "JPL":    (144, 2025),   # Jupiler Pro League (Belgique)
    "Ere":    (88,  2025),   # Eredivisie (Pays-Bas)
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

def fetch_standings_apisports(league_id, season, our_league):
    """Fetch standings from API-Football v3 -> meme structure que football-data."""
    print(f"  -> {our_league} (API-Football {league_id} season {season})...", end=" ", flush=True)
    if not API_FOOTBALL_KEY:
        print("KO (API_FOOTBALL_KEY manquant)")
        return None
    try:
        r = requests.get(
            f"{APIFOOT_BASE}/standings",
            headers={"x-apisports-key": API_FOOTBALL_KEY},
            params={"league": league_id, "season": season},
            timeout=30,
        )
    except Exception as e:
        print(f"KO ({e})")
        return None
    if r.status_code != 200:
        print(f"KO HTTP {r.status_code}")
        return None
    j = r.json()
    leagues = j.get("response", [])
    if not leagues:
        print("KO (pas de donnees)")
        return None
    league_obj = (leagues[0] or {}).get("league") or {}
    standings_groups = league_obj.get("standings") or []
    if not standings_groups:
        print("KO (pas de table standings)")
        return None
    # API-Football : standings est un array de groupes (Phase 1 / Champion Playoff / Eastern / Western / etc.)
    # Strategie selon le format :
    # - Belgique (4 groupes : Championship Round 6, Relegation Round 4, Pro League 16, Qualifying 6)
    #   -> on prend le plus gros = saison reguliere complete (Pro League 16)
    # - MLS (2 conferences Eastern 15 + Western 15) -> fusion + reranking par points overall
    if len(standings_groups) == 2 and len(standings_groups[0]) == len(standings_groups[1]):
        # Probablement 2 conferences MLS -> fusion + tri par points
        merged = standings_groups[0] + standings_groups[1]
        merged.sort(key=lambda r: (-r.get("points", 0), -r.get("goalsDiff", 0), -((r.get("all") or {}).get("goals", {}) or {}).get("for", 0)))
        # Reassign rank overall (1 .. 30)
        for i, row in enumerate(merged, 1):
            row["rank"] = i
        table = merged
    else:
        table = max(standings_groups, key=len)
    rows = []
    for r2 in table:
        team = r2.get("team") or {}
        api_name = team.get("name") or "?"
        all_stats = r2.get("all") or {}
        goals = all_stats.get("goals") or {}
        rows.append({
            "rank":   r2.get("rank"),
            "club":   to_sorare_canonical(api_name),
            "club_api": api_name,
            "logo":   team.get("logo") or "",
            "played": all_stats.get("played", 0),
            "won":    all_stats.get("win",    0),
            "draw":   all_stats.get("draw",   0),
            "lost":   all_stats.get("lose",   0),
            "gf":     goals.get("for",       0),
            "ga":     goals.get("against",   0),
            "gd":     r2.get("goalsDiff",    0),
            "pts":    r2.get("points",       0),
            # API-Football donne form en string ex "WLLDW" (5 derniers, sans virgules)
            "form":   ",".join(list(r2.get("form") or "")) if r2.get("form") else "",
        })
    print(f"OK ({len(rows)} clubs)")
    return rows


def main():
    print("CLASSEMENTS API-Football (source unique)")
    print("=" * 50)
    output = {
        "updatedAt": int(time.time()),
        "leagues": {},
    }

    # API-Football : SOURCE UNIQUE pour toutes les ligues (decision 2026-04-29)
    for our_league, (league_id, season) in APISPORTS_COMPETITIONS.items():
        rows = fetch_standings_apisports(league_id, season, our_league)
        if rows:
            output["leagues"][our_league] = rows
        time.sleep(0.2)

    # Legacy : football-data.org (vide, garde pour rollback eventuel)
    for comp_code, our_league in COMPETITIONS.items():
        rows = fetch_standings(comp_code, our_league)
        if rows:
            output["leagues"][our_league] = rows
        time.sleep(0.5)

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
