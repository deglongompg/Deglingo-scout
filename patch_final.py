# patch_final.py
# Dernier patch avec les bons slugs
# Lance: python3 patch_final.py

import requests, json, time, math

URL = "https://api.sorare.com/federation/graphql"
H = {"Content-Type": "application/json"}
SLEEP = 1.5

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

def fetch_player(slug):
    print(f"  {slug}...", end=" ")
    raw = q("""query P($slug: String!) { football { player(slug: $slug) {
        displayName position age country { code } activeClub { name }
        so5Scores(last: 15) { score game { date homeTeam { name } awayTeam { name } homeGoals awayGoals } }
    }}}""", {"slug": slug})
    time.sleep(SLEEP)
    try: player = raw["data"]["football"]["player"]
    except: print("❌ failed"); return None
    if not player: print("❌ null"); return None
    played = [s for s in player.get("so5Scores",[]) if s.get("score",0) > 0]
    if len(played) < 2: print(f"skip ({len(played)} matchs)"); return None

    aa_data = q("""query P($slug: String!) { football { player(slug: $slug) {
        so5Scores(last: 15) { score allAroundStats { totalScore } }
    }}}""", {"slug": slug})
    time.sleep(SLEEP)
    aa_scores = []
    try:
        for s in [x for x in aa_data["data"]["football"]["player"]["so5Scores"] if x.get("score",0)>0]:
            aa_list = s.get("allAroundStats", [])
            aa_scores.append(sum(item.get("totalScore",0) for item in aa_list) if isinstance(aa_list, list) else 0)
    except: pass

    stats_data = q("""query P($slug: String!) { football { player(slug: $slug) {
        stats(seasonStartYear: 2025) { appearances goals assists yellowCards redCards minutesPlayed }
    }}}""", {"slug": slug})
    time.sleep(SLEEP)
    stats = {}
    try: stats = stats_data["data"]["football"]["player"]["stats"] or {}
    except: pass

    det_data = q("""query P($slug: String!) { football { player(slug: $slug) {
        so5Scores(last: 5) { score detailedScore { category stat statValue totalScore } }
    }}}""", {"slug": slug})
    time.sleep(SLEEP)

    scores = [s["score"] for s in played]
    while len(aa_scores) < len(scores): aa_scores.append(0)
    club_p = player.get("activeClub",{}).get("name","")
    dom = [s["score"] for s in played if s.get("game",{}).get("homeTeam",{}).get("name")==club_p]
    ext = [s["score"] for s in played if s.get("game",{}).get("homeTeam",{}).get("name")!=club_p]
    apps = stats.get("appearances",len(played)); mins = stats.get("minutesPlayed",0) or 0
    s5 = scores[:5] if len(scores)>=5 else scores; s10 = scores[:10]; s15 = scores[:15]
    l5 = avg(scores[:5]) if len(scores)>=5 else avg(scores)
    aa5 = avg(aa_scores[:5]) if len(aa_scores)>=5 else avg(aa_scores)
    ab60 = sum(1 for s in s15 if s>60); reg = round(ab60/len(s15)*100,0) if s15 else 0
    ab60_10 = sum(1 for s in s10 if s>60); reg10 = round(ab60_10/len(s10)*100,0) if s10 else 0
    ds_above_10 = sum(1 for s in s10 if s>=75); ds10 = round(ds_above_10/len(s10)*100,0) if s10 else 0

    DEF={"won_tackle","clean_sheet_60","effective_clearance","blocked_scoring_attempt","tackle"}
    PAS={"accurate_pass","successful_final_third_passes","accurate_long_balls","long_pass_own_to_opp_success","adjusted_total_att_assist","big_chance_created"}
    POS={"interception_won","poss_won","duel_won","ball_recovery","won_contest"}
    ATT_s={"ontarget_scoring_att","pen_area_entries","successful_dribble","was_fouled","penalty_won"}
    aa_profile = {}
    try:
        det_scores = [s for s in det_data["data"]["football"]["player"]["so5Scores"] if s.get("score",0)>0]
        if det_scores:
            t={"d":[],"p":[],"po":[],"a":[],"n":[],"ftp":[]}
            for m in det_scores:
                det=m.get("detailedScore",[])
                if not det: continue
                md=mp=mpo=ma=mn=mf=0
                for d in det:
                    sn,pt,v=d.get("stat",""),d.get("totalScore",0),d.get("statValue",0)
                    if sn in DEF:md+=pt
                    elif sn in PAS:mp+=pt
                    elif sn in POS:mpo+=pt
                    elif sn in ATT_s:ma+=pt
                    if pt<0:mn+=pt
                    if sn=="successful_final_third_passes":mf=v
                t["d"].append(md);t["p"].append(mp);t["po"].append(mpo);t["a"].append(ma);t["n"].append(mn);t["ftp"].append(mf)
            aa_profile={"aa_defending":round(avg(t["d"]),1),"aa_passing":round(avg(t["p"]),1),"aa_possession":round(avg(t["po"]),1),"aa_attacking":round(avg(t["a"]),1),"aa_negative":round(avg(t["n"]),1),"final_third_passes_avg":round(avg(t["ftp"]),1),"aa_matches_analyzed":len(t["d"])}
    except: pass

    pos=player["position"];ga=(stats.get("goals",0)+stats.get("assists",0))/apps if apps>0 else 0
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

    kpis = {"name":player["displayName"],"slug":slug,"position":pos,"age":player.get("age",0),
        "club":club_p,"league":"Ligue 1","country":player.get("country",{}).get("code",""),
        "status":"","archetype":arch,
        "l2":round(avg(scores[:2]),1),"l3":round(avg(scores[:3]),1),"l5":round(l5,1),
        "l10":round(avg(scores[:10]),1) if len(scores)>=10 else round(avg(scores),1),
        "l15":round(avg(scores[:15]),1) if len(scores)>=15 else round(avg(scores),1),
        "last_5":[round(s,1) for s in scores[:5]],
        "last_10":[round(s,1) for s in scores[:10]],
        "reg10":reg10,"ds10":ds10,
        "aa2":round(avg(aa_scores[:2]),1),"aa5":round(aa5,1),
        "aa10":round(avg(aa_scores[:10]),1) if len(aa_scores)>=10 else round(avg(aa_scores),1),
        "ds_rate":0,"floor":round(min(s5),0),"ceiling":round(max(s5),0),
        "ecart_5":round(std(s5),1),"ecart_15":round(std(s15),1),
        "regularite":reg,"pct_above_60":round(ab60/len(s15)*100,0) if s15 else 0,
        "avg_dom":round(avg(dom),1) if dom else round(l5,1),
        "avg_ext":round(avg(ext),1) if ext else round(l5,1),
        "appearances":apps,"goals":stats.get("goals",0) or 0,"assists":stats.get("assists",0) or 0,
        "yellow":stats.get("yellowCards",0) or 0,"red":stats.get("redCards",0) or 0,
        "mins_per_match":round(mins/apps,0) if apps else 0,
        "matchs_played":len(played),"matchs_total":len(player.get("so5Scores",[])),}
    kpis.update(aa_profile)
    print(f"✅ {player['displayName']} | {club_p} | {pos} | L5={l5:.0f} AA5={aa5:.0f} | {arch}")
    return kpis

