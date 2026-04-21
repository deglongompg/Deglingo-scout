#!/usr/bin/env python3
"""debug_doue.py — FINAL : game.players[].sous-champs pour trouver les ODDS"""
import requests, json, os
from dotenv import load_dotenv

load_dotenv()
URL = "https://api.sorare.com/federation/graphql"
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
key = os.getenv("SORARE_API_KEY", "")
if key:
    HEADERS["APIKEY"] = key
    print("🔑 API key active\n")

UUID = "db595776-a88c-4846-ae43-83473161e4d1"  # PSG vs Nantes mid-week

# 1) __typename de game.players pour voir si c'est Player ou un wrapper
print("=== TEST 1 : typename des objets dans game.players ===\n")
Q = '{ football { game(id: "%s") { players { __typename } } } }' % UUID
r = requests.post(URL, json={"query": Q}, headers=HEADERS, timeout=15)
body = r.json()
players = ((body.get("data") or {}).get("football") or {}).get("game", {}).get("players") or []
print(f"Nombre de joueurs: {len(players)}")
if players:
    types = set(p.get("__typename") for p in players)
    print(f"Types uniques: {types}")

# 2) Identifier le type exact des objets players
# Si c'est Player -> accès direct, sinon c'est probablement un wrapper type GamePlayer
type_name = list(types)[0] if players else None
print(f"\nType des players: {type_name}")

# 3) Explore sous-champs sur ce type
print(f"\n=== TEST 3 : sous-champs de game.players[] (type={type_name}) ===\n")
SUBFIELDS = [
    # Player info
    "slug", "displayName",
    "player { slug displayName }",
    # Probabilites / odds PRE-MATCH pour ce joueur
    "playingStatus",
    "starterOddsBasisPoints",
    "playingStatusOdds { starterOddsBasisPoints }",
    "playingStatusOdds { __typename }",
    "starterOdds", "startingOdds",
    "probability", "startingProbability",
    "expectedStatus", "expectedRole",
    "status",
    # Score post-match (pour rappel)
    "so5Score { score }",
    "score",
    "minsPlayed",
    "started", "appeared",
    # Meta
    "position",
]
for sf in SUBFIELDS:
    q = '{ football { game(id: "%s") { players { %s } } } }' % (UUID, sf)
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message","?")[:180]
        if "doesn't exist" in msg or "No field" in msg:
            continue
        else:
            print(f"  ⚠️  {sf[:55]:<55} : {msg}")
    else:
        pls = (body.get("data") or {}).get("football",{}).get("game",{}).get("players") or []
        # Check si un Doué est dedans avec une valeur interessante
        doue = next((p for p in pls if p.get("slug") == "desire-doue" or (p.get("player") or {}).get("slug") == "desire-doue"), None)
        if doue:
            print(f"  ✅ {sf[:55]:<55} (DOUE) : {json.dumps(doue)[:200]}")
        elif pls and any(p for p in pls if p):
            print(f"  ✅ {sf[:55]:<55} (sample): {json.dumps(pls[0])[:200]}")
        else:
            print(f"  ⚠️  {sf[:55]:<55} : vide")

# 4) Query large ciblee Doue dans game.players
print(f"\n\n=== TEST 4 : query large — cherche Doue dans game.players ===\n")
Q = """{
  football {
    game(id: "%s") {
      players {
        __typename
      }
    }
  }
}""" % UUID
r = requests.post(URL, json={"query": Q}, headers=HEADERS, timeout=15)
body = r.json()
pls = ((body.get("data") or {}).get("football") or {}).get("game",{}).get("players") or []
print(f"Total {len(pls)} players dans game.players")
print(f"Sample premiers 3: {json.dumps(pls[:3], ensure_ascii=False)}")
