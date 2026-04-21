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
from datetime import date, datetime, timedelta, timezone
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
        "last_so5_score":        round(gw_score, 2) if gw_score is not None else None,
        "last_so5_date":         gw_date,
        "last_match_home_goals": game.get("homeScore"),
        "last_match_away_goals": game.get("awayScore"),
        "game_id":               game.get("id"),
        "game_home_team":        (game.get("homeTeam") or {}).get("name", ""),
        "game_away_team":        (game.get("awayTeam") or {}).get("name", ""),
    }


# ── DÉTECTION AUTOMATIQUE DES CLUBS AYANT JOUÉ ──────────────────────────────
# Les kickoffs dans fixtures.json sont en UTC -> on compare TOUT en UTC pour eviter les bugs de tz.
# La date GW (ven/mar 16h Paris) est convertie en UTC.
_utc_now    = datetime.now(timezone.utc)
_paris_now  = _utc_now + timedelta(hours=2)
today_utc   = _utc_now.strftime("%Y-%m-%d")
now_hhmm    = _utc_now.strftime("%H:%M")
print(f"Aujourd'hui (UTC) : {today_utc}")

with open(FIXTURES_FILE, encoding="utf-8") as f:
    fixtures = json.load(f)

player_fixtures = fixtures.get("player_fixtures", {})

with open(OUT_PATHS[0], encoding="utf-8") as f:
    players = json.load(f)

# Calcul du début de GW : Vendredi 16h ou Mardi 16h, selon le plus récent
def get_gw_start(now):
    best = None
    for target_wd in [4, 1]:  # Vendredi=4, Mardi=1
        days_back = (now.weekday() - target_wd) % 7
        candidate = (now - timedelta(days=days_back)).replace(hour=16, minute=0, second=0, microsecond=0)
        if candidate > now:
            candidate -= timedelta(days=7)
        if best is None or candidate > best:
            best = candidate
    return best

# Fenetre de fetch : on prend la PLUS LARGE entre la GW courante et 7 jours en arriere.
# Sans ca, les matchs du week-end precedent sont exclus si on lance le script apres Mardi 16h
# (la borne GW saute au mardi 16h et coupe tout ce qui est avant).
_gw_window_start_paris = _paris_now - timedelta(days=7)
_gw_start_paris = min(get_gw_start(_paris_now), _gw_window_start_paris)
# Convertion en UTC pour comparer aux fixtures (kickoffs en UTC)
_gw_start_utc = _gw_start_paris - timedelta(hours=2)
gw_cutoff_date_utc = _gw_start_utc.strftime("%Y-%m-%d")
gw_cutoff_hhmm_utc = _gw_start_utc.strftime("%H:%M")
print(f"Debut GW    : {_gw_start_paris.strftime('%Y-%m-%d %H:%M')} (Paris) = {gw_cutoff_date_utc} {gw_cutoff_hhmm_utc} (UTC)")

def is_played(fx_date, kickoff):
    """Retourne True si le match est terminé (date+kickoff en UTC, comparé à now UTC)."""
    if not fx_date:
        return False
    # Utilise datetime objects pour eviter les bugs de tz string-comparison
    try:
        if kickoff and kickoff != "99:99":
            ko_dt = datetime.fromisoformat(f"{fx_date}T{kickoff}:00").replace(tzinfo=timezone.utc)
        else:
            # Date sans heure : on assume qu'il faut attendre 23:59 UTC pour que ce soit "joue"
            ko_dt = datetime.fromisoformat(f"{fx_date}T23:59:00").replace(tzinfo=timezone.utc)
        ko_end_dt = ko_dt + timedelta(hours=2)
    except Exception:
        return False
    in_gw   = ko_dt   >= _gw_start_utc
    started = ko_end_dt <= _utc_now
    return in_gw and started

# Source 1 : fixtures list (home_api / away_api = noms api Sorare/foot-data)
played_clubs = set()
fixtures_list = fixtures.get("fixtures", [])
for f in fixtures_list:
    if is_played(f.get("date", ""), f.get("kickoff", "99:99")):
        if f.get("home_api"): played_clubs.add(f["home_api"])
        if f.get("away_api"): played_clubs.add(f["away_api"])

