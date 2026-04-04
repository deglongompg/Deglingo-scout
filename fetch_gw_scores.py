#!/usr/bin/env python3
"""
fetch_gw_scores.py — Score réel des matchs déjà joués dans la GW en cours
=========================================================================
Détecte automatiquement les clubs ayant déjà joué (date < aujourd'hui)
et fetch so5Scores(last:1) uniquement pour leurs joueurs.
Fetch aussi les buteurs/passeurs par match (goalScorerStats).

Durée : ~15 secondes pour 4 clubs (~80 joueurs) + 2 calls match events

Usage :
  py fetch_gw_scores.py
"""
import requests, json, os, time, sys
from datetime import date
sys.stdout.reconfigure(errors="replace")
from dotenv import load_dotenv

load_dotenv()

URL     = "https://api.sorare.com/federation/graphql"
API_KEY = os.getenv("SORARE_API_KEY", "")
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "Accept": "application/json"}
if API_KEY:
    HEADERS["APIKEY"] = API_KEY

SLEEP = 0.12

FIXTURES_FILE  = "deglingo-scout-app/public/data/fixtures.json"
EVENTS_OUT     = "deglingo-scout-app/public/data/match_events.json"
OUT_PATHS = [
    "deglingo-scout-app/public/data/players.json",
    "public/data/players.json",
]

# ── Query score joueur (avec game id) ────────────────────────────────────────
Q_PLAYER = """query($slug: String!) {
  football {
    player(slug: $slug) {
      so5Scores(last: 1) {
        score
        game {
          id date homeScore awayScore
          homeTeam { name }
          awayTeam { name }
        }
      }
    }
  }
}"""


def fetch_score(slug):
    r = requests.post(URL, json={"query": Q_PLAYER, "variables": {"slug": slug}},
                      headers=HEADERS, timeout=30)
    p = ((r.json().get("data") or {}).get("football") or {}).get("player") or {}
    scores = p.get("so5Scores") or []
    last_s = scores[0] if scores else {}
    gw_score = last_s.get("score")
    game     = last_s.get("game") or {}
    gw_date  = (game.get("date") or "")[:10] or None
    return {
        "last_so5_score":        round(gw_score, 1) if gw_score is not None else None,
        "last_so5_date":         gw_date,
        "last_match_home_goals": game.get("homeScore"),
        "last_match_away_goals": game.get("awayScore"),
        "game_id":               game.get("id"),
        "game_home_team":        (game.get("homeTeam") or {}).get("name", ""),
        "game_away_team":        (game.get("awayTeam") or {}).get("name", ""),
    }


# ── DÉTECTION AUTOMATIQUE DES CLUBS AYANT JOUÉ ──────────────────────────────
today = str(date.today())
print(f"Aujourd'hui : {today}")

with open(FIXTURES_FILE, encoding="utf-8") as f:
    fixtures = json.load(f)

player_fixtures = fixtures.get("player_fixtures", {})

with open(OUT_PATHS[0], encoding="utf-8") as f:
    players = json.load(f)

played_clubs = set()
for p in players:
    slug = p.get("slug", "")
    fx = player_fixtures.get(slug)
    if fx and fx.get("date", "") < today:
        played_clubs.add(p.get("club", ""))

if not played_clubs:
    print("Aucun match joue avant aujourd'hui dans les fixtures. Rien a faire.")
    sys.exit(0)

print(f"\nClubs ayant deja joue : {', '.join(sorted(played_clubs))}")

targets = [p for p in players if p.get("club", "") in played_clubs and p.get("slug")]
print(f"Joueurs a fetcher : {len(targets)}")

# ── FETCH SCORES JOUEURS ──────────────────────────────────────────────────────
scores_map = {}
game_ids   = {}   # { game_id: { home, away, home_scorers, away_scorers, ... } }
errors = 0

print(f"\nFetch scores...\n")
for i, p in enumerate(targets):
    slug = p["slug"]
    try:
        s = fetch_score(slug)
        scores_map[slug] = s
        score_str = str(s["last_so5_score"]) if s["last_so5_score"] is not None else "-"
        print(f"  [{i+1:3}/{len(targets)}] {p.get('name','?'):<28} score={score_str:>5}  date={s['last_so5_date'] or '?'}")

        # Mémoriser game_id + teams
        gid = s.get("game_id")
        if gid and gid not in game_ids:
            game_ids[gid] = {
                "home":       s["game_home_team"],
                "away":       s["game_away_team"],
                "date":       s["last_so5_date"],
                "home_goals": s["last_match_home_goals"],
                "away_goals": s["last_match_away_goals"],
                "home_scorers": [],
                "away_scorers": [],
                "home_assists": [],
                "away_assists": [],
            }

        time.sleep(SLEEP)
    except Exception as e:
        errors += 1
        print(f"  [{i+1:3}/{len(targets)}] ERR {slug}: {e}")
        time.sleep(1)

# ── PATCH players.json ────────────────────────────────────────────────────────
for path in OUT_PATHS:
    if not os.path.exists(path):
        continue
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    patched = 0
    for p in data:
        s = scores_map.get(p.get("slug", ""))
        if s:
            if s["last_so5_score"] is not None:
                p["last_so5_score"] = s["last_so5_score"]
                p["last_so5_date"]  = s["last_so5_date"]
            else:
                p.setdefault("last_so5_score", None)
                p.setdefault("last_so5_date",  None)
            if s["last_match_home_goals"] is not None:
                p["last_match_home_goals"] = s["last_match_home_goals"]
                p["last_match_away_goals"] = s["last_match_away_goals"]
            else:
                p.setdefault("last_match_home_goals", None)
                p.setdefault("last_match_away_goals", None)
            patched += 1
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    print(f"\nPatched {patched} joueurs -> {path}")

# ── RÉSUMÉ MATCHS ────────────────────────────────────────────────────────────
print(f"\nResume matchs ({len(game_ids)}) :")
for gid, info in game_ids.items():
    print(f"  {info['home']} {info['home_goals']}-{info['away_goals']} {info['away']}")

# Sauvegarder match_events.json
with open(EVENTS_OUT, "w", encoding="utf-8") as f:
    json.dump(game_ids, f, ensure_ascii=False, indent=2)
print(f"\nMatch events sauvegardes -> {EVENTS_OUT}")

print(f"\n{'='*50}")
if errors:
    print(f"  Erreurs : {errors}")
print(f"Termine ! Lance maintenant :")
print(f"   npm run build")
print(f"{'='*50}")
