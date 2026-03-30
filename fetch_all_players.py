#!/usr/bin/env python3
"""
Deglingo Scout — Fetch ALL players for a league from Sorare API.
Clean version V2: 2 queries/player, anti-ban, proper backoff.

Usage:
  python3 fetch_all_players.py PL          # Premier League
  python3 fetch_all_players.py Liga        # La Liga
  python3 fetch_all_players.py Bundes      # Bundesliga
  python3 fetch_all_players.py L1          # Ligue 1
  python3 fetch_all_players.py ALL         # All 4 leagues
  python3 fetch_all_players.py PL --fresh  # Delete existing & start from scratch
"""

import requests, json, time, math, sys, os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# ─── CONFIG ──────────────────────────────────────────────────
URL = "https://api.sorare.com/federation/graphql"
API_KEY = os.getenv("SORARE_API_KEY", "")
HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json",
}
if API_KEY:
    HEADERS["APIKEY"] = API_KEY
    print(f"🔑 API Key détectée — mode rapide activé")
    SLEEP = 0.109        # ~550 req/min (safe sous 600 limit)
    CLUB_SLEEP = 1       # Minimal pause between clubs
else:
    print(f"⚠️  Pas de clé API — mode lent (24 req/min)")
    SLEEP = 2.5          # Between each query (safe for ~24 req/min)
    CLUB_SLEEP = 5       # Between clubs (extra breathing room)
BAN_PAUSE = 120      # Pause if 403 detected (IP ban)
SAVE_EVERY = 5       # Save every N players

LEAGUE_SLUGS = {
    "L1":     "ligue-1-fr",
    "PL":     "premier-league-gb-eng",
    "Liga":   "laliga-es",
    "Bundes": "bundesliga-de",
}
LEAGUE_FILES = {
    "L1":     "deglingo_ligue1_final.json",
    "PL":     "deglingo_premier_league_final.json",
    "Liga":   "deglingo_la_liga_final.json",
    "Bundes": "deglingo_bundesliga_final.json",
}

# ─── AA STAT CATEGORIES (for detailedScore profile) ─────────
DEF_STATS  = {"won_tackle","clean_sheet_60","effective_clearance","blocked_scoring_attempt","tackle"}
PASS_STATS = {"accurate_pass","successful_final_third_passes","accurate_long_balls",
              "long_pass_own_to_opp_success","adjusted_total_att_assist","big_chance_created"}
POSS_STATS = {"interception_won","poss_won","duel_won","ball_recovery","won_contest"}
ATT_STATS  = {"ontarget_scoring_att","pen_area_entries","successful_dribble","was_fouled","penalty_won"}
# AA_CATS removed — sum ALL 6 categories (GENERAL=0, DEFENDING, PASSING, POSSESSION, ATTACKING, GOALKEEPING)


# ─── GRAPHQL CALLER WITH ANTI-BAN ───────────────────────────
def gql(query, variables=None, label=""):
    """Execute GraphQL query with retry, rate-limit handling, and 403 recovery."""
    for attempt in range(5):
        try:
            r = requests.post(URL, json={"query": query, "variables": variables or {}},
                            headers=HEADERS, timeout=30)

            # HTTP 403 = CloudFront IP ban → long pause
            if r.status_code == 403:
                wait = BAN_PAUSE * (attempt + 1)
                print(f"\n    🚫 403 BAN détecté! Pause {wait}s... (tentative {attempt+1}/5)")
                time.sleep(wait)
                continue

            # HTTP 429 or 5xx = rate limit / server error
            if r.status_code in (429, 500, 502, 503):
                wait = 30 * (attempt + 1)
                print(f"\n    ⏳ HTTP {r.status_code}, pause {wait}s...")
                time.sleep(wait)
                continue

            data = r.json()

            # GraphQL rate limit error
            if "errors" in data:
                msg = str(data["errors"][0].get("message", "")).lower()
                if "rate" in msg or "too many" in msg or "throttl" in msg:
                    wait = 45 * (attempt + 1)
                    print(f"\n    ⏳ Rate limited ({label}), pause {wait}s...")
                    time.sleep(wait)
                    continue

            return data

        except requests.exceptions.Timeout:
            print(f"\n    ⏱️ Timeout ({label}), retry {attempt+1}...")
            time.sleep(15)
        except Exception as e:
            print(f"\n    ⚠️ {e} ({label}), retry {attempt+1}...")
            time.sleep(15)

    print(f"\n    ❌ ÉCHEC après 5 tentatives ({label})")
    return {"errors": [{"message": "Failed after 5 attempts"}]}


