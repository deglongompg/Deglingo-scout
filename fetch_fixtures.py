#!/usr/bin/env python3
"""
Fetch next matchday fixtures for L1, PL, Liga, Bundesliga from football-data.org.
Generates fixtures.json for Deglingo Scout.

Usage:
  python3 fetch_fixtures.py YOUR_API_KEY
  # or
  FOOTBALL_DATA_API_KEY=xxx python3 fetch_fixtures.py

Get a free API key at: https://www.football-data.org/client/register
"""

import json, sys, os, time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from datetime import datetime

API_KEY = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("FOOTBALL_DATA_API_KEY", "")
if not API_KEY:
    print("❌ Pas de clé API. Utilise: python3 fetch_fixtures.py TA_CLE")
    print("   Inscris-toi gratuitement sur https://www.football-data.org/client/register")
    sys.exit(1)

BASE = "https://api.football-data.org/v4"

# football-data.org competition codes → our league codes
COMPETITIONS = {
    "FL1": "L1",      # Ligue 1
    "PL":  "PL",      # Premier League
    "PD":  "Liga",    # La Liga (Primera Division)
    "BL1": "Bundes",  # Bundesliga
}

# Mapping: football-data.org team names → our teams.json short names
# Built from actual data - will be auto-completed by fuzzy matching
TEAM_NAME_MAP = {
    # Ligue 1
    "Paris Saint-Germain FC": "Paris Saint Germain",
    "Olympique de Marseille": "Marseille",
    "AS Monaco FC": "Monaco",
    "Olympique Lyonnais": "Lyon",
    "LOSC Lille": "Lille",
    "Stade Rennais FC 1901": "Rennes",
    "RC Lens": "Lens",
    "OGC Nice": "Nice",
    "Toulouse FC": "Toulouse",
    "FC Nantes": "Nantes",
    "Stade Brestois 29": "Brest",
    "RC Strasbourg Alsace": "Strasbourg",
    "AJ Auxerre": "Auxerre",
    "Angers SCO": "Angers",
    "Le Havre AC": "Le Havre",
    "FC Lorient": "Lorient",
    "FC Metz": "Metz",
    "Paris FC": "Paris FC",
    "AS Saint-Étienne": "Saint-Etienne",
    "Montpellier HSC": "Montpellier",
    "Stade de Reims": "Reims",
    # Premier League
    "Arsenal FC": "Arsenal",
    "Manchester City FC": "Manchester City",
    "Liverpool FC": "Liverpool",
    "Aston Villa FC": "Aston Villa",
    "Tottenham Hotspur FC": "Tottenham",
    "Manchester United FC": "Manchester United",
    "Newcastle United FC": "Newcastle United",
    "West Ham United FC": "West Ham",
    "Chelsea FC": "Chelsea",
    "Brighton & Hove Albion FC": "Brighton",
    "Wolverhampton Wanderers FC": "Wolverhampton Wanderers",
    "AFC Bournemouth": "Bournemouth",
    "Fulham FC": "Fulham",
    "Crystal Palace FC": "Crystal Palace",
    "Brentford FC": "Brentford",
    "Everton FC": "Everton",
    "Nottingham Forest FC": "Nottingham Forest",
    "Burnley FC": "Burnley",
    "Luton Town FC": "Luton",
    "Sheffield United FC": "Sheffield United",
    "Ipswich Town FC": "Ipswich",
    "Leicester City FC": "Leicester",
    "Southampton FC": "Southampton",
    # La Liga
    "Real Madrid CF": "Real Madrid",
    "FC Barcelona": "Barcelona",
    "Girona FC": "Girona",
    "Club Atlético de Madrid": "Atletico Madrid",
    "Athletic Club": "Athletic Club",
    "Real Sociedad de Fútbol": "Real Sociedad",
    "Real Betis Balompié": "Real Betis",
    "Villarreal CF": "Villarreal",
    "Valencia CF": "Valencia",
    "Getafe CF": "Getafe",
    "CA Osasuna": "Osasuna",
    "Deportivo Alavés": "Alaves",
    "RCD Mallorca": "Mallorca",
    "UD Las Palmas": "Las Palmas",
    "Sevilla FC": "Sevilla",
    "RC Celta de Vigo": "Celta Vigo",
    "Rayo Vallecano de Madrid": "Rayo Vallecano",
    "Cádiz CF": "Cadiz",
    "Granada CF": "Granada",
    "UD Almería": "Almeria",
    "RCD Espanyol de Barcelona": "Espanyol",
    "CD Leganés": "Leganes",
    "Real Valladolid CF": "Valladolid",
    # Bundesliga
    "FC Bayern München": "Bayern Munich",
    "Bayer 04 Leverkusen": "Bayer Leverkusen",
    "VfB Stuttgart": "Stuttgart",
    "Borussia Dortmund": "Borussia Dortmund",
    "RB Leipzig": "RB Leipzig",
    "TSG 1899 Hoffenheim": "Hoffenheim",
    "Eintracht Frankfurt": "Eintracht Frankfurt",
    "SC Freiburg": "Freiburg",
    "VfL Wolfsburg": "Wolfsburg",
    "1. FC Union Berlin": "Union Berlin",
    "FC Augsburg": "Augsburg",
    "SV Werder Bremen": "Werder Bremen",
    "VfL Bochum 1848": "Bochum",
    "1. FSV Mainz 05": "Mainz 05",
    "1. FC Heidenheim 1846": "Heidenheim",
    "SV Darmstadt 98": "Darmstadt",
    "1. FC Köln": "FC Cologne",
    "Borussia Mönchengladbach": "Borussia M.Gladbach",
    "FC St. Pauli 1910": "St. Pauli",
    "Holstein Kiel": "Holstein Kiel",
    "VfB Stuttgart": "VfB Stuttgart",
    "1. FC Heidenheim 1846": "FC Heidenheim",
    "RB Leipzig": "RasenBallsport Leipzig",
    # PL promoted/new
    "Sunderland AFC": "Sunderland",
    "Leeds United FC": "Leeds",
    # Liga
    "Elche CF": "Elche",
    "Levante UD": "Levante",
    "Real Oviedo": "Real Oviedo",
    "Deportivo Alavés": "Alaves",
    "RC Celta de Vigo": "Celta Vigo",
    "Club Atlético de Madrid": "Atletico Madrid",
}

