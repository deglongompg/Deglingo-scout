#!/usr/bin/env python3
"""
Fetch official club logos/crests for all 4 leagues from football-data.org.
Downloads PNG crests and generates a club_logos.json mapping.

Usage:
  python3 fetch_logos.py YOUR_API_KEY
  # or
  FOOTBALL_DATA_API_KEY=xxx python3 fetch_logos.py

Get a free API key at: https://www.football-data.org/client/register
"""

import json, sys, os, time, re
from urllib.request import Request, urlopen
from urllib.error import HTTPError

API_KEY = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("FOOTBALL_DATA_API_KEY", "")
if not API_KEY:
    print("❌ Pas de clé API. Utilise: python3 fetch_logos.py TA_CLE")
    print("   Inscris-toi gratuitement sur https://www.football-data.org/client/register")
    sys.exit(1)

BASE = "https://api.football-data.org/v4"

COMPETITIONS = {
    "FL1": "L1",
    "PL":  "PL",
    "PD":  "Liga",
    "BL1": "Bundes",
}

# football-data.org team name → our teams.json short name
TEAM_NAME_MAP = {
    # Ligue 1
    "Lille OSC": "Lille", "LOSC Lille": "Lille",
    "Racing Club de Lens": "Lens", "RC Lens": "Lens",
    "Paris Saint-Germain FC": "Paris Saint Germain",
    "Olympique de Marseille": "Marseille",
    "AS Monaco FC": "Monaco",
    "Olympique Lyonnais": "Lyon",
    "Stade Rennais FC 1901": "Rennes",
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
    "Sunderland AFC": "Sunderland",
    "Leeds United FC": "Leeds",
    "Ipswich Town FC": "Ipswich",
    "Leicester City FC": "Leicester",
    "Southampton FC": "Southampton",
    "Luton Town FC": "Luton",
    "Sheffield United FC": "Sheffield United",
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
    "RCD Espanyol de Barcelona": "Espanyol",
    "CD Leganés": "Leganes",
    "Real Valladolid CF": "Valladolid",
    "Real Oviedo": "Real Oviedo",
    "Levante UD": "Levante",
    "Elche CF": "Elche",
    # Bundesliga
    "FC Bayern München": "Bayern Munich",
    "Bayer 04 Leverkusen": "Bayer Leverkusen",
    "VfB Stuttgart": "VfB Stuttgart",
    "Borussia Dortmund": "Borussia Dortmund",
    "RB Leipzig": "RasenBallsport Leipzig",
    "TSG 1899 Hoffenheim": "Hoffenheim",
    "Eintracht Frankfurt": "Eintracht Frankfurt",
    "SC Freiburg": "Freiburg",
    "VfL Wolfsburg": "Wolfsburg",
    "1. FC Union Berlin": "Union Berlin",
    "FC Augsburg": "Augsburg",
    "SV Werder Bremen": "Werder Bremen",
    "1. FSV Mainz 05": "Mainz 05",
    "1. FC Heidenheim 1846": "FC Heidenheim",
    "1. FC Köln": "FC Cologne",
    "Borussia Mönchengladbach": "Borussia M.Gladbach",
    "FC St. Pauli 1910": "St. Pauli",
    "Holstein Kiel": "Holstein Kiel",
    "Hamburger SV": "Hamburger SV",
    "VfL Bochum 1848": "Bochum",
    "SV Darmstadt 98": "Darmstadt",
}

