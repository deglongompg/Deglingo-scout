#!/usr/bin/env python3
"""
Fetch ALL SO7-eligible players for a league from Sorare API.
Replaces manual slug lists with automatic club-by-club scraping.

Usage:
  python3 fetch_all_players.py L1          # Ligue 1
  python3 fetch_all_players.py PL          # Premier League
  python3 fetch_all_players.py Liga        # La Liga
  python3 fetch_all_players.py Bundes      # Bundesliga
  python3 fetch_all_players.py ALL         # All 4 leagues
"""

import requests, json, time, math, sys, os

URL = "https://api.sorare.com/federation/graphql"
H = {"Content-Type": "application/json"}
SLEEP = 1.5  # Between player queries
CLUB_SLEEP = 2  # Between club queries

# Sorare competition slugs
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

POS_MAP = {
    "Goalkeeper": "GK",
    "Defender": "DEF",
    "Midfielder": "MIL",
    "Forward": "ATT",
}

def q(query, variables=None):
    for attempt in range(3):
        try:
            r = requests.post(URL, json={"query": query, "variables": variables or {}}, headers=H, timeout=30)
            data = r.json()
            if "error" in data and "too many" in str(data.get("error","")).lower():
                print(f"    ⏳ Rate limited, pause 45s..."); time.sleep(45); continue
            if "errors" in data:
                msg = data["errors"][0].get("message","")
                if "rate" in msg.lower() or "too many" in msg.lower():
                    print(f"    ⏳ Rate limited, pause 45s..."); time.sleep(45); continue
            return data
        except Exception as e:
            print(f"    ⚠️ {e}"); time.sleep(10)
    return {"errors": [{"message": "Failed"}]}

def avg(l): return sum(l)/len(l) if l else 0
def std(l):
    if len(l)<2: return 0
    m=avg(l); return math.sqrt(sum((x-m)**2 for x in l)/len(l))


def fetch_clubs(league_slug):
    """Get all clubs in a league from Sorare."""
    print(f"\n📡 Fetching clubs for {league_slug}...")
    data = q("""
    query($slug: String!) {
      football {
        competition(slug: $slug) {
          clubs(first: 30) {
            nodes { slug domesticLeague { slug } name }
          }
        }
      }
    }
    """, {"slug": league_slug})
    try:
        clubs = data["data"]["football"]["competition"]["clubs"]["nodes"]
        print(f"  ✅ {len(clubs)} clubs trouvés")
        return clubs
    except:
        print(f"  ❌ Erreur: {data}")
        return []


def fetch_club_players(club_slug):
    """Get all active players for a club (paginated to stay under complexity limit)."""
    all_nodes = []
    cursor = None
    while True:
        after = f', after: "{cursor}"' if cursor else ""
        data = q(f"""{{
          football {{
            club(slug: "{club_slug}") {{
              activePlayers(first: 50{after}) {{
                nodes {{ slug displayName position }}
                pageInfo {{ hasNextPage endCursor }}
              }}
            }}
          }}
        }}""")
        try:
            conn = data["data"]["football"]["club"]["activePlayers"]
            all_nodes.extend(conn["nodes"])
            if conn["pageInfo"]["hasNextPage"]:
                cursor = conn["pageInfo"]["endCursor"]
                time.sleep(SLEEP)
            else:
                break
        except:
            break
    return all_nodes


