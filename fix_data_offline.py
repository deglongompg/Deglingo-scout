#!/usr/bin/env python3
"""
Fix offline: repair titu_pct, reg10, aa2/aa5/aa10/aa15 for all leagues.
Does NOT re-fetch from API — works purely on existing JSON data.
"""
import json, math

FILES = {
    "L1":     "deglingo_ligue1_final.json",
    "PL":     "deglingo_premier_league_final.json",
    "Liga":   "deglingo_la_liga_final.json",
    "Bundes": "deglingo_bundesliga_final.json",
}

def avg(l): return sum(l)/len(l) if l else 0

for league, fname in FILES.items():
    try:
        data = json.load(open(fname))
    except:
        print(f"❌ {fname} not found, skip")
        continue

    fixed_titu = 0
    fixed_reg = 0
    fixed_aa = 0

    for p in data:
        # --- Fix titu_pct ---
        mp = p.get("matchs_played", 0) or 0
        mt = p.get("matchs_total", 0) or 0
        if mt > 0 and (not p.get("titu_pct") or p["titu_pct"] == 0):
            p["titu_pct"] = round(mp / mt * 100)
            fixed_titu += 1

        # --- Fix reg10 ---
        # Use last_10 if available, otherwise last_5
        scores_10 = p.get("last_10") or p.get("last_5") or []
        if scores_10 and (p.get("reg10") is None or p["reg10"] == 0):
            ab60 = sum(1 for s in scores_10 if s > 60)
            p["reg10"] = round(ab60 / len(scores_10) * 100, 0)
            fixed_reg += 1
        elif p.get("reg10") is None:
            p["reg10"] = 0.0

        # --- Fix aa2/aa3/aa5/aa10/aa15 from AA profile components ---
        ad = p.get("aa_defending", 0) or 0
        ap = p.get("aa_passing", 0) or 0
        ao = p.get("aa_possession", 0) or 0
        at = p.get("aa_attacking", 0) or 0
        an = p.get("aa_negative", 0) or 0
        aa_total = round(ad + ap + ao + at + an, 1)

        if aa_total > 0 and (not p.get("aa5") or p["aa5"] == 0):
            # We only have averages, not per-match data, so use same value for all windows
            p["aa2"] = aa_total
            p["aa3"] = aa_total
            p["aa5"] = aa_total
            p["aa10"] = aa_total
            p["aa15"] = aa_total
            fixed_aa += 1

        # Ensure last_10 exists (copy from last_5 if needed)
        if not p.get("last_10") and p.get("last_5"):
            p["last_10"] = p["last_5"]

    json.dump(data, open(fname, "w"), ensure_ascii=False, indent=2)
    print(f"✅ {league} ({fname}): {len(data)} joueurs | titu fixed: {fixed_titu} | reg10 fixed: {fixed_reg} | aa fixed: {fixed_aa}")

print("\n🎉 Done!")
