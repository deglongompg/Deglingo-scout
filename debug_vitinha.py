#!/usr/bin/env python3
"""debug_vitinha.py — Voir exactement ce que Sorare renvoie pour Vitinha"""
import requests, json, os
from dotenv import load_dotenv

load_dotenv()
URL = "https://api.sorare.com/federation/graphql"
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
key = os.getenv("SORARE_API_KEY", "")
if key:
    HEADERS["APIKEY"] = key
    print("🔑 API key active\n")

SLUG = "vitor-machado-ferreira"

# Query super large pour voir tout ce qui est dispo
Q = """{
  football {
    player(slug: "%s") {
      displayName
      playingStatus
      activeInjuries { active }
      activeSuspensions { active }
      nextClassicFixtureProjectedScore
      nextClassicFixturePlayingStatusOdds {
        starterOddsBasisPoints
      }
      nextGame {
        id
        date
        homeTeam { name }
        awayTeam { name }
        competition { displayName }
      }
    }
  }
}""" % SLUG

r = requests.post(URL, json={"query": Q}, headers=HEADERS, timeout=15)
body = r.json()
print("=== RÉPONSE COMPLÈTE ===")
print(json.dumps(body, indent=2, ensure_ascii=False))

# Interpretation
p = ((body.get("data") or {}).get("football") or {}).get("player") or {}
print("\n=== INTERPRETATION ===")
print(f"playingStatus (enum): {p.get('playingStatus')}")
odds = p.get("nextClassicFixturePlayingStatusOdds")
if odds is None:
    print(f"starterOddsBasisPoints: NULL → fallback enum utilise → mappe a 70% (REGULAR)")
else:
    bp = odds.get("starterOddsBasisPoints")
    print(f"starterOddsBasisPoints: {bp} → starter_pct = {min(round(bp/100), 90) if bp is not None else 'NULL'}")
game = p.get("nextGame") or {}
print(f"nextGame: {game.get('date','?')} {game.get('homeTeam',{}).get('name','?')} vs {game.get('awayTeam',{}).get('name','?')}")
print(f"competition: {(game.get('competition') or {}).get('displayName','?')}")

# Check : est-ce que nextGame est LE MEME match que "next classic fixture"?
# Si nextGame = PSG-Nantes (mid-week) mais nextClassicFixture = match WE prochain, c'est la source du probleme
print(f"\n🔍 Si nextGame (ce que Sorare affiche) != next Classic fixture (ce qu'on fetche),")
print(f"   alors nos odds viennent du MAUVAIS match -> faux 70% pour Vitinha.")