# ─── HELPERS ─────────────────────────────────────────────────
def avg(lst): return sum(lst)/len(lst) if lst else 0
def std(lst):
    if len(lst) < 2: return 0
    m = avg(lst)
    return math.sqrt(sum((x-m)**2 for x in lst) / len(lst))


# ─── STEP 1: FETCH CLUBS ────────────────────────────────────
def fetch_clubs(league_slug):
    print(f"\n📡 Fetching clubs for {league_slug}...")
    data = gql("""
    query($slug: String!) {
      football {
        competition(slug: $slug) {
          displayName
          clubs(first: 30) {
            nodes { slug name }
          }
        }
      }
    }""", {"slug": league_slug}, label="clubs")
    try:
        comp = data["data"]["football"]["competition"]
        clubs = comp["clubs"]["nodes"]
        print(f"  ✅ {comp['displayName']}: {len(clubs)} clubs")
        return clubs
    except:
        print(f"  ❌ Erreur clubs: {json.dumps(data)[:300]}")
        return []


# ─── STEP 2: FETCH PLAYERS PER CLUB ─────────────────────────
def fetch_club_players(club_slug):
    all_nodes = []
    cursor = None
    while True:
        after = f', after: "{cursor}"' if cursor else ""
        data = gql(f"""{{
          football {{
            club(slug: "{club_slug}") {{
              activePlayers(first: 50{after}) {{
                nodes {{ slug displayName position }}
                pageInfo {{ hasNextPage endCursor }}
              }}
            }}
          }}
        }}""", label=f"club-players:{club_slug}")
        try:
            conn = data["data"]["football"]["club"]["activePlayers"]
            all_nodes.extend(conn["nodes"])
            if conn["pageInfo"]["hasNextPage"]:
                cursor = conn["pageInfo"]["endCursor"]
                time.sleep(SLEEP)
            else:
                break
        except:
            print(f"    ⚠️ Erreur pagination {club_slug}")
            break
    return all_nodes


# ─── STEP 3+4: FETCH PLAYER (2 queries au lieu de 3) ────────
Q_MAIN = """query P($slug: String!) { football { player(slug: $slug) {
    displayName position age
    country { code }
    activeClub { name }
    stats(seasonStartYear: 2025) {
        appearances minutesPlayed goals assists yellowCards redCards
    }
    so5Scores(last: 40) {
        score
        allAroundStats { category totalScore }
        game { date competition { slug } homeTeam { name } awayTeam { name } homeGoals awayGoals }
    }
}}}"""

Q_DETAIL = """query P($slug: String!) { football { player(slug: $slug) {
    so5Scores(last: 40) {
        score
        detailedScore { category stat statValue totalScore }
        game { competition { slug } }
    }
}}}"""

# Championnats uniquement — Streak Ligue only (pas de CL, coupes, sélections)
VALID_COMPS = {
    "premier-league-gb-eng", "laliga-es", "bundesliga-de",
    "ligue-1-fr", "serie-a-it",
}


