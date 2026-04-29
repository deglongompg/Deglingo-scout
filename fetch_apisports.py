#!/usr/bin/env python3
"""
fetch_apisports.py — Scrape xG / xGA / matches via API-Football pour une ligue.

Source : https://v3.football.api-sports.io (Pro plan $19/mo, 7500 req/jour).
Couvre 1100+ ligues. xG via `/fixtures/statistics?fixture=ID` (champ `expected_goals`).
PPDA non expose → on garde fallback hardcode (12) pour les ligues exotiques.

Usage :
  py fetch_apisports.py JPL              # Jupiler Pro League (Belgique)
  py fetch_apisports.py Ere              # Eredivisie (Pays-Bas)
  py fetch_apisports.py JPL --season 2024 # Saison precedente
  py fetch_apisports.py LIST             # Liste toutes les ligues mappees

Output : patch direct dans deglingo-scout-app/public/data/teams.json
  - xg, xga (per match average sur saison)
  - xg_dom, xg_ext, xga_dom, xga_ext (dom/ext splits)
  - matches, goals, ga
  - ppda (fallback 12 si non patche manuellement)
"""
import sys, os, re, json, io, time, argparse
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import requests
from dotenv import load_dotenv
load_dotenv()

BASE = "https://v3.football.api-sports.io"
KEY = os.getenv("API_FOOTBALL_KEY", "")
HEADERS = {"x-apisports-key": KEY}

# Mapping nos codes ligue -> (API-Football league_id, default_season)
APISPORTS_LEAGUES = {
    "L1":     (61,  2025),
    "PL":     (39,  2025),
    "Liga":   (140, 2025),
    "Bundes": (78,  2025),
    "SerieA": (135, 2025),
    "MLS":    (253, 2025),
    "JPL":    (144, 2025),  # Jupiler Pro League (Belgique)
    "Ere":    (88,  2025),  # Eredivisie (Pays-Bas)
    "Scotland": (179, 2025),
    "Switzerland": (207, 2025),
    "Turkey": (203, 2025),
    "Netherlands2": (89, 2025),  # Eerste Divisie
    "Brazil": (71,  2025),
    "Argentina": (128, 2025),
    "Japan":  (98,  2025),
    "Korea":  (292, 2025),
    "Russia": (235, 2025),
    "Mexico": (262, 2025),
    "Austria": (218, 2025),
    "Peru":   (281, 2025),
    "China":  (169, 2025),
    "L2":     (62,  2025),
    "Liga2":  (141, 2025),
    "Championship": (40, 2025),
    "Bundes2": (79, 2025),
}

# Default PPDA fallback (medium intensity = ~12). Patch manuel via TheAnalyst si dispo.
PPDA_DEFAULT = 12.0


def get(endpoint, params=None):
    """API-Football GET avec retry simple."""
    for attempt in range(3):
        try:
            r = requests.get(f"{BASE}/{endpoint}", headers=HEADERS, params=params, timeout=30)
            if r.status_code == 200:
                return r.json()
            print(f"  [WARN] HTTP {r.status_code} on {endpoint}, retry {attempt+1}/3")
        except Exception as e:
            print(f"  [WARN] {e}, retry {attempt+1}/3")
        time.sleep(2)
    return {}


