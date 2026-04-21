#!/usr/bin/env python3
"""debug_doue.py — football.game(id: UUID) ACCESSIBLE ! Explore ses sous-champs pour les odds"""
import requests, json, os
from dotenv import load_dotenv

load_dotenv()
URL = "https://api.sorare.com/federation/graphql"
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
key = os.getenv("SORARE_API_KEY", "")
if key:
    HEADERS["APIKEY"] = key
    print("🔑 API key active\n")

UUID = "db595776-a88c-4846-ae43-83473161e4d1"

# 1) Test massif de sous-champs sur football.game(id: UUID)
print("=== TEST 1 : sous-champs de football.game(id:) pour odds/lineup/players ===\n")
FIELDS = [
    # Basics
    "id", "date", "homeTeam { name slug }", "awayTeam { name slug }",
    # Lineup officiel (publie par Sorare juste avant match)
    "homeFormation { startingLineup { slug } substitutes { slug } }",
    "awayFormation { startingLineup { slug } substitutes { slug } }",
    "confirmedLineup { __typename }",
    "officialLineup { __typename }",
    "announcedLineup { __typename }",
    # Odds / Probabilities
    "playerStats { __typename }",
    "playerOdds { __typename }",
    "playingStatusOdds { __typename }",
    "playerPlayingStatusOdds(slug: \"desire-doue\") { starterOddsBasisPoints }",
    "odds { __typename }",
    "lineupProbabilities { __typename }",
    "probableLineup { __typename }",
    # So5
    "so5Fixtures { __typename }",
    "so5Scores(first: 3) { __typename }",
    "so5Lineups { __typename }",
    # Status
    "statusTyped",
    "status",
    "scheduledDate",
    "kickoffTime",
    # Players
    "players { __typename }",
    "homePlayers { __typename }",
    "awayPlayers { __typename }",
    # Misc
    "gameWeek { __typename }",
    "competition { displayName }",
]
for sf in FIELDS:
    q = '{ football { game(id: "%s") { %s } } }' % (UUID, sf)
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message","?")[:180]
        if "doesn't exist" in msg or "No field" in msg:
            continue
        else:
            print(f"  ⚠️  {sf[:70]:<70} : {msg}")
    else:
        d = (body.get("data") or {}).get("football",{}).get("game")
        if d:
            print(f"  ✅ {sf[:70]:<70} : {json.dumps(d)[:250]}")

# 2) Query large : game avec tous les champs valides
print(f"\n\n=== TEST 2 : query large Game ===\n")
Q = """{
  football {
    game(id: "%s") {
      __typename
      id
      date
      statusTyped
      homeTeam { name slug }
      awayTeam { name slug }
      competition { displayName }
      homeFormation { startingLineup { slug displayName } substitutes { slug displayName } }
      awayFormation { startingLineup { slug displayName } substitutes { slug displayName } }
    }
  }
}""" % UUID
r = requests.post(URL, json={"query": Q}, headers=HEADERS, timeout=15)
print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:2500])
