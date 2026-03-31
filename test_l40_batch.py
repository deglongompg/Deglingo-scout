#!/usr/bin/env python3
"""Batch test L40 — compare notre calcul vs Sorare affiché"""
import requests, json, os, time
from dotenv import load_dotenv

load_dotenv()

URL = "https://api.sorare.com/federation/graphql"
API_KEY = os.getenv("SORARE_API_KEY", "")
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "Accept": "application/json"}
if API_KEY:
    HEADERS["APIKEY"] = API_KEY

# Valeurs Sorare visibles dans le screenshot
SORARE_TRUTH = {
    "lamine-yamal":         77,
    "michael-olise":        74,
    "harry-kane":           69,
    "pedri":                69,
    "vitinha":              69,
    "bruno-fernandes":      68,
    "nico-schlotterbeck":   68,
    "gabriel-magalhaes":    67,
    "alejandro-grimaldo":   66,
}

Q = """query($slug: String!) { football { player(slug: $slug) {
    displayName
    so5Scores(last: 40) { score }
}}}"""

def avg(lst):
    return sum(lst) / len(lst) if lst else 0

print(f"{'Joueur':<25} {'Sorare':>8} {'Ancien':>8} {'Nouveau':>8} {'Δ anc':>7} {'Δ nouv':>7}  Status")
print("-" * 80)

for slug, sorare_val in SORARE_TRUTH.items():
    try:
        r = requests.post(URL, json={"query": Q, "variables": {"slug": slug}}, headers=HEADERS, timeout=30)
        data = r.json()
        player = data["data"]["football"]["player"]
        all_scores = player["so5Scores"]
        name = player["displayName"][:24]

        # Ancien calcul (excluait les 0)
        old = round(avg([s["score"] for s in all_scores if s.get("score", 0) > 0][:40]), 1)
        # Nouveau calcul (inclut les 0)
        new = round(avg([s.get("score", 0) for s in all_scores[:40]]), 1)

        delta_old  = round(old - sorare_val, 1)
        delta_new  = round(new - sorare_val, 1)
        ok = "✅" if abs(delta_new) <= 1 else "❌"

        print(f"{name:<25} {sorare_val:>8} {old:>8} {new:>8} {delta_old:>+7} {delta_new:>+7}  {ok}")
        time.sleep(0.15)
    except Exception as e:
        print(f"{slug:<25} {'ERR':>8}  {e}")
        time.sleep(1)
