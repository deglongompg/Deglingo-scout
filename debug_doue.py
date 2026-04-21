#!/usr/bin/env python3
"""debug_doue.py — Voir la discordance 90% (nous) vs 40% (Sorare site) pour Doue"""
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

# 1) Query standard + nextGame
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
print("=== DONNEES STANDARD ===")
print(json.dumps(body, indent=2, ensure_ascii=False)[:1500])

p = ((body.get("data") or {}).get("football") or {}).get("player") or {}
odds = p.get("nextClassicFixturePlayingStatusOdds") or {}
bp = odds.get("starterOddsBasisPoints")
ng = p.get("nextGame") or {}
print(f"\n🔑 playingStatus enum       : {p.get('playingStatus')}")
print(f"🔑 starterOddsBasisPoints    : {bp} -> {bp/100 if bp else 'NULL'}%")
print(f"🔑 nextGame date             : {ng.get('date')}")
print(f"🔑 nextGame teams            : {(ng.get('homeTeam') or {}).get('name')} vs {(ng.get('awayTeam') or {}).get('name')}")
print(f"🔑 nextGame competition      : {(ng.get('competition') or {}).get('displayName')}")

# 2) On tente avec nextGame.playingStatusOdds (scoped au vrai prochain match)
print("\n\n=== TEST : nextGame sous-champs odds ===")
PROBES = [
    "nextGame { playingStatusOdds { starterOddsBasisPoints } }",
    "nextGame { playerOdds(playerSlug: \"%s\") { starterOddsBasisPoints } }" % SLUG,
    "nextGame { playingStatus }",
    "nextGame { lineupProbability }",
    "nextGame { startingOdds { starterOddsBasisPoints } }",
    "currentSo5FixturePlayingStatusOdds { starterOddsBasisPoints }",
    "nextFixturePlayingStatusOdds { starterOddsBasisPoints }",
    "activeFixturePlayingStatusOdds { starterOddsBasisPoints }",
    "upcomingSo5FixturePlayingStatusOdds { starterOddsBasisPoints }",
    "nextGamePlayingStatusOdds { starterOddsBasisPoints }",
]
for probe in PROBES:
    q = '{ football { player(slug: "%s") { %s } } }' % (SLUG, probe)
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message", "?")[:150]
        if "doesn't exist" in msg:
            print(f"  ❌ {probe[:60]:<60} : n'existe pas")
        else:
            print(f"  ⚠️  {probe[:60]:<60} : {msg}")
    else:
        print(f"  ✅ {probe[:60]:<60} : {json.dumps(body.get('data'))[:250]}")

# 3) Test introspection ciblee du type Player avec "so5"
print("\n\n=== TEST : cherche champs 'so5' / 'fixture' sur Player ===")
SO5_PROBES = [
    "allSo5Fixtures(first: 3) { nodes { __typename } }",
    "so5Fixtures(first: 3) { nodes { __typename } }",
    "activeSo5Fixtures { __typename }",
    "upcomingSo5Fixtures(first: 3) { nodes { __typename } }",
    "currentSo5Fixture { __typename }",
    "nextSo5Fixture { __typename }",
    "upcomingSo5LeaderboardSubscriptions { __typename }",
]
for probe in SO5_PROBES:
    q = '{ football { player(slug: "%s") { %s } } }' % (SLUG, probe)
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=10)
    body = r.json()
    if "errors" in body:
        msg = body["errors"][0].get("message", "?")[:150]
        if "doesn't exist" in msg:
            print(f"  ❌ {probe[:55]:<55} : n'existe pas")
        else:
            print(f"  ⚠️  {probe[:55]:<55} : {msg}")
    else:
        d = body.get("data", {}).get("football", {}).get("player", {})
        print(f"  ✅ {probe[:55]:<55} : {json.dumps(d)[:250]}")
