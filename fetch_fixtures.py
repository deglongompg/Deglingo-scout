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
from datetime import datetime, timedelta
sys.stdout.reconfigure(errors="replace")
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

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

# Mapping noms football-data → noms canoniques Sorare (= ceux dans players.json).
# Build with build_club_aliases.py (compare fixtures.home_api/away_api to sorare_club_slugs.json keys).
# Source de verite : players.json/Sorare. fixtures.json doit ecrire les MEMES noms en home_api/away_api
# pour que le front-end matche les joueurs sans logique fuzzy fragile.
try:
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "club_aliases.json"), encoding="utf-8") as f:
        CLUB_ALIASES = json.load(f)
except Exception:
    CLUB_ALIASES = {}

def to_sorare_canonical(name):
    """Convertit un nom de club football-data (ou autre source) vers le nom canonique Sorare."""
    return CLUB_ALIASES.get(name, name)

# Compétitions européennes (fetch par plage de dates, pas par journée)
EURO_COMPETITIONS = {
    "CL":   "UCL",   # Champions League
    "EL":   "UEL",   # Europa League
    "ECSL": "UECL",  # Conference League
}

# Clubs de nos 4 ligues qui jouent en europe (pour filtrer les matchs pertinents)
# On garde TOUS les matchs — StellarTab filtre ensuite par joueurs dans players.json