# Player club names (from players.json) → teams.json short name
PLAYER_CLUB_MAP = {
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
    "FC Bayern München": "Bayern Munich",
    "Bayer 04 Leverkusen": "Bayer Leverkusen",
    "VfB Stuttgart": "VfB Stuttgart",
    "Borussia Dortmund": "Borussia Dortmund",
    "RB Leipzig": "RasenBallsport Leipzig",
    "TSG Hoffenheim": "Hoffenheim",
    "Eintracht Frankfurt": "Eintracht Frankfurt",
    "Sport-Club Freiburg": "Freiburg",
    "SC Freiburg": "Freiburg",
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
    url = f"{BASE}{endpoint}"
    req = Request(url, headers={"X-Auth-Token": API_KEY})
    try:
        resp = urlopen(req)
        return json.loads(resp.read())
    except HTTPError as e:
        print(f"  ❌ API error {e.code}: {e.read().decode()[:200]}")
        return None


def download_image(url, filepath):
    try:
        req = Request(url, headers={"User-Agent": "DeglingoScout/1.0"})
        resp = urlopen(req)
        data = resp.read()
        with open(filepath, "wb") as f:
            f.write(data)
        return True
    except Exception as e:
        print(f"  ⚠️ Download failed: {e}")
        return False


def slugify(name):
    s = name.lower().strip()
    s = s.replace("ö", "o").replace("ü", "u").replace("ä", "a").replace("é", "e").replace("è", "e")
    s = s.replace("á", "a").replace("í", "i").replace("ñ", "n").replace("ç", "c")
    s = re.sub(r'[^a-z0-9]+', '-', s)
    s = s.strip('-')
    return s


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(script_dir, "deglingo-scout-app", "public", "data")
    logos_dir = os.path.join(data_dir, "logos")
    os.makedirs(logos_dir, exist_ok=True)

    with open(os.path.join(data_dir, "teams.json")) as f:
        teams = json.load(f)
    team_names = {t["name"] for t in teams}

    with open(os.path.join(data_dir, "players.json")) as f:
        players = json.load(f)
    player_clubs = {p["club"] for p in players}

    print("🏟️  Deglingo Scout — Logo Fetcher")
    print(f"   {len(team_names)} équipes dans teams.json")
    print(f"   {len(player_clubs)} clubs uniques dans players.json")

    club_logos = {}
    downloaded = 0
    skipped = 0

    for comp_code, our_league in COMPETITIONS.items():
        print(f"\n📡 {our_league} ({comp_code})...")

        data = fetch(f"/competitions/{comp_code}/teams")
        if not data or "teams" not in data:
            print(f"  ⚠️ Pas d'équipes trouvées")
            continue

        api_teams = data["teams"]
        print(f"  ✅ {len(api_teams)} équipes")

        for team in api_teams:
            api_name = team["name"]
            crest_url = team.get("crest", "")
            our_name = TEAM_NAME_MAP.get(api_name, api_name)

            if not crest_url:
                print(f"  ⚠️ {api_name} — pas de crest URL")
                continue

            ext = "svg" if ".svg" in crest_url.lower() else "png"
            slug = slugify(our_name)
            filename = f"{slug}.{ext}"
            filepath = os.path.join(logos_dir, filename)

            if os.path.exists(filepath) and os.path.getsize(filepath) > 100:
                print(f"  ⏭️  {our_name} — déjà téléchargé")
                skipped += 1
            else:
                print(f"  ⬇️  {our_name} ← {crest_url[:80]}...")
                ok = download_image(crest_url, filepath)
                if ok:
                    downloaded += 1
                    size = os.path.getsize(filepath)
                    print(f"      ✅ {filename} ({size:,} bytes)")
                else:
                    continue
                time.sleep(0.3)

            club_logos[our_name] = filename

            # Map all player club names that resolve to this team
            for pc_name, mapped in PLAYER_CLUB_MAP.items():
                if mapped == our_name:
                    club_logos[pc_name] = filename

            if api_name in player_clubs:
                club_logos[api_name] = filename

        # Respect rate limit
        time.sleep(7)

    # Save mapping
    mapping_path = os.path.join(data_dir, "club_logos.json")
    with open(mapping_path, "w", encoding="utf-8") as f:
        json.dump(club_logos, f, ensure_ascii=False, indent=2, sort_keys=True)

    print(f"\n{'='*50}")
    print(f"📊 Résumé:")
    print(f"   ⬇️  {downloaded} logos téléchargés")
    print(f"   ⏭️  {skipped} déjà présents")
    print(f"   📋 {len(club_logos)} entrées dans club_logos.json")
    print(f"   📁 Logos: {logos_dir}")
    print(f"   📋 Mapping: {mapping_path}")

    unmapped_teams = team_names - set(club_logos.keys())
    unmapped_clubs = player_clubs - set(club_logos.keys())

    if unmapped_teams:
        print(f"\n⚠️  Équipes teams.json sans logo ({len(unmapped_teams)}):")
        for t in sorted(unmapped_teams):
            print(f"   - {t}")

    if unmapped_clubs:
        print(f"\n⚠️  Clubs players.json sans logo ({len(unmapped_clubs)}):")
        for c in sorted(unmapped_clubs):
            print(f"   - {c}")

    print(f"\n✅ Done!")


if __name__ == "__main__":
    main()
