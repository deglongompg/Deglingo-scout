#!/usr/bin/env python3
"""
Fix GK AA scores — re-fetch allAroundStats for all GK across 4 leagues.
Sums ALL categories (not just AA_CATS) to include GOALKEEPING/SAVES.

Usage: python fix_gk_aa.py
"""

import requests, json, time, os
from dotenv import load_dotenv

load_dotenv()

URL = "https://api.sorare.com/federation/graphql"
API_KEY = os.getenv("SORARE_API_KEY", "")
HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}
if API_KEY:
    HEADERS["APIKEY"] = API_KEY
    SLEEP = 0.12  # ~500 req/min
else:
    SLEEP = 2.5
    print("⚠️ Pas d'API Key — mode lent")

VALID_COMPS = {
    "premier-league-gb-eng", "laliga-es", "bundesliga-de", "ligue-1-fr",
}

Q_GK_AA = """query P($slug: String!) { football { player(slug: $slug) {
    so5Scores(last: 25) {
        score
        allAroundStats { category totalScore }
        game { competition { slug } }
    }
}}}"""

LEAGUE_FILES = {
    "L1": "deglingo_ligue1_final.json",
    "PL": "deglingo_premier_league_final.json",
    "Liga": "deglingo_la_liga_final.json",
    "Bundes": "deglingo_bundesliga_final.json",
}


def avg(lst):
    return sum(lst) / len(lst) if lst else 0


def gql(query, variables, label=""):
    for attempt in range(3):
        try:
            r = requests.post(URL, json={"query": query, "variables": variables}, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                return r.json()
            elif r.status_code == 429:
                print(f"  ⏳ Rate limited, waiting 10s...")
                time.sleep(10)
            elif r.status_code == 403:
                print(f"  🚫 403 Forbidden — waiting 30s...")
                time.sleep(30)
            else:
                print(f"  ⚠️ HTTP {r.status_code} for {label}")
                time.sleep(2)
        except Exception as e:
            print(f"  ❌ Error: {e}")
            time.sleep(3)
    return None


def fix_gk_aa():
    total_fixed = 0

    for league, filename in LEAGUE_FILES.items():
        filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)
        if not os.path.exists(filepath):
            print(f"⚠️ {filename} not found, skipping {league}")
            continue

        with open(filepath, "r", encoding="utf-8") as f:
            players = json.load(f)

        gks = [p for p in players if p.get("position") in ("GK", "Goalkeeper") and p.get("slug")]
        print(f"\n{'='*50}")
        print(f"[LEAGUE] {league} — {len(gks)} GK à corriger")
        print(f"{'='*50}")

        for i, gk in enumerate(gks):
            slug = gk["slug"]
            print(f"  [{i+1}/{len(gks)}] {gk['name']:30s}", end=" ")

            raw = gql(Q_GK_AA, {"slug": slug}, label=slug)
            time.sleep(SLEEP)

            if not raw:
                print("❌ fetch failed")
                continue

            try:
                so5 = raw["data"]["football"]["player"]["so5Scores"]
            except (KeyError, TypeError):
                print("❌ no data")
                continue

            # Filter: league matches only, score > 0
            played = []
            for s in so5:
                if s.get("score", 0) <= 0:
                    continue
                comp = (s.get("game") or {}).get("competition", {}).get("slug", "")
                if comp in VALID_COMPS:
                    played.append(s)

            if not played:
                print("⚠️ no matches")
                continue

            # Calculate AA: sum ALL categories (GK needs GOALKEEPING)
            aa_scores = []
            for m in played:
                aa_stats = m.get("allAroundStats") or []
                if aa_stats:
                    total = sum(a.get("totalScore", 0) for a in aa_stats)
                    aa_scores.append(total)
                else:
                    aa_scores.append(0)

            old_aa5 = gk.get("aa5", 0)
            old_aa10 = gk.get("aa10", 0)

            new_aa2 = round(avg(aa_scores[:2]), 1) if len(aa_scores) >= 2 else round(avg(aa_scores), 1)
            new_aa3 = round(avg(aa_scores[:3]), 1) if len(aa_scores) >= 3 else round(avg(aa_scores), 1)
            new_aa5 = round(avg(aa_scores[:5]), 1) if len(aa_scores) >= 5 else round(avg(aa_scores), 1)
            new_aa10 = round(avg(aa_scores[:10]), 1) if len(aa_scores) >= 10 else round(avg(aa_scores), 1)
            new_aa15 = round(avg(aa_scores[:15]), 1) if len(aa_scores) >= 15 else round(avg(aa_scores), 1)
            new_aa25 = round(avg(aa_scores[:25]), 1) if len(aa_scores) >= 25 else round(avg(aa_scores), 1)

            # Update player data
            gk["aa2"] = new_aa2
            gk["aa3"] = new_aa3
            gk["aa5"] = new_aa5
            gk["aa10"] = new_aa10
            gk["aa15"] = new_aa15
            gk["aa25"] = new_aa25

            print(f"AA5: {old_aa5:>6} → {new_aa5:>6} | AA10: {old_aa10:>6} → {new_aa10:>6} ✅")
            total_fixed += 1

        # Save updated league file
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(players, f, ensure_ascii=False, indent=2)
        print(f"💾 {filename} saved")

    print(f"\n🎯 Total: {total_fixed} GK fixed across all leagues")


if __name__ == "__main__":
    fix_gk_aa()
