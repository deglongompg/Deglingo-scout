import json, os, shutil

LEAGUES = {
    "deglingo_ligue1_final.json": "L1",
    "deglingo_premier_league_final.json": "PL",
    "deglingo_la_liga_final.json": "Liga",
    "deglingo_bundesliga_final.json": "Bundes",
}

POS_MAP = {
    "Goalkeeper": "GK",
    "Defender": "DEF",
    "Midfielder": "MIL",
    "Forward": "ATT",
}

all_players = []

for filename, league_short in LEAGUES.items():
    with open(filename, "r", encoding="utf-8") as f:
        players = json.load(f)
    for p in players:
        p["position"] = POS_MAP.get(p.get("position", ""), p.get("position", ""))
        p["league"] = league_short
        apps = max(p.get("appearances", 1), 1)
        p["ga_per_match"] = round((p.get("goals", 0) + p.get("assists", 0)) / apps, 3)
        all_players.append(p)

os.makedirs("public/data", exist_ok=True)

with open("public/data/players.json", "w", encoding="utf-8") as f:
    json.dump(all_players, f, ensure_ascii=False)

shutil.copy("teams_data.json", "public/data/teams.json")

print(f"✅ {len(all_players)} joueurs exportés → public/data/players.json")
print(f"✅ teams.json copié → public/data/teams.json")