def fetch_player_stats(slug, club_name, league):
    """Fetch full stats for a single player."""
    raw = q("""query P($slug: String!) { football { player(slug: $slug) {
        displayName position age country { code } activeClub { name }
        so5Scores(last: 15) { score allAroundStats { category totalScore } game { date homeTeam { name } awayTeam { name } homeGoals awayGoals } }
    }}}""", {"slug": slug})
    time.sleep(SLEEP)

    try:
        player = raw["data"]["football"]["player"]
    except:
        return None
    if not player:
        return None

    played = [s for s in player.get("so5Scores",[]) if s.get("score",0) > 0]
    if len(played) < 2:
        return None

    # Player stats
    stats_data = q("""query P($slug: String!) { football { player(slug: $slug) {
        stats(seasonStartYear: 2025) { appearances minutesPlayed goals assists yellowCards redCards }
    }}}""", {"slug": slug})
    time.sleep(SLEEP)
    stats = {}
    try:
        stats = stats_data["data"]["football"]["player"]["stats"] or {}
    except:
        pass

    # Detailed scores (last 15) — used for AA profile AND aa2/aa5/aa10/aa15
    det_data = q("""query P($slug: String!) { football { player(slug: $slug) {
        so5Scores(last: 15) { score detailedScore { category stat statValue totalScore } }
    }}}""", {"slug": slug})
    time.sleep(SLEEP)

    scores = [s["score"] for s in played]
    club_p = player.get("activeClub",{}).get("name","") or club_name
    dom = [s["score"] for s in played if s.get("game",{}).get("homeTeam",{}).get("name")==club_p]
    ext = [s["score"] for s in played if s.get("game",{}).get("homeTeam",{}).get("name")!=club_p]
    apps = stats.get("appearances",len(played)); mins = stats.get("minutesPlayed",0) or 0
    s5 = scores[:5] if len(scores)>=5 else scores; s10 = scores[:10]; s15 = scores[:15]
    l5 = avg(scores[:5]) if len(scores)>=5 else avg(scores)
    ab60 = sum(1 for s in s15 if s>60); reg = round(ab60/len(s15)*100,0) if s15 else 0
    ab60_10 = sum(1 for s in s10 if s>60); reg10 = round(ab60_10/len(s10)*100,0) if s10 else 0

    # AA profile from detailed scores (last 15 matches)
    DEF={"won_tackle","clean_sheet_60","effective_clearance","blocked_scoring_attempt","tackle"}
    PAS={"accurate_pass","successful_final_third_passes","accurate_long_balls","long_pass_own_to_opp_success","adjusted_total_att_assist","big_chance_created"}
    POS_s={"interception_won","poss_won","duel_won","ball_recovery","won_contest"}
    ATT_s={"ontarget_scoring_att","pen_area_entries","successful_dribble","was_fouled","penalty_won"}
    # AA scores from allAroundStats (real Sorare AA = DEFENDING + ATTACKING + PASSING + POSSESSION only)
    AA_CATS = {"GENERAL", "DEFENDING", "ATTACKING", "PASSING", "POSSESSION"}
    aa_scores = []
    for m in played:
        aa_stats = m.get("allAroundStats", [])
        if aa_stats:
            aa_scores.append(sum(a.get("totalScore", 0) for a in aa_stats if a.get("category") in AA_CATS))
        else:
            aa_scores.append(0)

    # AA profile from detailedScore (category breakdown for archetype classification)
    aa_profile = {}
    try:
        det_scores = [s for s in det_data["data"]["football"]["player"]["so5Scores"] if s.get("score",0)>0]
        if det_scores:
            t={"d":[],"p":[],"po":[],"a":[],"n":[],"ftp":[]}
            for m in det_scores:
                det=m.get("detailedScore",[])
                if not det:
                    continue
                md=mp=mpo=ma=mn=mf=0
                for d in det:
                    sn,pt,v=d.get("stat",""),d.get("totalScore",0),d.get("statValue",0)
                    if sn in DEF:md+=pt
                    elif sn in PAS:mp+=pt
                    elif sn in POS_s:mpo+=pt
                    elif sn in ATT_s:ma+=pt
                    if pt<0:mn+=pt
                    if sn=="successful_final_third_passes":mf=v
                t["d"].append(md);t["p"].append(mp);t["po"].append(mpo);t["a"].append(ma);t["n"].append(mn);t["ftp"].append(mf)
            aa_profile={"aa_defending":round(avg(t["d"]),1),"aa_passing":round(avg(t["p"]),1),"aa_possession":round(avg(t["po"]),1),"aa_attacking":round(avg(t["a"]),1),"aa_negative":round(avg(t["n"]),1),"final_third_passes_avg":round(avg(t["ftp"]),1),"aa_matches_analyzed":len(t["d"])}
    except:
        pass

    # Compute aa5 from allAroundStats-based aa_scores
    aa5 = avg(aa_scores[:5]) if len(aa_scores)>=5 else avg(aa_scores) if aa_scores else 0

    # Archetype classification
    pos = player["position"]
    ga = (stats.get("goals",0)+stats.get("assists",0))/apps if apps>0 else 0
    ad=aa_profile.get("aa_defending",0);ap=aa_profile.get("aa_passing",0);at=aa_profile.get("aa_attacking",0);ao=aa_profile.get("aa_possession",0);has="aa_defending" in aa_profile
    if pos=="Goalkeeper": arch="GK"
    elif pos=="Defender":
        if has:
            ftp=aa_profile.get("final_third_passes_avg",0)
            lat=min(ftp/15*30,30)+min(at/5*20,20)+min(ap/15*15,15)
            cen=min(ad/10*30,30)+max(0,(1-ftp/10))*20+max(0,(1-at/3))*15
            arch="DEF Latéral" if lat>cen+10 else "DEF Central"
        else: arch="DEF Central"
    elif pos=="Midfielder":
        if aa5>=18: arch="MIL GOAT"
        elif has and (ad+ao>at*2) and aa5>=10 and reg>=60: arch="MIL Récup" if ad+ao>ap else "MIL Relanceur"
        elif aa5>=10 and reg>=60: arch="MIL B2B"
        elif aa5>=8 and reg>=60: arch="MIL Récup"
        elif ga>=0.2: arch="MIL Créateur"
        else: arch="MIL Rotation"
    elif pos=="Forward":
        if aa5>=12 and reg>=70: arch="ATT GOAT"
        elif aa5>=8 and reg>=60: arch="ATT Complet"
        elif aa5>=5: arch="ATT Complet"
        else: arch="ATT Finisseur"
    else: arch="?"

    mp = len(played)
    mt = len(player.get("so5Scores",[]))
    titu = round(mp/mt*100) if mt else 0

    kpis = {
        "name": player["displayName"], "slug": slug,
        "position": pos, "age": player.get("age",0),
        "club": club_p, "league": league,
        "country": player.get("country",{}).get("code",""),
        "status": "", "archetype": arch,
        "l2": round(avg(scores[:2]),1),
        "l3": round(avg(scores[:3]),1),
        "l5": round(l5,1),
        "l10": round(avg(scores[:10]),1) if len(scores)>=10 else round(avg(scores),1),
        "l15": round(avg(scores[:15]),1) if len(scores)>=15 else round(avg(scores),1),
        "last_5": [round(s,1) for s in scores[:5]],
        "last_10": [round(s,1) for s in scores[:10]],
        "aa2": round(avg(aa_scores[:2]),1),
        "aa3": round(avg(aa_scores[:3]),1),
        "aa5": round(aa5,1),
        "aa10": round(avg(aa_scores[:10]),1) if len(aa_scores)>=10 else round(avg(aa_scores),1),
        "aa15": round(avg(aa_scores[:15]),1) if len(aa_scores)>=15 else round(avg(aa_scores),1),
        "aa_trend": round(avg(aa_scores[:2])-avg(aa_scores[:5]),1) if len(aa_scores)>=5 else 0,
        "early_signal": round((avg(scores[:2])-l5)/l5*100,1) if l5>0 and len(scores)>=2 else 0,
        "ds2": round(avg([s for s in scores[:2] if s>=60])/max(1,len([s for s in scores[:2] if s>=60]))*100 if any(s>=60 for s in scores[:2]) else 0,1) if scores else 0,
        "ds5": round(sum(1 for s in s5 if s>=60)/len(s5)*100,0) if s5 else 0,
        "ds15": round(sum(1 for s in s15 if s>=60)/len(s15)*100,0) if s15 else 0,
        "ds_rate": round(sum(1 for s in s15 if s>=60)/len(s15)*100,0) if s15 else 0,
        "reg10": reg10,
        "floor": round(min(s5),0) if s5 else 0,
        "ceiling": round(max(s5),0) if s5 else 0,
        "ecart_5": round(std(s5),1),
        "ecart_15": round(std(s15),1),
        "min_5": round(min(s5),1) if s5 else 0,
        "max_5": round(max(s5),1) if s5 else 0,
        "min_15": round(min(s15),1) if s15 else 0,
        "max_15": round(max(s15),1) if s15 else 0,
        "regularite": reg,
        "pct_above_60": round(ab60/len(s15)*100,0) if s15 else 0,
        "pct_below_35": round(sum(1 for s in s15 if s<35)/len(s15)*100,0) if s15 else 0,
        "avg_dom": round(avg(dom),1) if dom else round(l5,1),
        "avg_ext": round(avg(ext),1) if ext else round(l5,1),
        "delta_dom_ext": round((avg(dom) if dom else l5)-(avg(ext) if ext else l5),1),
        "matchs_dom": len(dom),
        "matchs_ext": len(ext),
        "appearances": apps,
        "goals": stats.get("goals",0) or 0,
        "assists": stats.get("assists",0) or 0,
        "yellow": stats.get("yellowCards",0) or 0,
        "red": stats.get("redCards",0) or 0,
        "mins_per_match": round(mins/apps,0) if apps else 0,
        "titu_pct": titu,
        "matchs_played": mp,
        "matchs_total": mt,
        "last_date": played[0].get("game",{}).get("date","")[:10] if played else "",
        "ga_per_match": round(ga,3),
    }
    kpis.update(aa_profile)
    return kpis