# Mapping: football-data.org team names → our teams.json short names
# Built from actual data - will be auto-completed by fuzzy matching
TEAM_NAME_MAP = {
    # Ligue 1
    "Lille OSC": "Lille",
    "Racing Club de Lens": "Lens",
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
    "Stade Rennais F.C.": "Rennes",
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
    "Atlético de Madrid": "Atletico Madrid",
    "RCD Mallorca": "Mallorca",
    "RC Celta": "Celta Vigo",
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
    "1. FC Heidenheim 1846": "FC Heidenheim",
    "1. FC Köln": "FC Cologne",
    "1. FC Union Berlin": "Union Berlin",
    "1. FSV Mainz 05": "Mainz 05",
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
    if not api_name: return "Unknown"
    if api_name in TEAM_NAME_MAP:
        return TEAM_NAME_MAP[api_name]
    # Fuzzy: try removing common suffixes
    for suffix in [" FC", " CF", " SC", " 1910", " 1848", " 1846"]:
        clean = api_name.replace(suffix, "").strip()
        if clean in TEAM_NAME_MAP.values():
            return clean
    return api_name

def fetch_recent_finished(comp_code, our_league, days_back=8):
    """Fetch recently finished matches (last N days) — pour afficher les résultats dans Stellar."""
    print(f"\n📅 {our_league} ({comp_code}) — matchs récents terminés...")
    today = datetime.utcnow().date()
    date_from = (today - timedelta(days=days_back)).strftime("%Y-%m-%d")
    date_to   = today.strftime("%Y-%m-%d")
    data = fetch(f"/competitions/{comp_code}/matches?status=FINISHED&dateFrom={date_from}&dateTo={date_to}")
    if not data or "matches" not in data:
        print(f"  ⚠️ Pas de matchs récents")
        return []
    matches = data["matches"]
    if not matches:
        print(f"  ⚠️ Aucun match terminé dans les {days_back} derniers jours")
        return []
    # Garder TOUS les matchs finis dans la fenetre (y compris rattrapages d'anciennes journees).
    # Why: un match comme PSG-Nantes joue le 22/04 est matchday 26 (retard), pas 30.
    # Filtrer par matchday max jetait ces matchs et les faisait disparaitre du calendrier Stellar.
    from collections import Counter
    md_counts = Counter(m["matchday"] for m in matches if m["matchday"])
    md_matches = matches
    if md_counts:
        mds_str = ", ".join(f"J{md}:{md_counts[md]}" for md in sorted(md_counts.keys()))
        print(f"  ✅ {len(md_matches)} matchs termines ({mds_str})")
    else:
        print(f"  ✅ {len(md_matches)} matchs termines")
    fixtures = []
    for m in md_matches:
        home = normalize_team(m["homeTeam"]["name"])
        away = normalize_team(m["awayTeam"]["name"])
        date = m["utcDate"][:10] if m.get("utcDate") else ""
        kickoff = m["utcDate"][11:16] if m.get("utcDate") and len(m["utcDate"]) >= 16 else ""
        fixtures.append({
            "home": home, "away": away, "date": date, "kickoff": kickoff,
            "matchday": m.get("matchday", ""), "league": our_league,
            "home_api": to_sorare_canonical(m["homeTeam"]["name"]), "away_api": to_sorare_canonical(m["awayTeam"]["name"]),
            "finished": True,
        })
        print(f"    {home} vs {away} ({date})")
    return fixtures


def fetch_upcoming_fixtures(comp_code, our_league, days_ahead=21):
    """Fetch ALL upcoming fixtures for the next N days (multi-matchday for Sorare Pro)."""
    print(f"\n📡 {our_league} ({comp_code}) — {days_ahead} prochains jours...")

    today = datetime.utcnow().date()
    date_from = today.strftime("%Y-%m-%d")
    date_to = (today + timedelta(days=days_ahead)).strftime("%Y-%m-%d")

    # Inclus IN_PLAY/PAUSED pour eviter que les matchs LIVE disparaissent du calendrier
    # (status football-data : SCHEDULED → TIMED → IN_PLAY → PAUSED → FINISHED)
    data = fetch(f"/competitions/{comp_code}/matches?status=SCHEDULED,TIMED,IN_PLAY,PAUSED&dateFrom={date_from}&dateTo={date_to}")
    if not data or "matches" not in data:
        print(f"  ⚠️ Pas de matchs trouvés")
        return []

    matches = data["matches"]
    if not matches:
        print(f"  ⚠️ Aucun match programmé")
        return []

    from collections import Counter
    md_counts = Counter(m["matchday"] for m in matches if m["matchday"])
    print(f"  ✅ {len(matches)} matchs sur {len(md_counts)} journée(s) ({date_from} → {date_to})")
    for md in sorted(md_counts.keys()):
        print(f"      J{md}: {md_counts[md]} matchs")

    fixtures = []
    for m in matches:
        home = normalize_team(m["homeTeam"]["name"])
        away = normalize_team(m["awayTeam"]["name"])
        date = m["utcDate"][:10] if m.get("utcDate") else ""
        kickoff = m["utcDate"][11:16] if m.get("utcDate") and len(m["utcDate"]) >= 16 else ""

        fixtures.append({
            "home": home,
            "away": away,
            "date": date,
            "kickoff": kickoff,
            "matchday": m.get("matchday", ""),
            "league": our_league,
            "home_api": to_sorare_canonical(m["homeTeam"]["name"]),
            "away_api": to_sorare_canonical(m["awayTeam"]["name"]),
        })

    return fixtures

def fetch_euro_fixtures(comp_code, comp_label, days_ahead=14):
    """Fetch upcoming European competition matches in the next N days."""
    print(f"\n🌍 {comp_label} ({comp_code})...")
    today = datetime.utcnow().date()
    date_to = today + timedelta(days=days_ahead)
    date_from_str = today.strftime("%Y-%m-%d")
    date_to_str = date_to.strftime("%Y-%m-%d")

    # Inclus IN_PLAY/PAUSED pour ne pas perdre les matchs LIVE (cf. fetch_upcoming_fixtures)
    data = fetch(f"/competitions/{comp_code}/matches?status=SCHEDULED,TIMED,IN_PLAY,PAUSED&dateFrom={date_from_str}&dateTo={date_to_str}")
    if not data or "matches" not in data:
        print(f"  ⚠️ Pas de matchs trouvés")
        return []

    matches = data["matches"]
    if not matches:
        print(f"  ⚠️ Aucun match programmé dans les {days_ahead} prochains jours")
        return []

    print(f"  ✅ {len(matches)} matchs trouvés ({date_from_str} → {date_to_str})")

    fixtures = []
    for m in matches:
        home = normalize_team(m["homeTeam"]["name"])
        away = normalize_team(m["awayTeam"]["name"])
        date = m["utcDate"][:10] if m.get("utcDate") else ""
        kickoff = m["utcDate"][11:16] if m.get("utcDate") and len(m["utcDate"]) >= 16 else ""
        stage = m.get("stage", "")
        fixtures.append({
            "home": home,
            "away": away,
            "date": date,
            "kickoff": kickoff,
            "matchday": stage,
            "league": comp_label,          # "UCL", "UEL", "UECL"
            "competition": comp_label,     # flag explicite pour StellarTab
            "home_api": to_sorare_canonical(m["homeTeam"]["name"]),
            "away_api": to_sorare_canonical(m["awayTeam"]["name"]),
        })
        print(f"    {home} vs {away} ({date} {kickoff})")

    return fixtures


def build_player_fixtures(fixtures, teams, players):
    """
    For each player, find their next fixture and compute:
    - opponent name (teams.json format)
    - home/away
    """
    # Build club → fixture mapping
    # Pour les matchs multiples, on garde le PLUS PROCHE A VENIR (date >= today, tri par date+kickoff)
    # Fix bug : sans le filtre today, un match passe du jour meme reste prioritaire sur le prochain match
    today_str = datetime.now().strftime("%Y-%m-%d")
    club_fixture = {}
    # On filtre d'abord les matchs deja joues : date stricte < today
    # On inclut les matchs du jour meme (ils peuvent etre en cours ou a venir)
    upcoming = [f for f in fixtures if (f.get("date") or "") >= today_str]
    sorted_fixtures = sorted(upcoming, key=lambda x: (x.get("date",""), x.get("kickoff","99:99")))
    for f in sorted_fixtures:
        comp = f.get("competition", "")
        if f["home"] not in club_fixture:
            club_fixture[f["home"]] = {"opp": f["away"], "isHome": True, "date": f["date"], "matchday": f["matchday"], "kickoff": f.get("kickoff", ""), "competition": comp}
        if f["away"] not in club_fixture:
            club_fixture[f["away"]] = {"opp": f["home"], "isHome": False, "date": f["date"], "matchday": f["matchday"], "kickoff": f.get("kickoff", ""), "competition": comp}

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
            # Fuzzy: try partial matching — pick the BEST match (longest overlap)
            best_fk = None
            best_score = 0
            for fk in club_fixture:
                fk_l = fk.lower()
                pc_l = player_club.lower()
                mapped_l = mapped.lower()
                # Exact substring match (both directions)
                if fk_l in pc_l or pc_l in fk_l or fk_l in mapped_l or mapped_l in fk_l:
                    score = max(len(fk_l), len(pc_l))  # longer match = better
                    if score > best_score:
                        best_score = score
                        best_fk = fk
                # Two-word prefix match (avoids "Manchester" matching both clubs)
                fk_words = fk_l.split()
                pc_words = pc_l.split()
                if len(fk_words) >= 2 and len(pc_words) >= 2:
                    if fk_words[0] == pc_words[0] and fk_words[1] == pc_words[1]:
                        score = len(fk_l) + 10  # strong match
                        if score > best_score:
                            best_score = score
                            best_fk = fk
            club_key = best_fk

        if club_key:
            fx = club_fixture[club_key]
            entry = {
                "opp": fx["opp"],
                "isHome": fx["isHome"],
                "date": fx["date"],
                "matchday": fx["matchday"],
                "kickoff": fx.get("kickoff", ""),
                "competition": fx.get("competition", ""),  # "UCL"/"UEL"/"UECL" ou "" si ligue domestique
            }
            # Use BOTH slug (unique) and name (for backward compat) as keys
            result[p["slug"]] = entry
            result[p["name"]] = entry  # may overwrite on duplicate names — slug is authoritative
            matched += 1
        else:
            unmatched_clubs.add(player_club)

    if unmatched_clubs:
        print(f"\n⚠️ Clubs sans fixture ({len(unmatched_clubs)}):")
        for c in sorted(unmatched_clubs):
            print(f"   - {c}")

    print(f"\n✅ {matched}/{len(players)} joueurs avec fixture")
    return result

def get_manual_euro_fixtures():
    """
    Fixtures UEL / UECL hardcodées manuellement (football-data.org ne les fournit pas).
    A mettre à jour chaque tour (QF Leg2, Semis, Finale).
    Kickoffs en UTC. Competition = "UEL" ou "UECL" → calendrier Stellar only, pas de reco.
    """
    fixtures = [
        # ── UCL QF Leg 1 — Mardi 7 avril 2026 (terminés) ────────────────────
        {"home": "Sporting",       "away": "Arsenal",       "date": "2026-04-07", "kickoff": "19:00", "matchday": "QUARTER_FINALS", "league": "UCL", "competition": "UCL", "home_api": "Sporting CP",           "away_api": "Arsenal FC",            "score_home": 0, "score_away": 1},
        {"home": "Real Madrid",    "away": "Bayern",        "date": "2026-04-07", "kickoff": "19:00", "matchday": "QUARTER_FINALS", "league": "UCL", "competition": "UCL", "home_api": "Real Madrid CF",        "away_api": "FC Bayern München",     "score_home": 1, "score_away": 2},

        # ── UEL QF Leg 1 — Jeudi 9 avril 2026 ──────────────────────────────
        {"home": "Braga",          "away": "Betis",         "date": "2026-04-09", "kickoff": "16:45", "matchday": "QUARTER_FINALS", "league": "UEL", "competition": "UEL", "home_api": "SC Braga",             "away_api": "Real Betis"},
        {"home": "Freiburg",       "away": "Celta Vigo",    "date": "2026-04-09", "kickoff": "19:00", "matchday": "QUARTER_FINALS", "league": "UEL", "competition": "UEL", "home_api": "SC Freiburg",           "away_api": "RC Celta de Vigo"},
        {"home": "Bologna",        "away": "Aston Villa",   "date": "2026-04-09", "kickoff": "19:00", "matchday": "QUARTER_FINALS", "league": "UEL", "competition": "UEL", "home_api": "Bologna FC",            "away_api": "Aston Villa FC"},
        {"home": "Porto",          "away": "Nottm Forest",  "date": "2026-04-09", "kickoff": "19:00", "matchday": "QUARTER_FINALS", "league": "UEL", "competition": "UEL", "home_api": "FC Porto",              "away_api": "Nottingham Forest FC"},

        # ── UECL QF Leg 1 — Jeudi 9 avril 2026 ─────────────────────────────
        {"home": "Rayo Vallecano", "away": "AEK Athens",    "date": "2026-04-09", "kickoff": "16:45", "matchday": "QUARTER_FINALS", "league": "UECL", "competition": "UECL", "home_api": "Rayo Vallecano",     "away_api": "AEK Athens FC"},
        {"home": "Shakhtar",       "away": "AZ",             "date": "2026-04-09", "kickoff": "19:00", "matchday": "QUARTER_FINALS", "league": "UECL", "competition": "UECL", "home_api": "Shakhtar Donetsk",  "away_api": "AZ Alkmaar"},
        {"home": "Mainz",          "away": "Strasbourg",    "date": "2026-04-09", "kickoff": "19:00", "matchday": "QUARTER_FINALS", "league": "UECL", "competition": "UECL", "home_api": "1. FSV Mainz 05",    "away_api": "RC Strasbourg"},
        {"home": "Crystal Palace", "away": "Fiorentina",    "date": "2026-04-09", "kickoff": "19:00", "matchday": "QUARTER_FINALS", "league": "UECL", "competition": "UECL", "home_api": "Crystal Palace FC",  "away_api": "ACF Fiorentina"},

        # ── UEL Semi-finale Leg 1 — Jeudi 30 avril 2026 ───────────────────
        {"home": "Nottm Forest",   "away": "Aston Villa",   "date": "2026-04-30", "kickoff": "19:00", "matchday": "SEMI_FINALS",    "league": "UEL", "competition": "UEL",   "home_api": "Nottingham Forest FC", "away_api": "Aston Villa FC"},
        {"home": "Braga",          "away": "Freiburg",      "date": "2026-04-30", "kickoff": "19:00", "matchday": "SEMI_FINALS",    "league": "UEL", "competition": "UEL",   "home_api": "SC Braga",             "away_api": "SC Freiburg"},

        # ── UECL Semi-finale Leg 1 — Jeudi 30 avril 2026 ──────────────────
        {"home": "Rayo Vallecano", "away": "Strasbourg",    "date": "2026-04-30", "kickoff": "19:00", "matchday": "SEMI_FINALS",    "league": "UECL", "competition": "UECL", "home_api": "Rayo Vallecano",       "away_api": "RC Strasbourg"},
        {"home": "Shakhtar",       "away": "Crystal Palace", "date": "2026-04-30", "kickoff": "19:00", "matchday": "SEMI_FINALS",    "league": "UECL", "competition": "UECL", "home_api": "Shakhtar Donetsk",     "away_api": "Crystal Palace FC"},
    ]
    # Normalise les home_api/away_api vers les noms canoniques Sorare
    # (les clubs qu'on a dans players.json : Real Madrid CF -> Real Madrid, etc.)
    for f in fixtures:
        if f.get("home_api"): f["home_api"] = to_sorare_canonical(f["home_api"])
        if f.get("away_api"): f["away_api"] = to_sorare_canonical(f["away_api"])
    print(f"\n📋 Manual euro fixtures: {len(fixtures)} matchs (UEL + UECL QF Leg 1)")
    for f in fixtures:
        print(f"  [{f['league']}] {f['home']} vs {f['away']} ({f['date']} {f['kickoff']} UTC)")
    return fixtures


def fetch_mls_fixtures():
    """Fetch MLS fixtures from Sorare API via club.games(startDate,endDate).

    Why games() vs upcomingGames(): upcomingGames ne renvoie que le futur (statusTyped=playing
    devient invisible des coup d'envoi+1 sec). On veut aussi les matchs du jour LIVE et
    ceux deja joues dans la fenetre GW pour afficher les scores dans le calendrier.
    """
    import urllib.request
    SORARE_URL = "https://api.sorare.com/federation/graphql"
    sorare_key = os.environ.get("SORARE_API_KEY", "")
    headers_s = {"Content-Type": "application/json"}
    if sorare_key:
        headers_s["APIKEY"] = sorare_key

    def sorare_gql(query):
        req = urllib.request.Request(SORARE_URL, data=json.dumps({"query": query}).encode(), headers=headers_s)
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())

    print("\n--- MLS (via Sorare API) ---")
    # Fenetre : 8j passes -> 21j futurs (couvre rattrapages + multi-GW)
    today = datetime.utcnow().date()
    start_date = (today - timedelta(days=8)).strftime("%Y-%m-%d")
    end_date = (today + timedelta(days=21)).strftime("%Y-%m-%d")

    # 1. Get all MLS clubs
    d = sorare_gql('{football{competition(slug:"mlspa"){clubs{nodes{name slug}}}}}')
    clubs = d.get("data", {}).get("football", {}).get("competition", {}).get("clubs", {}).get("nodes", [])
    print(f"  {len(clubs)} clubs MLS · fenetre {start_date} -> {end_date}")

    seen = set()  # avoid duplicate matches
    fixtures = []
    played_count = 0
    for i, club in enumerate(clubs):
        try:
            q = (f'{{football{{club(slug:"{club["slug"]}"){{name '
                 f'games(startDate:"{start_date}",endDate:"{end_date}"){{nodes{{'
                 f'id date statusTyped homeTeam{{name}} awayTeam{{name}} homeGoals awayGoals}}}}}}}}}}')
            d2 = sorare_gql(q)
            games = (d2.get("data", {}).get("football", {}).get("club", {}) or {}).get("games", {}).get("nodes", []) or []
            for g in games:
                date = (g.get("date") or "")[:10]
                home = (g.get("homeTeam") or {}).get("name", "")
                away = (g.get("awayTeam") or {}).get("name", "")
                key = f"{date}_{home}_{away}"
                if key in seen or not home or not away:
                    continue
                seen.add(key)
                kickoff = (g.get("date") or "")[11:16] or ""
                status = g.get("statusTyped", "")
                is_finished = status == "played"
                fx = {
                    "home": home, "away": away, "date": date,
                    "kickoff": kickoff, "matchday": "MLS",
                    "league": "MLS", "home_api": home, "away_api": away,
                }
                if is_finished:
                    fx["finished"] = True
                    played_count += 1
                fixtures.append(fx)
            if (i + 1) % 10 == 0:
                print(f"  [{i+1}/{len(clubs)}] {len(fixtures)} matchs trouves ({played_count} joues)...")
        except Exception as e:
            print(f"  WARN Erreur {club['name']}: {e}")
        time.sleep(0.15)

    print(f"  OK {len(fixtures)} matchs MLS trouves ({played_count} joues + {len(fixtures)-played_count} a venir/live)")
    return fixtures


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(script_dir, "deglingo-scout-app", "public", "data")

    # Load existing data
    with open(os.path.join(data_dir, "teams.json"), encoding="utf-8") as f:
        teams = json.load(f)
    with open(os.path.join(data_dir, "players.json"), encoding="utf-8") as f:
        players = json.load(f)

    print("⚽ Deglingo Scout — Récupération des prochaines journées")
    print(f"   {len(players)} joueurs, {len(teams)} équipes")
    print(f"   Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    all_fixtures = []
    for comp_code, our_league in COMPETITIONS.items():
        # Toutes les journées des 21 prochains jours (multi-GW pour Sorare Pro)
        fixtures = fetch_upcoming_fixtures(comp_code, our_league, days_ahead=21)
        all_fixtures.extend(fixtures)
        time.sleep(6.5)
        # Dernière journée terminée (résultats récents pour Stellar)
        finished = fetch_recent_finished(comp_code, our_league, days_back=8)
        # Dedup par (date, home_api, away_api) — pas juste par date.
        # Why: si PSG-Angers est UPCOMING aujourd'hui et OL-Auxerre FINISHED aujourd'hui,
        # un dedup par date virait OL-Auxerre du fixtures.json -> scores invisibles.
        upcoming_keys = {(f["date"], f.get("home_api",""), f.get("away_api","")) for f in fixtures}
        finished = [f for f in finished if (f["date"], f.get("home_api",""), f.get("away_api","")) not in upcoming_keys]
        all_fixtures.extend(finished)
        time.sleep(6.5)

    # Competitions europeennes — UCL via API, UEL/UECL hardcodées
    print("\n--- Competitions europeennes ---")
    for comp_code, comp_label in EURO_COMPETITIONS.items():
        euro_fixtures = fetch_euro_fixtures(comp_code, comp_label, days_ahead=14)
        all_fixtures.extend(euro_fixtures)
        if euro_fixtures:
            time.sleep(6.5)

    # UEL + UECL manuelles (football-data.org ne les inclut pas dans le plan gratuit)
    manual_euro = get_manual_euro_fixtures()
    all_fixtures.extend(manual_euro)

    # MLS via Sorare API
    try:
        mls_fixtures = fetch_mls_fixtures()
        all_fixtures.extend(mls_fixtures)
    except Exception as e:
        print(f"⚠️ MLS fixtures skipped: {e}")

    print(f"\n📋 Total: {len(all_fixtures)} matchs récupérés")

    # Build player → fixture mapping (ligues domestiques uniquement, pas UCL/UEL/UECL)
    # Inclure les matchs de la GW en cours (depuis le dernier Ven ou Mar 16h Paris)
    # pour que la Database affiche le Score GW + adversaire de cette GW
    from datetime import timezone
    now_utc = datetime.now(timezone.utc)
    # GW start = dernier Vendredi ou Mardi a 14h UTC (= 16h Paris)
    weekday = now_utc.weekday()  # 0=Mon ... 6=Sun
    # Days since last Tue(1) or Fri(4) at 14:00 UTC
    candidates = []
    for target_wd in [1, 4]:  # Tuesday, Friday
        diff = (weekday - target_wd) % 7
        candidate = now_utc - timedelta(days=diff)
        candidate = candidate.replace(hour=14, minute=0, second=0, microsecond=0)
        if candidate > now_utc:
            candidate -= timedelta(days=7)
        candidates.append(candidate)
    gw_start = max(candidates)
    gw_start_str = gw_start.strftime("%Y-%m-%d")
    print(f"\n📅 GW start: {gw_start_str} (pour player_fixtures)")

    domestic_fixtures = [
        f for f in all_fixtures
        if not f.get("competition") and f.get("date", "") >= gw_start_str
    ]
    player_fixtures = build_player_fixtures(domestic_fixtures, teams, players)

    # Save fixtures.json
    output = {
        "generated": datetime.now().isoformat(),
        "matchdays": {},
        "fixtures": all_fixtures,
        "player_fixtures": player_fixtures,
    }

    # Group matchdays by league — uniquement les matchs à venir (pas les terminés)
    for f in all_fixtures:
        if not f.get("finished"):
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
