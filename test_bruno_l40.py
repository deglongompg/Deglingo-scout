#!/usr/bin/env python3
"""Test L40 pour Bruno Fernandes — compare ancien vs nouveau calcul"""
import requests, json, os
from dotenv import load_dotenv

load_dotenv()

URL = "https://api.sorare.com/federation/graphql"
API_KEY = os.getenv("SORARE_API_KEY", "")
HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
}
if API_KEY:
    HEADERS["APIKEY"] = API_KEY

QUERY = """query { football { player(slug: "bruno-fernandes") {
    displayName
    so5Scores(last: 40) {
        score
        game { date competition { slug } }
    }
}}}"""

r = requests.post(URL, json={"query": QUERY}, headers=HEADERS, timeout=30)
data = r.json()
player = data["data"]["football"]["player"]
all_scores = player["so5Scores"]

print(f"Joueur : {player['displayName']}")
print(f"Matchs retournés par l'API : {len(all_scores)}")
print()

# Affiche les 40 scores bruts
print("Scores bruts (last 40) :")
for i, s in enumerate(all_scores):
    comp = (s.get("game") or {}).get("competition", {}).get("slug", "?")
    date = (s.get("game") or {}).get("date", "?")[:10]
    print(f"  {i+1:2}. score={s.get('score', 0):5.1f}  comp={comp}  date={date}")

print()

# ANCIEN calcul (score > 0 filtrés d'abord)
old_scores = [s["score"] for s in all_scores if s.get("score", 0) > 0][:40]
old_l40 = round(sum(old_scores) / len(old_scores), 1) if old_scores else 0

# NOUVEAU calcul (brut, incluant 0s)
new_scores = [s.get("score", 0) for s in all_scores[:40]]
new_l40 = round(sum(new_scores) / len(new_scores), 1) if new_scores else 0

print(f"Ancien calcul (excluait les 0) : L40 = {old_l40}  (sur {len(old_scores)} matchs non-nuls)")
print(f"Nouveau calcul (inclut les 0)  : L40 = {new_l40}  (sur {len(new_scores)} matchs)")
print(f"Sorare affiche : 68")
print(f"Match Sorare ? {'✅ OUI' if new_l40 == 68.0 else f'❌ NON ({new_l40})'}")
