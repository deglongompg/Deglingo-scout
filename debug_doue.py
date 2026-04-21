#!/usr/bin/env python3
"""debug_doue.py — so5Score(gameId:) sur le prochain match"""
import requests, json, os
from dotenv import load_dotenv

load_dotenv()
URL = "https://api.sorare.com/federation/graphql"
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
key = os.getenv("SORARE_API_KEY", "")
if key:
    HEADERS["APIKEY"] = key
    print("🔑 API key active\n")

SLUG = "desire-doue"

# 1) Recuperer l'ID du nextGame
print("=== TEST 1 : recuperer gameId ===\n")
Q1 = '{ football { player(slug: "%s") { nextGame { id date } } } }' % SLUG
r = requests.post(URL, json={"query": Q1}, headers=HEADERS, timeout=10)
body = r.json()
ng = (body.get("data") or {}).get("football",{}).get("player",{}).get("nextGame") or {}
game_id = ng.get("id")
print(f"Game ID: {game_id}  date: {ng.get('date')}")

# ID peut etre format "Game:UUID" (Relay) ou juste UUID
uuid_only = game_id.replace("Game:", "") if game_id else None

# 2) Teste so5Score(gameId:) avec les 2 formats
print(f"\n=== TEST 2 : player.so5Score(gameId:) — 2 formats d'ID ===\n")
for gid in [game_id, uuid_only]:
    q = '{ football { player(slug: "%s") { so5Score(gameId: "%s") { __typename } } } }' % (SLUG, gid)
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        print(f"  ❌ gameId={gid!r:<50} : {body['errors'][0].get('message','?')[:150]}")
    else:
        d = (body.get("data") or {}).get("football",{}).get("player",{})
        print(f"  ✅ gameId={gid!r:<50} : {json.dumps(d)[:250]}")

# 3) Si so5Score marche, tester tous ses sous-champs pour trouver les odds
print(f"\n=== TEST 3 : sous-champs de so5Score ===\n")
for gid in [game_id, uuid_only]:
    SO5_SCORE_FIELDS = [
        "score",
        "playingStatus",
        "starterOddsBasisPoints",
        "playingStatusOddsBasisPoints",
        "startingProbability",
        "startingOdds { starterOddsBasisPoints }",
        "playingStatusOdds { starterOddsBasisPoints }",
        "odds { starterOddsBasisPoints }",
        "game { id date }",
        "player { slug }",
        "__typename",
        "appeared",
        "started",
        "minsPlayed",
    ]
    for sf in SO5_SCORE_FIELDS:
        q = '{ football { player(slug: "%s") { so5Score(gameId: "%s") { %s } } } }' % (SLUG, gid, sf)
        r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
        body = r.json()
        if "errors" in body:
            msg = body["errors"][0].get("message","?")[:150]
            if "doesn't exist" in msg or "No field" in msg:
                continue  # skip silently
            else:
                # Autre erreur
                if gid == game_id:  # log seulement le premier
                    print(f"  ⚠️  [{gid[:20]}...].{sf:<50} : {msg}")
        else:
            d = (body.get("data") or {}).get("football",{}).get("player",{})
            so5 = d.get("so5Score") if d else None
            if so5:
                print(f"  ✅ [{gid[:20]}...].{sf:<50} : {json.dumps(so5)[:200]}")
    break  # Si le 1er format marche, arrete

# 4) Query ultra-large avec tous les champs
print(f"\n=== TEST 4 : query large so5Score avec champs combines ===\n")
Q_LARGE = """{
  football {
    player(slug: "%s") {
      displayName
      so5Score(gameId: "%s") {
        __typename
        score
        game { id date }
      }
    }
  }
}""" % (SLUG, game_id)
r = requests.post(URL, json={"query": Q_LARGE}, headers=HEADERS, timeout=10)
print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:800])
