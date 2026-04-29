#!/usr/bin/env python3
"""
patch_mls_stats.py — Patch teams.json MLS avec :
  - xG/xGA depuis Sorare (screenshot 28/04/2026)
  - PPDA depuis TheAnalyst (https://theanalyst.com/competition/mls/stats, 29/04/2026)

Usage : py patch_mls_stats.py
Manuel one-shot. A relancer quand on veut refresh MLS.
Pour l'auto, voir TODO scrape TheAnalyst.
"""
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Sorare xG MLS per 90, screenshot 28/04/2026 (incluant xG, xGA, MP)
SORARE_XG = {
    "Vancouver Whitecaps FC":  (9,  2.03, 0.89),
    "San Jose Earthquakes":    (10, 1.74, 1.14),
    "New York Red Bulls":      (10, 1.73, 1.47),
    "Real Salt Lake":          (9,  1.73, 1.48),
    "Inter Miami CF":          (10, 1.69, 1.27),  # Club Internacional de Futbol Miami
    "LA Galaxy":               (10, 1.66, 1.31),
    "St. Louis City SC":       (9,  1.62, 1.28),
    "FC Cincinnati":           (10, 1.58, 1.73),
    "Philadelphia Union":      (10, 1.57, 1.09),
    "New York City FC":        (10, 1.51, 1.39),
    "Columbus Crew":           (10, 1.50, 1.04),
    "Houston Dynamo":          (9,  1.49, 1.54),
    "Chicago Fire":            (10, 1.49, 1.40),
    "Nashville SC":            (9,  1.49, 1.01),
    "FC Dallas":               (10, 1.47, 1.13),
    "Los Angeles FC":          (10, 1.46, 1.49),
    "Minnesota United FC":     (10, 1.45, 1.61),
    "Toronto FC":              (10, 1.41, 1.26),
    "Colorado Rapids":         (10, 1.39, 1.48),
    "Atlanta United FC":       (10, 1.33, 1.34),
    "Charlotte FC":            (10, 1.33, 1.64),
    "Seattle Sounders FC":     (8,  1.32, 1.49),
    "Portland Timbers":        (9,  1.28, 2.05),
    "San Diego FC":            (10, 1.28, 1.44),
    "CF Montréal":             (9,  1.25, 1.41),
    "Austin FC":               (10, 1.22, 2.06),
    "Orlando City SC":         (10, 1.21, 1.93),
    "D.C. United":             (10, 1.20, 1.43),
    "New England Revolution":  (9,  1.18, 1.80),
    "Sporting Kansas City":    (9,  0.83, 1.89),
}

# TheAnalyst PPDA, 29/04/2026 (site MLS stats team-level high turnovers)
ANALYST_PPDA = {
    "Vancouver Whitecaps FC":  8.9,
    "Philadelphia Union":      9.3,
    "Real Salt Lake":          13.9,
    "St. Louis City SC":       12.2,
    "New York Red Bulls":      9.9,
    "Columbus Crew":           12.0,
    "New York City FC":        11.4,
    "San Jose Earthquakes":    13.5,
    "CF Montréal":             11.2,
    "Toronto FC":              11.9,
    "Colorado Rapids":         10.8,
    "D.C. United":             12.8,
    "Nashville SC":            14.1,
    "FC Dallas":               13.0,
    "Seattle Sounders FC":     12.3,
    "Atlanta United FC":       14.1,
    "Inter Miami CF":          12.2,
    "LA Galaxy":               15.2,
    "FC Cincinnati":           11.3,
    "Houston Dynamo":          18.1,
    "Sporting Kansas City":    15.2,
    "Minnesota United FC":     13.4,
    "San Diego FC":            11.9,
    "Los Angeles FC":          15.6,
    "Portland Timbers":        16.2,
    "Chicago Fire":            11.4,
    "Orlando City SC":         15.8,
    "New England Revolution":  17.3,
    "Austin FC":               15.9,
    "Charlotte FC":            18.1,
}

# Aliases pour matcher avec teams.json (parfois noms diffèrent)
ALIASES = {
    "Inter Miami CF": ["Inter Miami CF", "Club Internacional de Futbol Miami"],
    "Vancouver Whitecaps FC": ["Vancouver Whitecaps FC", "Vancouver Whitecaps"],
    "Nashville SC": ["Nashville SC", "Nashville SC MLS"],
    "CF Montréal": ["CF Montréal", "Montréal", "CF Montreal"],
    "D.C. United": ["D.C. United", "DC United"],
    "St. Louis City SC": ["St. Louis City SC", "St. Louis City"],
    "Atlanta United FC": ["Atlanta United FC", "Atlanta United"],
}


def norm(s):
    s = (s or "").lower().strip()
    return s.replace(".", "").replace("-", " ").replace("  ", " ")


def find_team(teams, name, league="MLS"):
    """Trouve une team dans teams.json par nom (avec aliases)."""
    candidates = ALIASES.get(name, [name])
    for cand in candidates:
        nc = norm(cand)
        for t in teams:
            if t.get("league") != league: continue
            if norm(t.get("name", "")) == nc: return t
    # Fuzzy contains
    for cand in candidates:
        nc = norm(cand)
        for t in teams:
            if t.get("league") != league: continue
            tn = norm(t.get("name", ""))
            if nc in tn or tn in nc: return t
    return None


def main():
    teams_path = "deglingo-scout-app/public/data/teams.json"
    with open(teams_path, encoding="utf-8") as f:
        teams = json.load(f)

    matched = 0
    missing = []
    for sorare_name, (mp, xg, xga) in SORARE_XG.items():
        ppda = ANALYST_PPDA.get(sorare_name)
        team = find_team(teams, sorare_name)
        if not team:
            missing.append(sorare_name)
            continue
        team["xg"] = round(xg, 2)
        team["xga"] = round(xga, 2)
        team["matches"] = mp
        if ppda is not None:
            team["ppda"] = round(ppda, 1)
        matched += 1
        print(f"  {team['name']:30s}  xg={team['xg']}  xga={team['xga']}  ppda={team.get('ppda')}  mp={mp}")

    print(f"\n{matched}/{len(SORARE_XG)} teams MLS patchees")
    if missing:
        print(f"Non matches : {missing}")
        print("(verifier les noms dans teams.json + ajuster ALIASES)")

    with open(teams_path, "w", encoding="utf-8") as f:
        json.dump(teams, f, ensure_ascii=False, indent=2)
    print(f"\nSauve : {teams_path}")


if __name__ == "__main__":
    main()