def fetch_player(slug, club_name, league):
    """Fetch full player data in 2 queries (main + detailedScore)."""

    # Query 1: Main data (scores + allAroundStats + season stats)
    raw = gql(Q_MAIN, {"slug": slug}, label=f"main:{slug}")
    time.sleep(SLEEP)

    try:
        player = raw["data"]["football"]["player"]
    except:
        return None
    if not player:
        return None

    # Filtrer : score > 0 ET compétition club (pas sélections/friendlies)
    all_scores = player.get("so5Scores", [])
    played = []
    # Timeline: garde les 5 derniers matchs club AVEC DNP (score=0) pour sparkline
    timeline_5 = []
    for s in all_scores:
        comp_slug = (s.get("game") or {}).get("competition", {}).get("slug", "")
        if comp_slug and comp_slug not in VALID_COMPS:
            continue  # Skip friendlies, sélections nationales, etc.
        # Timeline: inclut DNP (score 0) pour les 5 plus récents
        if len(timeline_5) < 5:
            timeline_5.append(s.get("score", 0))
        if s.get("score", 0) <= 0:
            continue
        played.append(s)
    played = played[:25]  # On garde max 25 matchs club (élargi pour clubs en coupe d'Europe)

    # Query 2: DetailedScore — SKIP si 0 matchs (économise 1 query = moins de ban)
    det_data = None
    if len(played) >= 1:
        raw_det = gql(Q_DETAIL, {"slug": slug}, label=f"detail:{slug}")
        time.sleep(SLEEP)
        # Filtrer detailedScore aussi (même filtre compétition)
        if raw_det and "data" in raw_det:
            det_scores = raw_det["data"]["football"]["player"]["so5Scores"]
            det_filtered = []
            for ds in det_scores:
                if ds.get("score", 0) <= 0:
                    continue
                comp_slug = (ds.get("game") or {}).get("competition", {}).get("slug", "")
                if comp_slug and comp_slug not in VALID_COMPS:
                    continue
                det_filtered.append(ds)
            det_filtered = det_filtered[:15]
            det_data = {"data": {"football": {"player": {"so5Scores": det_filtered}}}}
        else:
            det_data = raw_det

    # ─── COMPUTE KPIs ────────────────────────────────────────
    stats = player.get("stats") or {}
    scores = [s["score"] for s in played] if played else []
    club_p = (player.get("activeClub") or {}).get("name", "") or club_name

    # Dom/Ext split
    dom = [s["score"] for s in played
           if (s.get("game") or {}).get("homeTeam", {}).get("name") == club_p]
    ext = [s["score"] for s in played
           if (s.get("game") or {}).get("homeTeam", {}).get("name") != club_p]

    # Score windows
    s5  = scores[:5] if len(scores) >= 5 else scores
    s10 = scores[:10]
    s15 = scores[:15]
    l5  = avg(scores[:5]) if len(scores) >= 5 else avg(scores)

    # Régularité
    ab60    = sum(1 for s in s15 if s > 60)
    reg     = round(ab60 / len(s15) * 100, 0) if s15 else 0
    ab60_10 = sum(1 for s in s10 if s > 60)
    reg10   = round(ab60_10 / len(s10) * 100, 0) if s10 else 0

    # Season stats
    apps = stats.get("appearances", len(played)) or len(played)
    mins = stats.get("minutesPlayed", 0) or 0
    goals = stats.get("goals", 0) or 0
    assists = stats.get("assists", 0) or 0
    ga = (goals + assists) / apps if apps > 0 else 0

    # ─── AA SCORES from allAroundStats (real Sorare AA) ──────
    # Sum ALL 6 categories: GENERAL(=0), DEFENDING, PASSING, POSSESSION, ATTACKING, GOALKEEPING
    # No filter needed — GENERAL is always 0, GOALKEEPING is 0 for outfield players
    aa_scores = []
    for m in played:
        aa_stats = m.get("allAroundStats") or []
        if aa_stats:
            aa_scores.append(sum(a.get("totalScore", 0) for a in aa_stats))
        else:
            aa_scores.append(0)

    aa5 = avg(aa_scores[:5]) if len(aa_scores) >= 5 else avg(aa_scores) if aa_scores else 0

    # ─── AA PROFILE from detailedScore ───────────────────────
    aa_profile = {}
    if not det_data:
        pass  # 0 matchs — pas de detailedScore
    try:
        det_scores = [s for s in (det_data or {}).get("data", {}).get("football", {}).get("player", {}).get("so5Scores", [])
                      if s.get("score", 0) > 0]
        if det_scores:
            t = {"d": [], "p": [], "po": [], "a": [], "n": [], "ftp": []}
            # Individual stat trackers (statValue = raw count per match)
            TRACKED_STATS = {
                "won_tackle", "effective_clearance", "blocked_scoring_attempt",
                "ontarget_scoring_att", "pen_area_entries", "successful_dribble", "was_fouled",
                "interception_won", "duel_won", "ball_recovery", "won_contest",
                "accurate_pass", "successful_final_third_passes", "accurate_long_balls",
                "big_chance_created", "adjusted_total_att_assist",
            }
            stat_values = {s: [] for s in TRACKED_STATS}

            for m in det_scores:
                det = m.get("detailedScore") or []
                if not det:
                    continue
                md = mp = mpo = ma = mn = mf = 0
                # Track which stats appeared this match (for 0-filling)
                match_stats = {}
                for d in det:
                    sn_stat = d.get("stat", "")
                    pt = d.get("totalScore", 0)
                    v  = d.get("statValue", 0)
                    if sn_stat in DEF_STATS:    md += pt
                    elif sn_stat in PASS_STATS: mp += pt
                    elif sn_stat in POSS_STATS: mpo += pt
                    elif sn_stat in ATT_STATS:  ma += pt
                    if pt < 0: mn += pt
                    if sn_stat == "successful_final_third_passes": mf = v
                    # Track individual stat values
                    if sn_stat in TRACKED_STATS:
                        match_stats[sn_stat] = v
                # Append values (0 if stat not present in this match)
                for s in TRACKED_STATS:
                    stat_values[s].append(match_stats.get(s, 0))

                t["d"].append(md); t["p"].append(mp); t["po"].append(mpo)
                t["a"].append(ma); t["n"].append(mn); t["ftp"].append(mf)
            if t["d"]:
                aa_profile = {
                    "aa_defending": round(avg(t["d"]), 1),
                    "aa_passing": round(avg(t["p"]), 1),
                    "aa_possession": round(avg(t["po"]), 1),
                    "aa_attacking": round(avg(t["a"]), 1),
                    "aa_negative": round(avg(t["n"]), 1),
                    "final_third_passes_avg": round(avg(t["ftp"]), 1),
                    "aa_matches_analyzed": len(t["d"]),
                }
                # Individual stat averages per match
                for s in TRACKED_STATS:
                    if stat_values[s]:
                        aa_profile[f"avg_{s}"] = round(avg(stat_values[s]), 2)
    except:
        pass

    # ─── ARCHETYPE CLASSIFICATION ────────────────────────────
    pos = player["position"]
    ad = aa_profile.get("aa_defending", 0)
    ap = aa_profile.get("aa_passing", 0)
    at = aa_profile.get("aa_attacking", 0)
    ao = aa_profile.get("aa_possession", 0)
    has_profile = "aa_defending" in aa_profile
    ftp = aa_profile.get("final_third_passes_avg", 0)
    ds_rate = round(sum(1 for s in s15 if s >= 60) / len(s15) * 100, 0) if s15 else 0

    # Joueurs 0 match = "Nouveau" (pépite/transfert récent)
    if not scores:
        arch_suffix = " (Nouveau)"
    else:
        arch_suffix = ""

    if pos == "Goalkeeper":
        arch = "GK"
    elif pos == "Defender":
        if has_profile:
            lat = min(ftp/15*30, 30) + min(at/5*20, 20) + min(ap/15*15, 15)
            cen = min(ad/10*30, 30) + max(0, (1-ftp/10))*20 + max(0, (1-at/3))*15
            arch = "DEF Latéral" if lat > cen + 10 else "DEF Central"
        else:
            arch = "DEF Central"
    elif pos == "Midfielder":
        if aa5 >= 18:
            arch = "MIL GOAT"
        elif has_profile and (ad+ao > at*2) and aa5 >= 10 and reg >= 60:
            arch = "MIL Récup" if ad+ao > ap else "MIL Relanceur"
        elif aa5 >= 10 and reg >= 60:
            arch = "MIL B2B"
        elif aa5 >= 8 and reg >= 60:
            arch = "MIL Récup"
        elif ga >= 0.2:
            arch = "MIL Créateur"
        else:
            arch = "MIL Rotation"
    elif pos == "Forward":
        if aa5 >= 12 and reg >= 70:
            arch = "ATT GOAT"
        elif aa5 >= 8 and reg >= 60:
            arch = "ATT Complet"
        elif aa5 >= 5:
            arch = "ATT Complet"
        else:
            arch = "ATT Finisseur"
    else:
        arch = "?"

    mp = len(played)
    # mt = matchs de la LIGUE uniquement (incluant DNP = score 0)
    league_matches = [s for s in all_scores
                      if (s.get("game") or {}).get("competition", {}).get("slug", "") in VALID_COMPS]
    mt = len(league_matches)
    mt = max(mt, mp)  # safety: au moins autant que played
    titu = round(mp / mt * 100) if mt else 0

    # ─── BUILD KPI DICT ─────────────────────────────────────
    kpis = {
        "name": player["displayName"],
        "slug": slug,
        "position": pos,
        "age": player.get("age", 0),
        "club": club_p,
        "league": league,
        "country": (player.get("country") or {}).get("code", ""),
        "status": "",
        "archetype": arch,
        # Scores
        "l2": round(avg(scores[:2]), 1),
        "l3": round(avg(scores[:3]), 1),
        "l5": round(l5, 1),
        "l10": round(avg(scores[:10]), 1) if len(scores) >= 10 else round(avg(scores), 1),
        "l15": round(avg(scores[:15]), 1) if len(scores) >= 15 else round(avg(scores), 1),
        "l25": round(avg(scores[:25]), 1) if len(scores) >= 25 else round(avg(scores), 1),
        "l40": round(avg([s["score"] for s in all_scores if s.get("score", 0) > 0][:40]), 1) if any(s.get("score", 0) > 0 for s in all_scores) else 0,
        "aa40": round(avg([sum(a.get("totalScore", 0) for a in (s.get("allAroundStats") or [])) for s in all_scores if s.get("score", 0) > 0][:40]), 1) if any(s.get("score", 0) > 0 for s in all_scores) else 0,
        "last_5": [round(s, 1) for s in timeline_5],
        "last_10": [round(s, 1) for s in scores[:10]],
        "last_25": [round(s, 1) for s in scores[:25]],
        # AA
        "aa2": round(avg(aa_scores[:2]), 1),
        "aa3": round(avg(aa_scores[:3]), 1),
        "aa5": round(aa5, 1),
        "aa10": round(avg(aa_scores[:10]), 1) if len(aa_scores) >= 10 else round(avg(aa_scores), 1),
        "aa15": round(avg(aa_scores[:15]), 1) if len(aa_scores) >= 15 else round(avg(aa_scores), 1),
        "aa25": round(avg(aa_scores[:25]), 1) if len(aa_scores) >= 25 else round(avg(aa_scores), 1),
        "aa_trend": round(avg(aa_scores[:2]) - avg(aa_scores[:5]), 1) if len(aa_scores) >= 5 else 0,
        # Decisive
        "ds5": round(sum(1 for s in s5 if s >= 60) / len(s5) * 100, 0) if s5 else 0,
        "ds15": round(sum(1 for s in s15 if s >= 60) / len(s15) * 100, 0) if s15 else 0,
        "ds_rate": ds_rate,
        # Early signal
        "early_signal": round((avg(scores[:2]) - l5) / l5 * 100, 1) if l5 > 0 and len(scores) >= 2 else 0,
        # Volatilité
        "floor": round(min(s5), 0) if s5 else 0,
        "ceiling": round(max(scores), 0) if scores else 0,  # max sur tous les matchs dispos (pas juste s5)
        "ecart_5": round(std(s5), 1),
        "ecart_15": round(std(s15), 1),
        "min_5": round(min(s5), 1) if s5 else 0,
        "max_5": round(max(s5), 1) if s5 else 0,
        "min_15": round(min(s15), 1) if s15 else 0,
        "max_15": round(max(s15), 1) if s15 else 0,
        # Régularité
        "regularite": reg,
        "reg10": reg10,
        "pct_above_60": round(ab60 / len(s15) * 100, 0) if s15 else 0,
        "pct_below_35": round(sum(1 for s in s15 if s < 35) / len(s15) * 100, 0) if s15 else 0,
        # Dom/Ext
        "avg_dom": round(avg(dom), 1) if dom else round(l5, 1),
        "avg_ext": round(avg(ext), 1) if ext else round(l5, 1),
        "delta_dom_ext": round((avg(dom) if dom else l5) - (avg(ext) if ext else l5), 1),
        "matchs_dom": len(dom),
        "matchs_ext": len(ext),
        # Saison
        "appearances": apps,
        "goals": goals,
        "assists": assists,
        "yellow": stats.get("yellowCards", 0) or 0,
        "red": stats.get("redCards", 0) or 0,
        "mins_per_match": round(mins / apps, 0) if apps else 0,
        "titu_pct": titu,
        "ga_per_match": round(ga, 3),
        # Pipeline
        "matchs_played": mp,
        "matchs_total": mt,
        "last_date": played[0].get("game", {}).get("date", "")[:10] if played else "",
    }
    kpis.update(aa_profile)
    return kpis


