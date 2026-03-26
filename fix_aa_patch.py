#!/usr/bin/env python3
"""Patch AA scores for all players in a league JSON using correct allAroundStats calculation."""
import requests, json, time, sys

URL = "https://api.sorare.com/federation/graphql"
H = {"Content-Type": "application/json"}
AA_CATS = {"GENERAL", "DEFENDING", "ATTACKING", "PASSING", "POSSESSION"}

def q(query, variables={}):
    r = requests.post(URL, json={"query": query, "variables": variables}, headers=H)
    return r.json()

avg = lambda x: sum(x)/len(x) if x else 0

def fix_player_aa(slug):
    """Fetch correct AA for a player."""
    raw = q("""query P($slug: String!) { football { player(slug: $slug) {
        so5Scores(last: 15) { score allAroundStats { category totalScore } }
    }}}""", {"slug": slug})
    time.sleep(1.2)
    
    try:
        scores = raw["data"]["football"]["player"]["so5Scores"]
        played = [s for s in scores if s.get("score", 0) > 0]
    except:
        return None
    
    if len(played) < 2:
        return None
    
    aa_scores = []
    for m in played:
        aa_stats = m.get("allAroundStats", [])
        if aa_stats:
            aa_scores.append(sum(a.get("totalScore", 0) for a in aa_stats if a.get("category") in AA_CATS))
        else:
            aa_scores.append(0)
    
    return {
        "aa2": round(avg(aa_scores[:2]), 1),
        "aa3": round(avg(aa_scores[:3]), 1),
        "aa5": round(avg(aa_scores[:5]), 1) if len(aa_scores) >= 5 else round(avg(aa_scores), 1),
        "aa10": round(avg(aa_scores[:10]), 1) if len(aa_scores) >= 10 else round(avg(aa_scores), 1),
        "aa15": round(avg(aa_scores[:15]), 1) if len(aa_scores) >= 15 else round(avg(aa_scores), 1),
        "aa_trend": round(avg(aa_scores[:2]) - avg(aa_scores[:5]), 1) if len(aa_scores) >= 5 else 0,
    }

league_file = sys.argv[1] if len(sys.argv) > 1 else "deglingo_ligue1_final.json"
data = json.load(open(league_file, "r", encoding="utf-8"))
print(f"📂 {len(data)} joueurs dans {league_file}")

# Find suspects (AA ≈ L score)
suspects = []
for p in data:
    l5 = p.get("l5", 0) or 0
    aa5 = p.get("aa5", 0) or 0
    if l5 > 10 and aa5 > 10 and abs(aa5 - l5) < 3:
        suspects.append(p)

print(f"🔍 {len(suspects)} joueurs suspects (AA ≈ L)")

fixed = 0
for i, p in enumerate(suspects):
    slug = p["slug"]
    name = p["name"]
    print(f"  [{i+1}/{len(suspects)}] {name}...", end=" ", flush=True)
    
    aa = fix_player_aa(slug)
    if aa is None:
        print("skip")
        continue
    
    # Update in data
    for dp in data:
        if dp["slug"] == slug:
            old_aa5 = dp["aa5"]
            dp.update(aa)
            print(f"AA5: {old_aa5} → {aa['aa5']}")
            fixed += 1
            break
    
    # Save every 20 players
    if fixed % 20 == 0:
        with open(league_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

# Final save
with open(league_file, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"\n✅ {fixed}/{len(suspects)} joueurs corrigés dans {league_file}")
