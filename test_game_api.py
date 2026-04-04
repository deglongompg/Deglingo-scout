import requests, json, os, sys
sys.stdout.reconfigure(errors="replace")
from dotenv import load_dotenv
load_dotenv()

URL = "https://api.sorare.com/federation/graphql"
KEY = os.getenv("SORARE_API_KEY", "")
H   = {"Content-Type": "application/json", "APIKEY": KEY}

GAME_ID = "Game:60d674f3-3489-466d-a3f9-2cf1c0e4bf25"

# Tester differents noms de champs sur Game
Q = """query($id: ID!) { football { game(id: $id) {
  id
  homeScore
  awayScore
  homeTeam { name }
  awayTeam { name }
} } }"""

r = requests.post(URL, json={"query": Q, "variables": {"id": GAME_ID}}, headers=H, timeout=30)
d = r.json()
print("=== GAME BASE FIELDS ===")
print(json.dumps(d, indent=2, ensure_ascii=False))

# Tester les stats d'un joueur pour trouver les buts
Q2 = """query($slug: String!) { football { player(slug: $slug) {
  so5Scores(last: 1) {
    score
    game { id homeScore awayScore homeTeam { name } awayTeam { name } }
    playerGameStats {
      goals
      goalAssist
      minutesPlayed
    }
  }
} } }"""

# Utiliser Dembele (on connait son slug approximatif)
import json as _json
players = _json.load(open("deglingo-scout-app/public/data/players.json", encoding="utf-8"))
psg = [p for p in players if "paris" in p.get("club","").lower() and p.get("last_so5_date") == "2026-04-03"]
if psg:
    slug = psg[0]["slug"]
    print(f"\n=== PLAYER STATS ({psg[0]['name']}) slug={slug} ===")
    r2 = requests.post(URL, json={"query": Q2, "variables": {"slug": slug}}, headers=H, timeout=30)
    print(json.dumps(r2.json(), indent=2, ensure_ascii=False)[:2000])
