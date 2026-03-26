#!/usr/bin/env python3
"""Re-patch ALL players' AA scores (not just suspects)."""
import requests, json, time, sys

URL = "https://api.sorare.com/federation/graphql"
H = {"Content-Type": "application/json"}
AA_CATS = {"GENERAL", "DEFENDING", "ATTACKING", "PASSING", "POSSESSION"}

def q(query, variables={}):
    for attempt in range(3):
        try:
            r = requests.post(URL, json={"query": query, "variables": variables}, headers=H, timeout=15)
            return r.json()
        except:
            time.sleep(3 * (attempt + 1))
    return {}

avg = lambda x: sum(x)/len(x) if x else 0

def fix_player_aa(slug):
    raw = q("""query P($slug: String!) { football { player(slug: $slug) {
        so5Scores(last: 15) { score allAroundStats { category totalScore } }
    }}}""", {"slug": slug})
    time.sleep(1.0)
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

league_file = sys.argv[1]
data = json.load(open(league_file, "r", encoding="utf-8"))
print(f"📂 {len(data)} joueurs dans {league_file}")

fixed = 0
for i, p in enumerate(data):
    slug = p["slug"]
    name = p["name"]
    print(f"[{i+1}/{len(data)}] {name}...", end=" ", flush=True)
    aa = fix_player_aa(slug)
    if aa is None:
        print("skip")
        continue
    old = p["aa5"]
    p.update(aa)
    changed = "✅" if abs(old - aa["aa5"]) > 0.5 else "ok"
    print(f"{changed} AA5: {old} → {aa['aa5']}")
    fixed += 1
    if fixed % 25 == 0:
        with open(league_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  💾 saved ({fixed} done)")

with open(league_file, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f"\n✅ {fixed}/{len(data)} joueurs traités")