# ─── MAIN: SCRAPE A LEAGUE ──────────────────────────────────
def scrape_league(league_code, fresh=False):
    slug = LEAGUE_SLUGS.get(league_code)
    if not slug:
        print(f"❌ Ligue inconnue: {league_code}")
        return

    outfile = LEAGUE_FILES[league_code]
    print(f"\n{'='*60}")
    print(f"⚽ SCRAPING {league_code} ({slug})")
    print(f"  📅 {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"  💤 Sleep: {SLEEP}s/query, {CLUB_SLEEP}s/club")
    print(f"{'='*60}")

    # Load or reset
    existing = []
    existing_slugs = set()
    if fresh and os.path.exists(outfile):
        backup = outfile.replace(".json", "_backup.json")
        if os.path.exists(backup):
            os.remove(backup)
        os.rename(outfile, backup)
        print(f"  🗑️  FRESH mode — backup créé, on repart de zéro")
    elif os.path.exists(outfile):
        with open(outfile, "r", encoding="utf-8") as f:
            existing = json.load(f)
        existing_slugs = {p["slug"] for p in existing}
        print(f"  📂 Base existante: {len(existing)} joueurs")

    # Fetch clubs
    clubs = fetch_clubs(slug)
    if not clubs:
        print("❌ Aucun club trouvé — API probablement ban. Réessaie plus tard.")
        return

    t0 = time.time()
    total_new = 0
    total_updated = 0
    total_skipped = 0
    total_players = 0

    for ci, club in enumerate(clubs):
        club_name = club["name"]
        club_slug = club["slug"]
        elapsed = time.time() - t0
        eta = ""
        if total_players > 0:
            rate = elapsed / total_players  # seconds per player
            remaining_clubs = len(clubs) - ci
            est_remaining = remaining_clubs * 25 * rate  # ~25 players/club estimate
            eta = f" | ETA ~{int(est_remaining/60)}min"

        print(f"\n🏟️  [{ci+1}/{len(clubs)}] {club_name}{eta}")

        players = fetch_club_players(club_slug)
        time.sleep(CLUB_SLEEP)
        print(f"  👥 {len(players)} joueurs actifs")

        for pi, p in enumerate(players):
            pslug = p["slug"]
            pname = p["displayName"]
            total_players += 1
            print(f"  [{pi+1}/{len(players)}] {pname}...", end=" ", flush=True)

            # SKIP joueurs déjà en base (sauf --fresh)
            if pslug in existing_slugs:
                print(f"⏭️  déjà en base")
                total_skipped += 1
                continue

            kpis = fetch_player(pslug, club_name, league_code)
            if kpis is None:
                print("skip (no data)")
                total_skipped += 1
                continue

            # Add new player
            if pslug in existing_slugs:
                existing = [x for x in existing if x["slug"] != pslug]
                existing.append(kpis)
                print(f"🔄 L5={kpis['l5']:.0f} AA5={kpis['aa5']:.0f} | {kpis['archetype']}")
                total_updated += 1
            else:
                existing.append(kpis)
                existing_slugs.add(pslug)
                print(f"🆕 L5={kpis['l5']:.0f} AA5={kpis['aa5']:.0f} | {kpis['archetype']}")
                total_new += 1

            # Periodic save
            if (total_new + total_updated) % SAVE_EVERY == 0:
                with open(outfile, "w", encoding="utf-8") as f:
                    json.dump(existing, f, ensure_ascii=False, indent=2)
                print(f"    💾 Sauvegarde ({len(existing)} joueurs)")

    # Final save
    with open(outfile, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    elapsed = time.time() - t0
    print(f"\n{'='*60}")
    print(f"✅ {league_code} terminé en {int(elapsed/60)}min {int(elapsed%60)}s")
    print(f"  🆕 Nouveaux: {total_new}")
    print(f"  🔄 Mis à jour: {total_updated}")
    print(f"  ⏭️  Skippés: {total_skipped}")
    print(f"  📊 Total: {len(existing)} joueurs")
    print(f"  💾 {outfile}")
    print(f"{'='*60}")


# ─── CLI ─────────────────────────────────────────────────────
if __name__ == "__main__":
    args = sys.argv[1:]
    fresh = "--fresh" in args
    args = [a for a in args if a != "--fresh"]
    target = args[0] if args else "ALL"

    # Pre-flight: test API connectivity
    print("🔍 Test API Sorare...", end=" ", flush=True)
    test = gql('{ football { competition(slug: "ligue-1-fr") { displayName } } }', label="preflight")
    try:
        name = test["data"]["football"]["competition"]["displayName"]
        print(f"✅ API OK ({name})")
    except:
        print(f"❌ API inaccessible (403 ban probable). Réessaie dans 15-30min.")
        print(f"   Test: curl -s -o /dev/null -w '%{{http_code}}' https://api.sorare.com/federation/graphql")
        sys.exit(1)

    if target == "ALL":
        for lg in ["L1", "PL", "Liga", "Bundes"]:
            scrape_league(lg, fresh=fresh)
            print(f"\n⏸️  Pause 30s avant la prochaine ligue...")
            time.sleep(30)
    elif target in LEAGUE_SLUGS:
        scrape_league(target, fresh=fresh)
    else:
        print(f"❌ Usage: python3 fetch_all_players.py [L1|PL|Liga|Bundes|ALL] [--fresh]")
        sys.exit(1)

    print(f"\n🏁 Terminé! Prochaines étapes:")
    print(f"  python3 merge_data.py")
    print(f"  cd deglingo-scout-app && npx vite build")
    print(f"  rm -rf /Users/damiengheza/Desktop/Moonwalk/.claude/scout-dist/assets")
    print(f"  cp -r dist/* /Users/damiengheza/Desktop/Moonwalk/.claude/scout-dist/")
