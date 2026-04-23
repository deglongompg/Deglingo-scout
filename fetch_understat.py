#!/usr/bin/env python3
"""
fetch_understat.py — Met a jour les stats xG/xGA/PPDA des equipes dans teams.json
a partir des dumps JSON Understat places dans understat_data/.

Les fichiers attendus (format Understat "league table") :
  understat_data/ligue1.json        — 18 clubs L1
  understat_data/premier_league.json — 20 clubs PL
  understat_data/la_liga.json        — 20 clubs Liga
  understat_data/bundesliga.json     — 18 clubs Bundes

Format par equipe (Understat) :
  { number, team, matches, wins, draws, loses, goals, ga, points, xG, xGA, ppda, xPTS }

Update dans teams.json :
  - xg, xga, ppda, goals, ga, matches, wins, draws, loses, xpts
  - Conserve les split dom/ext existants (pas fournis par Understat league table)

Usage : python3 fetch_understat.py

Refresh manuel : redownload les 4 JSON depuis https://understat.com/league/{Ligue_1,EPL,La_liga,Bundesliga},
remplace les fichiers dans understat_data/, relance le script.
"""

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent
DATA_DIR = ROOT / "understat_data"
TEAMS_JSON_PATHS = [
    ROOT / "deglingo-scout-app" / "public" / "data" / "teams.json",
    ROOT / "public" / "data" / "teams.json",  # mirror eventuel
]

# Mapping nom fichier -> league code dans teams.json
LEAGUE_FILES = {
    "ligue1.json": "L1",
    "premier_league.json": "PL",
    "la_liga.json": "Liga",
    "bundesliga.json": "Bundes",
}


def load_understat_stats():
    """Charge tous les JSON Understat et renvoie { league_code: { team_name: stats } }."""
    out = {}
    for fname, lg in LEAGUE_FILES.items():
        path = DATA_DIR / fname
        if not path.exists():
            print(f"  [WARN] {path} absent — ligue {lg} non mise a jour")
            continue
        try:
            data = json.load(open(path, encoding="utf-8-sig"))
        except Exception as e:
            print(f"  [ERR] {path} invalide : {e}")
            continue
        out[lg] = {entry["team"]: entry for entry in data if entry.get("team")}
        print(f"  [OK] {lg}: {len(out[lg])} equipes lues depuis {fname}")
    return out


def update_teams_json(target_path, understat):
    """Ouvre teams.json et update les stats. Retourne nb equipes mises a jour."""
    if not target_path.exists():
        print(f"  [WARN] {target_path} absent, skip")
        return 0
    teams = json.load(open(target_path, encoding="utf-8-sig"))  # supporte BOM

    updated = 0
    missing = []
    for team in teams:
        lg = team.get("league")
        name = team.get("name")
        if lg not in understat:
            continue
        stats = understat[lg].get(name)
        if not stats:
            missing.append(f"{lg}/{name}")
            continue
        # Update stats globales Understat
        matches = stats.get("matches") or 1
        team["matches"] = matches
        team["wins"] = stats.get("wins", team.get("wins", 0))
        team["draws"] = stats.get("draws", team.get("draws", 0))
        team["loses"] = stats.get("loses", team.get("loses", 0))
        team["points"] = stats.get("points", team.get("points", 0))
        team["goals"] = stats.get("goals", team.get("goals", 0))
        team["ga"] = stats.get("ga", team.get("ga", 0))
        team["xpts"] = stats.get("xPTS", team.get("xpts", 0))
        # xG / xGA globaux : on garde la valeur totale + on calcule per-match pour D-Score
        xg_total = stats.get("xG")
        xga_total = stats.get("xGA")
        ppda = stats.get("ppda")
        if xg_total is not None:
            team["xg_total"] = xg_total
            team["xg"] = round(xg_total / matches, 2)  # xG par match (utilise par D-Score)
        if xga_total is not None:
            team["xga_total"] = xga_total
            team["xga"] = round(xga_total / matches, 2)  # xGA par match
        if ppda is not None:
            team["ppda"] = ppda
        # npxg / npxga : pas fournis par Understat league table, on garde ce qui existe.
        # Split dom/ext : pas fourni, on garde les valeurs actuelles (faire une MAJ plus
        # fine necessiterait scraping des pages /team/ individuelles).
        updated += 1
    # Sauvegarde
    # Ecriture en utf-8 sans BOM (evite de corrompre les autres readers)
    json.dump(teams, open(target_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    if missing:
        print(f"  [WARN] {len(missing)} equipes sans match Understat :", ", ".join(missing[:10]))
    return updated


def main():
    print("=" * 60)
    print("  fetch_understat — MAJ xG/xGA/PPDA equipes")
    print("=" * 60)
    understat = load_understat_stats()
    if not understat:
        print("[ERR] Aucun fichier Understat trouve dans", DATA_DIR)
        sys.exit(1)

    for target in TEAMS_JSON_PATHS:
        print(f"\n-- Update {target} ...")
        n = update_teams_json(target, understat)
        print(f"  {n} equipes mises a jour")

    print("\n[OK] Done. Relance 'npm run build' pour propager dans l'app.")


if __name__ == "__main__":
    main()
