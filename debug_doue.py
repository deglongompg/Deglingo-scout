#!/usr/bin/env python3
"""debug_doue.py — Explore player.status et Game formations pour trouver les odds mid-week"""
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

# 1) Explore player.status — champs connus + candidats
print("=== TEST 1 : player.status sous-champs ===\n")
STATUS_FIELDS = [
    "playingStatus",
    "lastFifteenSo5Appearances",
    "projectedScore",
    "starterOddsBasisPoints",
    "playingStatusOddsBasisPoints",
    "playingProbability",
    "startingProbability",
    "playingOdds",
    "startingOdds",
    "nextFixtureOdds",
    "nextFixturePlayingStatusOdds",
    "statusType",
    "__typename",
]
for sf in STATUS_FIELDS:
    q = '{ football { player(slug: "%s") { status { %s } } } }' % (SLUG, sf)
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message", "?")[:180]
        if "doesn't exist" in msg:
            print(f"  ❌ status.{sf:<40} : n'existe pas")
        else:
            print(f"  ⚠️  status.{sf:<40} : {msg}")
    else:
        d = (body.get("data") or {}).get("football", {}).get("player", {})
        print(f"  ✅ status.{sf:<40} : {json.dumps(d.get('status'))[:150]}")

# 2) Que contient player.status dans sa totalite ? Essaie une query large
print("\n\n=== TEST 2 : query status avec tous les champs validés ===\n")
Q_STATUS = """{
  football {
    player(slug: "%s") {
      displayName
      status {
        playingStatus
        lastFifteenSo5Appearances
      }
    }
  }
}""" % SLUG
r = requests.post(URL, json={"query": Q_STATUS}, headers=HEADERS, timeout=10)
print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:600])

# 3) Game formations — voir si Doue est dans le startingLineup annoncé
print("\n\n=== TEST 3 : nextGame formations (startingLineup officiel) ===\n")
Q_FORMATION = """{
  football {
    player(slug: "%s") {
      displayName
      nextGame {
        id
        date
        homeTeam { name }
        awayTeam { name }
        homeFormation { startingLineup { slug displayName } substitutes { slug displayName } }
        awayFormation { startingLineup { slug displayName } substitutes { slug displayName } }
      }
    }
  }
}""" % SLUG
r = requests.post(URL, json={"query": Q_FORMATION}, headers=HEADERS, timeout=15)
body = r.json()
if "errors" in body:
    print(f"ERREUR: {body['errors']}")
else:
    print(json.dumps(body, indent=2, ensure_ascii=False)[:1500])
    p = body.get("data",{}).get("football",{}).get("player",{})
    ng = p.get("nextGame") or {}
    hf = ng.get("homeFormation") or {}
    af = ng.get("awayFormation") or {}
    all_starters = [x["slug"] for x in (hf.get("startingLineup") or []) + (af.get("startingLineup") or [])]
    all_subs = [x["slug"] for x in (hf.get("substitutes") or []) + (af.get("substitutes") or [])]
    if SLUG in all_starters:
        print(f"\n✅ Doué est dans startingLineup (titulaire annonce)")
    elif SLUG in all_subs:
        print(f"\n🟡 Doué est sur le banc (substitute)")
    else:
        print(f"\n❌ Doué pas dans la composition officielle (pas encore publiee ou ecarte)")

# 4) Explore Game sous-champs potentiels odds/probability
print("\n\n=== TEST 4 : sous-champs de Game pour odds/probability ===\n")
GAME_FIELDS = [
    "startingLineupOdds",
    "playingStatusOdds",
    "startingOdds",
    "playerStatusOdds",
    "playerOdds",
    "probableLineup",
    "probableStartingLineup",
    "predictedLineup",
    "lineupProbabilities",
    "playingStatusProbabilities",
    "statusTyped",
    "kickOff",
]
for gf in GAME_FIELDS:
    q = '{ football { player(slug: "%s") { nextGame { %s } } } }' % (SLUG, gf)
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message", "?")[:180]
        if "doesn't exist" in msg:
            print(f"  ❌ nextGame.{gf:<35} : n'existe pas")
        else:
            print(f"  ⚠️  nextGame.{gf:<35} : {msg}")
    else:
        d = (body.get("data") or {}).get("football", {}).get("player", {})
        print(f"  ✅ nextGame.{gf:<35} : {json.dumps(d.get('nextGame'))[:200]}")
