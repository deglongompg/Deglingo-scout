#!/usr/bin/env python3
"""
Fix titu_pct offline — recalculate from existing data.
The bug: titu_pct was calculated as matchs_played / ALL_so5Scores instead of league-only.
Fix: titu_pct = matchs_played / league_matchday_count (approximated from data).

Since we don't have the raw so5Scores anymore, we approximate:
- matchs_played = number of non-zero scores in last_10/last_15
- matchs_total = number of league matchdays the player's team has played (from fixtures)
- titu_pct = matchs_played / matchs_total * 100
"""

import json, os, time

LEAGUE_FILES = {
    "L1": "deglingo_ligue1_final.json",
    "PL": "deglingo_premier_league_final.json",
    "Liga": "deglingo_la_liga_final.json",
    "Bundes": "deglingo_bundesliga_final.json",
}

start = time.time()
total_fixed = 0

for league, filename in LEAGUE_FILES.items():
    filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)
    if not os.path.exists(filepath):
        print(f"  {filename} not found, skipping")
        continue

    with open(filepath, "r", encoding="utf-8") as f:
        players = json.load(f)

    fixed = 0
    for p in players:
        # Use last_10 to count actual league matches played
        # last_10 only contains league scores (filtered during fetch)
        last_scores = p.get("last_10") or p.get("last_5") or []
        if not last_scores:
            continue

        # Count non-zero scores = matches actually played in league
        played = sum(1 for s in last_scores if s and s > 0)
        # Total = number of league matchdays in the sample
        # Use 10 as baseline (last_10), or actual length if shorter
        total = min(10, len(last_scores)) if len(last_scores) > 0 else 10

        if total == 0:
            continue

        old_titu = p.get("titu_pct", 0)
        new_titu = round(played / total * 100)

        if old_titu != new_titu:
            p["titu_pct"] = new_titu
            p["matchs_played"] = played
            p["matchs_total"] = total
            fixed += 1

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(players, f, ensure_ascii=False, indent=2)

    print(f"  {league}: {fixed} players fixed")
    total_fixed += fixed

elapsed = time.time() - start
print(f"\n  Total: {total_fixed} players fixed in {elapsed:.1f}s")