def parse_xg_value(v):
    """xG vient sous forme '2.04' (string) ou 2.04 ou None. Normalize en float ou None."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", "."))
    except:
        return None


def fetch_league_xg(league_code, season=None):
    """Aggrege xG/xGA par equipe pour une saison via /fixtures/statistics."""
    if league_code not in APISPORTS_LEAGUES:
        print(f"[ERREUR] Code ligue inconnu : {league_code}")
        print(f"  Connus : {list(APISPORTS_LEAGUES.keys())}")
        return None
    league_id, default_season = APISPORTS_LEAGUES[league_code]
    if season is None:
        season = default_season

    print(f"\n=== Fetch xG {league_code} (API league={league_id}, season={season}) ===")

    # 1. Get all fixtures of the season
    print(f"  [1/3] Get fixtures ...")
    d = get("fixtures", {"league": league_id, "season": season})
    fixtures = d.get("response", [])
    print(f"    {len(fixtures)} fixtures total")
    # Filter played (status FT, AET, PEN)
    PLAYED = {"FT", "AET", "PEN"}
    played_fixtures = [f for f in fixtures if (f.get("fixture") or {}).get("status", {}).get("short") in PLAYED]
    print(f"    {len(played_fixtures)} fixtures terminees")

    # 2. For each fixture, get statistics (xG)
    print(f"  [2/3] Aggregating xG/xGA per team (1 req per fixture) ...")
    # Aggregator: team_id -> {name, matches, xg_for, xga, dom_xg, ext_xg, dom_xga, ext_xga, dom_n, ext_n, gf, ga}
    teams = {}

    for i, fx in enumerate(played_fixtures, 1):
        fid = (fx.get("fixture") or {}).get("id")
        teams_info = fx.get("teams") or {}
        home = teams_info.get("home") or {}
        away = teams_info.get("away") or {}
        goals = fx.get("goals") or {}
        h_goals = goals.get("home")
        a_goals = goals.get("away")

        if not fid or not home.get("id") or not away.get("id"):
            continue

        # Stats
        s = get("fixtures/statistics", {"fixture": fid})
        stats = s.get("response", [])
        if len(stats) < 2:
            continue

        # Trouve xG pour chaque team
        xg_by_team = {}
        for t in stats:
            tid = (t.get("team") or {}).get("id")
            xg = next((parse_xg_value(x.get("value")) for x in t.get("statistics", []) if x.get("type") == "expected_goals"), None)
            xg_by_team[tid] = xg

        h_id, h_name = home.get("id"), home.get("name")
        a_id, a_name = away.get("id"), away.get("name")
        h_xg = xg_by_team.get(h_id)
        a_xg = xg_by_team.get(a_id)

        # Update aggregators
        for tid, name, is_home, xg_for, xg_against, gf, ga in [
            (h_id, h_name, True,  h_xg, a_xg, h_goals, a_goals),
            (a_id, a_name, False, a_xg, h_xg, a_goals, h_goals),
        ]:
            t = teams.setdefault(tid, {
                "name": name, "matches": 0,
                "xg_total": 0.0, "xga_total": 0.0, "xg_n": 0, "xga_n": 0,
                "xg_dom_total": 0.0, "xg_dom_n": 0,
                "xg_ext_total": 0.0, "xg_ext_n": 0,
                "xga_dom_total": 0.0, "xga_dom_n": 0,
                "xga_ext_total": 0.0, "xga_ext_n": 0,
                "goals": 0, "ga": 0, "matches_dom": 0, "matches_ext": 0,
            })
            t["matches"] += 1
            if is_home: t["matches_dom"] += 1
            else:       t["matches_ext"] += 1
            if gf is not None: t["goals"] += gf
            if ga is not None: t["ga"] += ga
            if xg_for is not None:
                t["xg_total"] += xg_for; t["xg_n"] += 1
                if is_home: t["xg_dom_total"] += xg_for; t["xg_dom_n"] += 1
                else:       t["xg_ext_total"] += xg_for; t["xg_ext_n"] += 1
            if xg_against is not None:
                t["xga_total"] += xg_against; t["xga_n"] += 1
                if is_home: t["xga_dom_total"] += xg_against; t["xga_dom_n"] += 1
                else:       t["xga_ext_total"] += xg_against; t["xga_ext_n"] += 1

        if i % 20 == 0:
            print(f"    [{i}/{len(played_fixtures)}] processed, {len(teams)} teams aggregated")

    # 3. Compute averages
    print(f"  [3/3] Compute averages ...")
    # Filtre teams avec trop peu de matchs (barrages D1/D2 avec ~2 matchs uniquement)
    # car ces team xG/xGA seraient peu fiables et faux positifs (extra teams non Sorare).
    MIN_MATCHES = 10
    out = {}
    n_filtered = 0
    for tid, t in teams.items():
        if t["matches"] < MIN_MATCHES:
            n_filtered += 1
            continue
        def avg(num, den, fallback=0.0):
            return round(num / den, 2) if den > 0 else fallback
        out[t["name"]] = {
            "matches": t["matches"],
            "goals": t["goals"],
            "ga": t["ga"],
            "xg":  avg(t["xg_total"],  t["xg_n"]),
            "xga": avg(t["xga_total"], t["xga_n"]),
            "xg_dom":  avg(t["xg_dom_total"],  t["xg_dom_n"], avg(t["xg_total"], t["xg_n"])),
            "xg_ext":  avg(t["xg_ext_total"],  t["xg_ext_n"], avg(t["xg_total"], t["xg_n"])),
            "xga_dom": avg(t["xga_dom_total"], t["xga_dom_n"], avg(t["xga_total"], t["xga_n"])),
            "xga_ext": avg(t["xga_ext_total"], t["xga_ext_n"], avg(t["xga_total"], t["xga_n"])),
        }
    print(f"  -> {len(out)} teams aggregated  ({n_filtered} filtered out: matches < {MIN_MATCHES})")
    return out


# Aliases : on utilise club_aliases.json (SOURCE UNIQUE — meme que fetch_fixtures.py)
# pour mapper noms API-Football -> noms canoniques Sorare (= player.club).
try:
    with open("club_aliases.json", encoding="utf-8") as _f:
        NAME_ALIASES = json.load(_f)
except Exception:
    NAME_ALIASES = {}


def normalize(s):
    """Normalize team name for fuzzy match."""
    s = (s or "").lower().strip()
    s = re.sub(r"[\s\-\.]+", " ", s)
    s = s.replace("fc ", "").replace(" fc", "").replace("ksv ", "").replace("rsc ", "")
    s = s.replace("royal ", "").replace("kv ", "").replace("kvc ", "")
    return s.strip()


def patch_teams_json(league_code, stats, teams_path="teams_data.json"):
    """Patch teams_data.json (source of truth). merge_data.py copie ensuite vers teams.json.
    Si teams_data.json n'existe pas (rare), fallback sur deglingo-scout-app/public/data/teams.json.
    """
    if not os.path.exists(teams_path):
        teams_path = "deglingo-scout-app/public/data/teams.json"
    with open(teams_path, encoding="utf-8") as f:
        teams = json.load(f)

    # Build set of existing teams in this league
    existing_teams = {t["name"]: t for t in teams if t.get("league") == league_code}
    print(f"\n  teams.json existant pour {league_code}: {len(existing_teams)}")

    # Apply NAME_ALIASES on stats keys
    aliased_stats = {NAME_ALIASES.get(k, k): v for k, v in stats.items()}

    matched = 0
    inserted = 0
    missing = []
    for api_name, s in aliased_stats.items():
        # Try exact match first
        target = existing_teams.get(api_name)
        if not target:
            # Fuzzy match
            n_api = normalize(api_name)
            for ename, eteam in existing_teams.items():
                if normalize(ename) == n_api or n_api in normalize(ename) or normalize(ename) in n_api:
                    target = eteam
                    break
        if target:
            target.update({
                "xg":      s["xg"],
                "xga":     s["xga"],
                "xg_dom":  s["xg_dom"],
                "xg_ext":  s["xg_ext"],
                "xga_dom": s["xga_dom"],
                "xga_ext": s["xga_ext"],
                "matches": s["matches"],
                "goals":   s["goals"],
                "ga":      s["ga"],
            })
            target.setdefault("ppda", PPDA_DEFAULT)
            target.setdefault("ppda_dom", target.get("ppda", PPDA_DEFAULT))
            target.setdefault("ppda_ext", target.get("ppda", PPDA_DEFAULT))
            target.setdefault("npxg", round(s["xg"] * 0.93, 2))   # rough estimate
            target.setdefault("npxga", round(s["xga"] * 0.93, 2))
            matched += 1
        else:
            # Insert new team
            new_team = {
                "name": api_name,
                "league": league_code,
                "ppda": PPDA_DEFAULT,
                "ppda_dom": PPDA_DEFAULT,
                "ppda_ext": PPDA_DEFAULT,
                "xg":      s["xg"],
                "xga":     s["xga"],
                "xg_dom":  s["xg_dom"],
                "xg_ext":  s["xg_ext"],
                "xga_dom": s["xga_dom"],
                "xga_ext": s["xga_ext"],
                "npxg":    round(s["xg"] * 0.93, 2),
                "npxga":   round(s["xga"] * 0.93, 2),
                "matches": s["matches"],
                "goals":   s["goals"],
                "ga":      s["ga"],
            }
            teams.append(new_team)
            inserted += 1

    # Cherche les teams existantes qui n'ont pas matche (logging pour aliases)
    for ename in existing_teams:
        if ename not in aliased_stats:
            ok = False
            n_e = normalize(ename)
            for api_name in aliased_stats:
                n_a = normalize(NAME_ALIASES.get(api_name, api_name))
                if n_e == n_a or n_e in n_a or n_a in n_e:
                    ok = True; break
            if not ok:
                missing.append(ename)

    print(f"  Matches : {matched}, Inserted : {inserted}")
    if missing:
        print(f"  [WARN] {len(missing)} teams existant.tes sans match API : {missing[:8]}")

    with open(teams_path, "w", encoding="utf-8") as f:
        json.dump(teams, f, ensure_ascii=False, indent=2)
    print(f"  [OK] {teams_path} sauve")
    # Aussi push direct dans teams.json deploye (pour preview live sans re-merge)
    deploy_path = "deglingo-scout-app/public/data/teams.json"
    if os.path.exists(deploy_path):
        with open(deploy_path, "w", encoding="utf-8") as f:
            json.dump(teams, f, ensure_ascii=False, indent=2)
        print(f"  [OK] {deploy_path} aussi sync")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch xG via API-Football")
    parser.add_argument("league", help=f"Code ligue : {','.join(APISPORTS_LEAGUES.keys())} ou LIST")
    parser.add_argument("--season", type=int, default=None, help="Season (default 2025)")
    parser.add_argument("--no-patch", action="store_true", help="Print stats sans toucher teams.json")
    args = parser.parse_args()

    if args.league == "LIST":
        print("Ligues mappees :")
        for code, (lid, season) in APISPORTS_LEAGUES.items():
            print(f"  {code:15s} = league_id {lid}, default season {season}")
        sys.exit(0)

    if not KEY:
        print("[ERREUR] API_FOOTBALL_KEY pas dans .env")
        sys.exit(1)

    stats = fetch_league_xg(args.league, season=args.season)
    if not stats:
        sys.exit(1)

    if args.no_patch:
        print("\n=== Stats per team ===")
        for name, s in sorted(stats.items()):
            print(f"  {name:30s} xg={s['xg']:.2f}  xga={s['xga']:.2f}  mp={s['matches']}  G={s['goals']}/{s['ga']}")
    else:
        patch_teams_json(args.league, stats)

    print("\n[DONE]")