with open("deglingo_ligue1_final.json", "r", encoding="utf-8") as f:
    existing = json.load(f)
existing_slugs = set(p.get("slug","") for p in existing)
print(f"📂 Base: {len(existing)} joueurs\n")

MISSING = [
    "william-joel-pacho-tenorio",   # Pacho PSG
    "lucas-hernandez-pi",           # Hernandez PSG
    "marcos-aoas-correa",           # Marquinhos PSG
    "lucas-lopes-beraldo",          # Beraldo PSG
    "nathan-ngoy",                  # Ngoy Lille
    "quinten-maduro",               # Timber OM (slug = maduro!)
    "ethan-chidiebere-nwaneri",     # Nwaneri OM (vérifier si déjà là)
]

new_count = 0
for slug in MISSING:
    if slug in existing_slugs:
        name = next((p["name"] for p in existing if p.get("slug","") == slug), slug)
        print(f"  ✓ {slug} → {name} déjà OK")
        continue
    kpis = fetch_player(slug)
    if kpis:
        existing.append(kpis)
        existing_slugs.add(slug)
        new_count += 1

print(f"\n{'='*60}")
print(f"📊 Nouveaux: {new_count}")
print(f"📊 Total: {len(existing)}")

with open("deglingo_ligue1_final.json", "w", encoding="utf-8") as f:
    json.dump(existing, f, ensure_ascii=False, indent=2)
print(f"💾 Sauvé!")

from collections import Counter
for c, n in sorted(Counter(p["club"] for p in existing).items()):
    print(f"  {c:30s}: {n}")