# Source 2 : player_fixtures (complément si home_api manquant)
for p in players:
    fx = player_fixtures.get(p.get("slug", ""))
    if fx and is_played(fx.get("date", ""), fx.get("kickoff", "99:99")):
        played_clubs.add(p.get("club", ""))

if not played_clubs:
    print("Aucun match joue avant aujourd'hui dans les fixtures. Rien a faire.")
    sys.exit(0)

print(f"\nClubs ayant deja joue : {', '.join(sorted(played_clubs))}")

# Match fuzzy: les noms de clubs different parfois entre fixtures.json (noms api foot-data)
# et players.json (noms Sorare). On normalise et on accepte uniquement l'egalite stricte
# apres normalisation pour eviter les faux positifs (ex: "Real Madrid" vs "Real Salt Lake").
import unicodedata, re

# Aliases manuels pour les cas pas resolvables par normalisation simple
# Cles = noms api fixtures.json, valeurs = variantes equivalentes dans players.club
ALIASES = {
    "SC Freiburg": ["Sport-Club Freiburg"],
    "Lille OSC": ["LOSC Lille"],
    "Deportivo Alavés": ["D. Alavés"],
    "Racing Club de Lens": ["RC Lens"],
    "TSG 1899 Hoffenheim": ["TSG Hoffenheim"],
}

def _norm_club(name):
    if not name: return ""
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    # Retire suffixes/mots generiques + chiffres-annees ("1899", "1901", etc.)
    tokens = [t for t in s.split() if t and not (t.isdigit() and len(t) == 4) and t not in {
        "fc", "afc", "cf", "sc", "ac", "as", "rc", "ssc",
        "club", "de", "del", "la", "le", "los", "the",
        "f", "c", "futbol", "football", "balompie",
    }]
    return " ".join(tokens)

# Build set des cles normalisees (cote played_clubs / fixtures.api)
_played_norm = set()
for c in played_clubs:
    _played_norm.add(_norm_club(c))
# Inclus aussi les aliases (si la cle est dans played_clubs, ses variantes sont aussi "played")
for fix_name, variants in ALIASES.items():
    if fix_name in played_clubs:
        for v in variants:
            _played_norm.add(_norm_club(v))

def _club_in_played(club):
    if not club: return False
    if club in played_clubs: return True
    n = _norm_club(club)
    return bool(n) and n in _played_norm

# Map : club (api name) -> date du dernier match joue dans la fenetre
# Utilise pour skipper les players deja a jour (last_so5_date >= dernier match)
latest_played_per_club = {}
for f in fixtures_list:
    if not is_played(f.get("date", ""), f.get("kickoff", "99:99")):
        continue
    fdate = f.get("date", "")
    for key in (f.get("home_api"), f.get("away_api")):
        if not key: continue
        if key not in latest_played_per_club or fdate > latest_played_per_club[key]:
            latest_played_per_club[key] = fdate

# Etend ce mapping aux noms players.club via fuzzy + aliases
def latest_match_for_player_club(club):
    if not club: return None
    if club in latest_played_per_club: return latest_played_per_club[club]
    n = _norm_club(club)
    for k, d in latest_played_per_club.items():
        if _norm_club(k) == n: return d
    # via aliases (cles fixtures -> variantes players)
    for fix_name, variants in ALIASES.items():
        if club in variants and fix_name in latest_played_per_club:
            return latest_played_per_club[fix_name]
    return None

targets = []
skipped_fresh = 0
for p in players:
    if not p.get("slug"): continue
    if not _club_in_played(p.get("club", "")): continue
    latest = latest_match_for_player_club(p.get("club", ""))
    last_so5 = p.get("last_so5_date")
    # Skip si data deja a jour : last_so5_date >= dernier match joue
    if latest and last_so5 and last_so5 >= latest:
        skipped_fresh += 1
        continue
    targets.append(p)
fetched_clubs = sorted(set(p.get("club", "") for p in targets))
print(f"Clubs matches dans players.json : {len(set(p.get('club','') for p in players if _club_in_played(p.get('club',''))))}")
print(f"Players deja a jour (skippes) : {skipped_fresh}")
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
