"""Verifie cross-check des noms clubs JPL + Ere : API-Football, players.json, teams.json, club_aliases.
Objectif : aucun club JPL/Ere sans match parfait entre les 3 sources.
"""
import json, sys, io, os, requests
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from dotenv import load_dotenv
load_dotenv()

KEY = os.getenv("API_FOOTBALL_KEY")
HEADERS = {"x-apisports-key": KEY}

# 1. API-Football : noms exacts qui sortiront dans fixtures
print("=" * 80)
print("1. API-Football : team names actually returned by /teams endpoint")
print("=" * 80)
api_clubs = {}
for code, league_id in [("JPL", 144), ("Ere", 88)]:
    r = requests.get(
        "https://v3.football.api-sports.io/teams",
        headers=HEADERS,
        params={"league": league_id, "season": 2025},
        timeout=30,
    )
    teams = r.json().get("response", [])
    api_clubs[code] = sorted({(t.get("team") or {}).get("name") for t in teams if (t.get("team") or {}).get("name")})
    print(f"\n{code} ({len(api_clubs[code])} clubs):")
    for n in api_clubs[code]:
        print(f"  - {n}")

# 2. players.json clubs
print("\n" + "=" * 80)
print("2. players.json : club names utilises par Sorare (vrai canonical)")
print("=" * 80)
players = json.load(open("deglingo-scout-app/public/data/players.json", encoding="utf-8"))
players_clubs = {}
for code in ("JPL", "Ere"):
    s = sorted({p.get("club") for p in players if p.get("league") == code and p.get("club")})
    players_clubs[code] = s
    print(f"\n{code} ({len(s)}):")
    for n in s: print(f"  - {n}")

# 3. teams.json
print("\n" + "=" * 80)
print("3. teams.json : team names dans la base xG/xGA")
print("=" * 80)
teams = json.load(open("deglingo-scout-app/public/data/teams.json", encoding="utf-8"))
teams_clubs = {}
for code in ("JPL", "Ere"):
    s = sorted({t.get("name") for t in teams if t.get("league") == code})
    teams_clubs[code] = s
    print(f"\n{code} ({len(s)}):")
    for n in s: print(f"  - {n}")

# 4. club_aliases.json
print("\n" + "=" * 80)
print("4. club_aliases.json : mappings actuels (API name -> Sorare canonical)")
print("=" * 80)
aliases = json.load(open("club_aliases.json", encoding="utf-8"))

# Application alias to API names
def to_canon(api_name): return aliases.get(api_name, api_name)

# Cross-check : pour chaque API name -> apres alias -> est-ce dans players.json ?
print("\n" + "=" * 80)
print("CROSS-CHECK : pour chaque club API-Football (apres alias), match avec players.json ?")
print("=" * 80)
issues_total = []
for code in ("JPL", "Ere"):
    print(f"\n--- {code} ---")
    pset = set(players_clubs[code])
    tset = set(teams_clubs[code])
    for api_name in api_clubs[code]:
        aliased = to_canon(api_name)
        in_players = aliased in pset
        in_teams = aliased in tset
        # Si pas dans teams mais teams a un autre nom, montre le candidat le plus proche
        status_p = "OK" if in_players else "MISS"
        status_t = "OK" if in_teams else "MISS"
        flag = "[OK]" if in_players and in_teams else ("[ALIAS?]" if not in_players else "[teams?]")
        print(f"  {flag} api='{api_name:30s}' alias='{aliased:30s}' players={status_p:4s} teams={status_t}")
        if not in_players:
            # Suggest candidate
            cand = [p for p in pset if api_name.lower() in p.lower() or p.lower() in api_name.lower()
                    or any(w in p.lower() for w in api_name.lower().split() if len(w) > 3)]
            if cand:
                print(f"        candidates players.json : {cand[:3]}")
            issues_total.append((code, api_name, aliased, "not in players"))
        if not in_teams:
            cand_t = [t for t in tset if api_name.lower() in t.lower() or t.lower() in api_name.lower()]
            if cand_t and cand_t != [aliased]:
                print(f"        candidates teams.json : {cand_t[:3]}")

# Inverse : clubs presents dans players.json mais pas dans teams.json (orphans)
print("\n" + "=" * 80)
print("INVERSE : clubs players.json sans entree teams.json")
print("=" * 80)
for code in ("JPL", "Ere"):
    pset = set(players_clubs[code])
    # Map alias canonicals
    api_canonicals = {to_canon(n) for n in api_clubs[code]}
    only_in_players = pset - api_canonicals
    if only_in_players:
        print(f"\n{code}:")
        for n in sorted(only_in_players):
            print(f"  ! {n}  (loan/D2 ?)")

print("\n" + "=" * 80)
print(f"ISSUES TOTAL : {len(issues_total)}")
print("=" * 80)
for code, api, alias, msg in issues_total:
    print(f"  [{code}] '{api}' (alias='{alias}') -> {msg}")