def scrape_league(league_code):
    """Scrape all players for a league."""
    slug = LEAGUE_SLUGS.get(league_code)
    if not slug:
        print(f"❌ Ligue inconnue: {league_code}")
        return

    outfile = LEAGUE_FILES[league_code]
    print(f"\n{'='*60}")
    print(f"⚽ SCRAPING {league_code} ({slug})")
    print(f"{'='*60}")

    # Load existing data if any
    existing = []
    existing_slugs = set()
    if os.path.exists(outfile):
        with open(outfile, "r", encoding="utf-8") as f:
            existing = json.load(f)
        existing_slugs = {p["slug"] for p in existing}
        print(f"📂 Base existante: {len(existing)} joueurs")

    # Fetch all clubs
    clubs = fetch_clubs(slug)
    if not clubs:
        print("❌ Aucun club trouvé")
        return

    total_new = 0
    total_updated = 0
    total_skipped = 0

    for ci, club in enumerate(clubs):
        club_name = club["name"]
        club_slug = club["slug"]
        print(f"\n🏟️  [{ci+1}/{len(clubs)}] {club_name} ({club_slug})")

        players = fetch_club_players(club_slug)
        time.sleep(CLUB_SLEEP)
        print(f"  👥 {len(players)} joueurs actifs")

        for pi, p in enumerate(players):
            pslug = p["slug"]
            pname = p["displayName"]
            print(f"  [{pi+1}/{len(players)}] {pname}...", end=" ")

            kpis = fetch_player_stats(pslug, club_name, league_code)
            if kpis is None:
                print("skip (< 2 matchs)")
                total_skipped += 1
                continue

            # Update or add
            if pslug in existing_slugs:
                # Replace existing entry
                existing = [x for x in existing if x["slug"] != pslug]
                existing.append(kpis)
                print(f"✅ updated | L5={kpis['l5']:.0f} AA5={kpis['aa5']:.0f} | {kpis['archetype']}")
                total_updated += 1
            else:
                existing.append(kpis)
                existing_slugs.add(pslug)
                print(f"🆕 new | L5={kpis['l5']:.0f} AA5={kpis['aa5']:.0f} | {kpis['archetype']}")
                total_new += 1

            # Save periodically (every 10 players)
            if (total_new + total_updated) % 10 == 0:
                with open(outfile, "w", encoding="utf-8") as f:
                    json.dump(existing, f, ensure_ascii=False, indent=2)

    # Final save
    with open(outfile, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"✅ {league_code} terminé!")
    print(f"  🆕 Nouveaux: {total_new}")
    print(f"  🔄 Mis à jour: {total_updated}")
    print(f"  ⏭️  Skippés (< 2 matchs): {total_skipped}")
    print(f"  📊 Total: {len(existing)} joueurs")
    print(f"  💾 Sauvé: {outfile}")
    print(f"{'='*60}")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "ALL"

    if target == "ALL":
        for lg in ["L1", "PL", "Liga", "Bundes"]:
            scrape_league(lg)
    elif target in LEAGUE_SLUGS:
        scrape_league(target)
    else:
        print(f"❌ Usage: python3 fetch_all_players.py [L1|PL|Liga|Bundes|ALL]")
        sys.exit(1)

    print("\n🏁 Done! Lance ensuite:")
    print("  python3 merge_data.py")
    print("  cd deglingo-scout-app && npx vite build")