# Mapping: player club names (from players.json) → teams.json short names
PLAYER_CLUB_MAP = {
    # Ligue 1
    "Paris Saint-Germain": "Paris Saint Germain",
    "Olympique de Marseille": "Marseille",
    "AS Monaco": "Monaco",
    "Olympique Lyonnais": "Lyon",
    "LOSC Lille": "Lille",
    "Stade Rennais F.C.": "Rennes",
    "OGC Nice": "Nice",
    "Toulouse FC": "Toulouse",
    "FC Nantes": "Nantes",
    "Stade Brestois 29": "Brest",
    "RC Strasbourg Alsace": "Strasbourg",
    "AJ Auxerre": "Auxerre",
    "Angers SCO": "Angers",
    "Le Havre AC": "Le Havre",
    "FC Lorient": "Lorient",
    "FC Metz": "Metz",
    "RC Lens": "Lens",
    "Paris FC": "Paris FC",
    # Premier League
    "Arsenal FC": "Arsenal",
    "Manchester City FC": "Manchester City",
    "Liverpool FC": "Liverpool",
    "Aston Villa FC": "Aston Villa",
    "Tottenham Hotspur FC": "Tottenham",
    "Manchester United FC": "Manchester United",
    "Newcastle United FC": "Newcastle United",
    "West Ham United FC": "West Ham",
    "Chelsea FC": "Chelsea",
    "Brighton & Hove Albion FC": "Brighton",
    "Wolverhampton Wanderers FC": "Wolverhampton Wanderers",
    "AFC Bournemouth": "Bournemouth",
    "Fulham FC": "Fulham",
    "Crystal Palace FC": "Crystal Palace",
    "Brentford FC": "Brentford",
    "Everton FC": "Everton",
    "Nottingham Forest FC": "Nottingham Forest",
    "Burnley FC": "Burnley",
    "Sunderland AFC": "Sunderland",
    "Leeds United FC": "Leeds",
    # La Liga
    "FC Barcelona": "Barcelona",
    "Real Madrid": "Real Madrid",
    "Atlético de Madrid": "Atletico Madrid",
    "Athletic Club": "Athletic Club",
    "Real Sociedad": "Real Sociedad",
    "Real Betis": "Real Betis",
    "Villarreal CF": "Villarreal",
    "Valencia CF": "Valencia",
    "Getafe CF": "Getafe",
    "CA Osasuna": "Osasuna",
    "D. Alavés": "Alaves",
    "RCD Mallorca": "Mallorca",
    "Sevilla FC": "Sevilla",
    "RC Celta": "Celta Vigo",
    "Rayo Vallecano": "Rayo Vallecano",
    "RCD Espanyol de Barcelona": "Espanyol",
    "Girona FC": "Girona",
    "Elche CF": "Elche",
    "Levante UD": "Levante",
    "Real Oviedo": "Real Oviedo",
    # Bundesliga
    "FC Bayern München": "Bayern Munich",
    "Bayer 04 Leverkusen": "Bayer Leverkusen",
    "VfB Stuttgart": "VfB Stuttgart",
    "Borussia Dortmund": "Borussia Dortmund",
    "RB Leipzig": "RasenBallsport Leipzig",
    "TSG Hoffenheim": "Hoffenheim",
    "Eintracht Frankfurt": "Eintracht Frankfurt",
    "Sport-Club Freiburg": "Freiburg",
    "VfL Wolfsburg": "Wolfsburg",
    "1. FC Union Berlin": "Union Berlin",
    "FC Augsburg": "Augsburg",
    "SV Werder Bremen": "Werder Bremen",
    "1. FSV Mainz 05": "Mainz 05",
    "1. FC Heidenheim 1846": "FC Heidenheim",
    "1. FC Köln": "FC Cologne",
    "Borussia Mönchengladbach": "Borussia M.Gladbach",
    "FC St. Pauli": "St. Pauli",
    "Hamburger SV": "Hamburger SV",
}

