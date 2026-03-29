#!/usr/bin/env python3
"""
Deglingo Scout — Fetch Sorare lineup probabilities (% titu).
Available ~48h before matches via Sorare's gameFormation / probableStartingLineup.

Patches fixtures.json with a "lineup" field per player.

Usage:
  python3 fetch_lineup.py
"""

import requests, json, time, os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

URL = "https://api.sorare.com/federation/graphql"
API_KEY = os.getenv("SORARE_API_KEY", "")
HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json",
}
if API_KEY:
    HEADERS["APIKEY"] = API_KEY
    SLEEP = 0.3
else:
    SLEEP = 2.5

# ─── GraphQL query: get upcoming game lineup predictions ──
# Sorare exposes `so5Lineup` on upcoming fixtures with
# `probableStartingLineup` or `gameFormation` predictions.
# We use the player's `upcomingGames` which gives lineup status.

QUERY_LINEUP = """
query PlayerLineup($slug: String!) {
  football {
    player(slug: $slug) {
      slug
      activeClub {
        name
        upcomingGames(first: 1) {
          nodes {
            date
            awayTeam { name }
            homeTeam { name }
            homeFormation { startingLineup { slug displayName } }
            awayFormation { startingLineup { slug displayName } }
          }
        }
      }
    }
  }
}
"""

# Alternative simpler approach: use So5Fixture lineups
QUERY_SO5_LINEUPS = """
query So5FixtureLineups($slug: String!) {
  football {
    player(slug: $slug) {
      slug
      status {
        lastFifteenSo5Appearances
        playingStatus
      }
    }
  }
}
"""


def gql(query, variables=None, label=""):
    """Execute GraphQL query with retry."""
    for attempt in range(3):
        try:
            r = requests.post(URL, json={"query": query, "variables": variables or {}},
                            headers=HEADERS, timeout=30)
            if r.status_code == 403:
                print(f"  🚫 403 ban, pause 120s...")
                time.sleep(120)
                continue
            if r.status_code in (429, 500, 502, 503):
                time.sleep(30)
                continue
            return r.json()
        except Exception as e:
            print(f"  ⚠️ {e}, retry...")
            time.sleep(15)
    return None


def fetch_playing_status(players):
    """Fetch playingStatus for each player (starter/bench/not_playing/unknown)."""
    results = {}
    total = len(players)

    for i, p in enumerate(players):
        slug = p.get("slug")
        if not slug:
            continue

        data = gql(QUERY_SO5_LINEUPS, {"slug": slug}, label=slug)
        if not data or "errors" in data:
            continue

        player_data = data.get("data", {}).get("football", {}).get("player")
        if not player_data:
            continue

        status = player_data.get("status", {})
        playing_status = status.get("playingStatus")  # "starter", "bench", "not_playing", None
        last15 = status.get("lastFifteenSo5Appearances", 0)

        if playing_status:
            results[slug] = {
                "playingStatus": playing_status,
                "last15Appearances": last15,
            }
            # Also store by name
            results[p["name"]] = results[slug]

        if (i + 1) % 50 == 0:
            print(f"  📊 {i+1}/{total} joueurs traités ({len(results)//2} statuts)")

        time.sleep(SLEEP)

    return results


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(script_dir, "deglingo-scout-app", "public", "data")

    # Load players
    with open(os.path.join(data_dir, "players.json")) as f:
        players = json.load(f)

    # Load existing fixtures
    fixtures_path = os.path.join(data_dir, "fixtures.json")
    with open(fixtures_path) as f:
        fixtures = json.load(f)

    print(f"⚽ Deglingo Scout — Fetch Lineup Status")
    print(f"   {len(players)} joueurs")
    print(f"   Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    # Only fetch for players that have a fixture
    pf = fixtures.get("player_fixtures", {})
    players_with_fixture = [p for p in players if p.get("slug") in pf or p.get("name") in pf]
    print(f"   {len(players_with_fixture)} joueurs avec fixture à vérifier")

    lineup_data = fetch_playing_status(players_with_fixture)

    # Patch fixtures.json
    fixtures["lineup"] = lineup_data
    fixtures["lineup_updated"] = datetime.now().isoformat()

    with open(fixtures_path, "w", encoding="utf-8") as f:
        json.dump(fixtures, f, ensure_ascii=False, indent=2)

    starters = sum(1 for v in lineup_data.values() if v.get("playingStatus") == "starter")
    print(f"\n💾 Sauvé: {fixtures_path}")
    print(f"   {len(lineup_data)//2} joueurs avec statut")
    print(f"   {starters//2} starters détectés")
    print("\n✅ Done! Relance 'npm run build' pour mettre à jour.")


if __name__ == "__main__":
    main()
