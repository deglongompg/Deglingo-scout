#!/usr/bin/env python3
"""
fetch_fbref.py — Scrape xG/xGA depuis FBref pour une ligue donnee.

Source : https://fbref.com (Sports Reference). Couvre 30+ ligues mondiales.
Bypass Cloudflare via seleniumbase UC mode (~30s par ligue, headless Chrome).

Usage :
  py fetch_fbref.py MLS                  # MLS (code FBref 22)
  py fetch_fbref.py L1                   # Ligue 1
  py fetch_fbref.py ALL                  # Toutes les ligues activees
  py fetch_fbref.py --add Brazil 24      # Ajouter une nouvelle ligue (code FBref)

Output : patch direct dans deglingo-scout-app/public/data/teams.json (xg/xga).
PPDA inchange dans cette v1 (necessite scrape sub-pages defense+possession).
"""
import sys, os, re, json, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Mapping nos codes ligue → (FBref ID, FBref slug)
# Codes FBref trouves en explorant le site (URL : /en/comps/{ID}/{slug}-Stats)
FBREF_LEAGUES = {
    "L1":      (13, "Ligue-1"),
    "PL":      (9,  "Premier-League"),
    "Liga":    (12, "La-Liga"),
    "Bundes":  (20, "Bundesliga"),
    "SerieA":  (11, "Serie-A"),
    "MLS":     (22, "Major-League-Soccer"),
    "Brazil":  (24, "Serie-A"),
    "Argentina":(21, "Liga-Profesional-Argentina"),
    "Japan":   (25, "J1-League"),
    "Korea":   (24, "K-League-1"),
    "Turkey":  (26, "Super-Lig"),
    "Russia":  (30, "Premier-League"),
    "Switzerland": (57, "Super-League"),
    "Belgium": (37, "Belgian-Pro-League"),
    "Scotland":(40, "Scottish-Premiership"),
    "Netherlands":(23, "Eredivisie"),
    "L2":      (60, "Ligue-2"),
    "Liga2":   (17, "Segunda-Division"),
    "Championship": (10, "Championship"),
    "Bundes2": (33, "2-Bundesliga"),
}

def fbref_url(league_code):
    if league_code not in FBREF_LEAGUES:
        return None
    fid, slug = FBREF_LEAGUES[league_code]
    return f"https://fbref.com/en/comps/{fid}/{slug}-Stats"

def parse_squad_stats_table(html):
    """Parse la table `stats_squads_standard_for` qui contient les stats par squad.
    Retourne {team_name: {'xg': float, 'xga': float, 'mp': int}}."""
    # Trouver la table
    m = re.search(r'<table[^>]*id="stats_squads_standard_for"[^>]*>(.+?)</table>', html, re.DOTALL)
    if not m:
        return {}
    tbody = re.search(r'<tbody>(.+?)</tbody>', m.group(1), re.DOTALL)
    if not tbody:
        return {}

    out = {}
    rows = re.findall(r'<tr[^>]*>(.+?)</tr>', tbody.group(1), re.DOTALL)
    for row in rows:
        # Squad name : <th data-stat="team"><a href="...">Team Name</a></th>
        team_m = re.search(r'data-stat="team"[^>]*>(?:<a[^>]*>)?([^<]+)', row)
        if not team_m:
            continue
        team_name = team_m.group(1).strip()
        # Stats : <td data-stat="xg_for">2.03</td> etc. (fbref utilise xg_for / xg_against pour for/against)
        # Note : sur la page principale "for", la table utilise des stats de l'equipe directement (xg, xg_against, etc.)
        def stat(name):
            m = re.search(rf'data-stat="{name}"[^>]*>([^<]*)', row)
            if m:
                v = m.group(1).strip()
                if not v: return None
                try: return float(v.replace(",", "."))
                except: return None
            return None

        xg = stat("xg_for") or stat("xg")
        xga = stat("xg_against") or stat("xga")
        mp = stat("games") or stat("matches_played")
        # Fallback : xg_per90 / xg_against_per90 si presents
        xg_p90 = stat("xg_per90")
        xga_p90 = stat("xg_against_per90")

        out[team_name] = {
            "xg": xg, "xga": xga, "mp": int(mp) if mp else None,
            "xg_per90": xg_p90, "xga_per90": xga_p90,
        }
    return out


def fetch_league_from_fbref(league_code):
    """Lance Chrome UC, fetch la page FBref, parse la table standard."""
    from seleniumbase import SB
    url = fbref_url(league_code)
    if not url:
        print(f"[ERREUR] Code ligue inconnu : {league_code}. Connus : {list(FBREF_LEAGUES.keys())}")
        return None
    print(f"[INFO] Fetch {url} ...")
    with SB(uc=True, headless=True) as sb:
        sb.uc_open_with_reconnect(url, 4)
        html = sb.get_page_source()
    stats = parse_squad_stats_table(html)
    print(f"[INFO] Parse {len(stats)} squads pour {league_code}")
    for team, s in list(stats.items())[:3]:
        print(f"  {team:30s}  xg={s['xg']}  xga={s['xga']}  mp={s['mp']}  xg/90={s['xg_per90']}")
    return stats


def patch_teams_json(league_code, stats, teams_path="deglingo-scout-app/public/data/teams.json"):
    """Patch teams.json : update xg/xga pour les teams de la ligue qui matchent."""
    with open(teams_path, encoding="utf-8") as f:
        teams = json.load(f)

    # Helper : normalise le nom pour match fuzzy (fbref vs nos noms)
    def norm(s):
        s = (s or "").lower().strip()
        s = re.sub(r"[\s\-\.]+", " ", s)
        return s

    fbref_norm = {norm(name): (name, s) for name, s in stats.items()}
    matched, missing = 0, []
    for t in teams:
        if t.get("league") != league_code:
            continue
        nm = norm(t.get("name"))
        # Match exact ou contains
        s = fbref_norm.get(nm)
        if not s:
            for fname_norm, (fname, fs) in fbref_norm.items():
                if nm in fname_norm or fname_norm in nm:
                    s = (fname, fs); break
        if not s:
            missing.append(t.get("name"))
            continue
        fname, fs = s
        # Patch xg/xga (per match, FBref donne souvent par-90 dans la table principale)
        xg_per_match = fs.get("xg_per90")
        xga_per_match = fs.get("xga_per90")
        if xg_per_match is not None: t["xg"] = round(xg_per_match, 2)
        if xga_per_match is not None: t["xga"] = round(xga_per_match, 2)
        matched += 1

    print(f"[INFO] Match {matched} teams patchees, {len(missing)} non matches")
    if missing:
        print(f"  Non matches : {missing[:10]}")

    with open(teams_path, "w", encoding="utf-8") as f:
        json.dump(teams, f, ensure_ascii=False, indent=2)
    print(f"[OK] {teams_path} patche")
    return matched


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    targets = []
    if args[0] == "ALL":
        targets = list(FBREF_LEAGUES.keys())
    else:
        targets = [args[0]]
    for code in targets:
        stats = fetch_league_from_fbref(code)
        if stats:
            patch_teams_json(code, stats)
        print()