def fetch(endpoint):
    """Fetch from football-data.org API."""
    url = f"{BASE}{endpoint}"
    req = Request(url, headers={"X-Auth-Token": API_KEY})
    try:
        resp = urlopen(req)
        return json.loads(resp.read())
    except HTTPError as e:
        print(f"❌ Erreur API {e.code}: {e.read().decode()}")
        return None

def normalize_team(api_name):
    """Map football-data.org team name to our teams.json name."""
    if api_name in TEAM_NAME_MAP:
        return TEAM_NAME_MAP[api_name]
    # Fuzzy: try removing common suffixes
    for suffix in [" FC", " CF", " SC", " 1910", " 1848", " 1846"]:
        clean = api_name.replace(suffix, "").strip()
        if clean in TEAM_NAME_MAP.values():
            return clean
    return api_name

def fetch_next_matchday(comp_code, our_league):
    """Fetch next scheduled matchday for a competition."""
    print(f"\n📡 {our_league} ({comp_code})...")

    # Get matches with status SCHEDULED or TIMED
    data = fetch(f"/competitions/{comp_code}/matches?status=SCHEDULED,TIMED")
    if not data or "matches" not in data:
        print(f"  ⚠️ Pas de matchs trouvés")
        return []

    matches = data["matches"]
    if not matches:
        print(f"  ⚠️ Aucun match programmé")
        return []

    # Find the nearest matchday
    next_md = min(m["matchday"] for m in matches if m["matchday"])
    md_matches = [m for m in matches if m["matchday"] == next_md]

    print(f"  ✅ Journée {next_md} — {len(md_matches)} matchs")

    fixtures = []
    for m in md_matches:
        home = normalize_team(m["homeTeam"]["name"])
        away = normalize_team(m["awayTeam"]["name"])
        date = m["utcDate"][:10] if m.get("utcDate") else ""

        fixtures.append({
            "home": home,
            "away": away,
            "date": date,
            "matchday": next_md,
            "league": our_league,
            "home_api": m["homeTeam"]["name"],
            "away_api": m["awayTeam"]["name"],
        })
        print(f"    {home} vs {away} ({date})")

    return fixtures

def build_player_fixtures(fixtures, teams, players):
    """
    For each player, find their next fixture and compute:
    - opponent name (teams.json format)
    - home/away
    """
    # Build club → fixture mapping
    club_fixture = {}
    for f in fixtures:
        club_fixture[f["home"]] = {"opp": f["away"], "isHome": True, "date": f["date"], "matchday": f["matchday"]}
        club_fixture[f["away"]] = {"opp": f["home"], "isHome": False, "date": f["date"], "matchday": f["matchday"]}

    # Map player clubs to teams.json names for matching
    team_names = {t["name"] for t in teams}

    result = {}
    matched = 0
    unmatched_clubs = set()

    for p in players:
        player_club = p["club"]
        # Try to find this club in our fixture map
        # 1. Direct match with teams.json name
        club_key = None

        # Try player club name directly mapped
        mapped = PLAYER_CLUB_MAP.get(player_club, player_club)
        if mapped in club_fixture:
            club_key = mapped
        else:
            # Fuzzy: try partial matching
            for fk in club_fixture:
                if fk.lower() in player_club.lower() or player_club.lower() in fk.lower():
                    club_key = fk
                    break
                # Try first word match
                if fk.split()[0].lower() == player_club.split()[0].lower() and len(fk.split()[0]) > 3:
                    club_key = fk
                    break

        if club_key:
            fx = club_fixture[club_key]
            result[p["name"]] = {
                "opp": fx["opp"],
                "isHome": fx["isHome"],
                "date": fx["date"],
                "matchday": fx["matchday"],
            }
            matched += 1
        else:
            unmatched_clubs.add(player_club)

    if unmatched_clubs:
        print(f"\n⚠️ Clubs sans fixture ({len(unmatched_clubs)}):")
        for c in sorted(unmatched_clubs):
            print(f"   - {c}")

    print(f"\n✅ {matched}/{len(players)} joueurs avec fixture")
    return result

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(script_dir, "deglingo-scout-app", "public", "data")

    # Load existing data
    with open(os.path.join(data_dir, "teams.json")) as f:
        teams = json.load(f)
    with open(os.path.join(data_dir, "players.json")) as f:
        players = json.load(f)

    print("⚽ Deglingo Scout — Récupération des prochaines journées")
    print(f"   {len(players)} joueurs, {len(teams)} équipes")
    print(f"   Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    all_fixtures = []
    for comp_code, our_league in COMPETITIONS.items():
        fixtures = fetch_next_matchday(comp_code, our_league)
        all_fixtures.extend(fixtures)
        time.sleep(6.5)  # Respect 10 req/min rate limit

    print(f"\n📋 Total: {len(all_fixtures)} matchs récupérés")

    # Build player → fixture mapping
    player_fixtures = build_player_fixtures(all_fixtures, teams, players)

    # Save fixtures.json
    output = {
        "generated": datetime.now().isoformat(),
        "matchdays": {},
        "fixtures": all_fixtures,
        "player_fixtures": player_fixtures,
    }

    # Group matchdays by league
    for f in all_fixtures:
        output["matchdays"][f["league"]] = f["matchday"]

    out_path = os.path.join(data_dir, "fixtures.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n💾 Sauvé: {out_path}")
    print(f"   Journées: {output['matchdays']}")
    print(f"   {len(player_fixtures)} joueurs mappés")
    print("\n✅ Done! Relance 'npm run build' pour mettre à jour l'app.")

if __name__ == "__main__":
    main()
