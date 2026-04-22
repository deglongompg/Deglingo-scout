#!/usr/bin/env python3
"""debug_games_v2.py — structure nested region->competition->games enfin comprise !
Trouve PSG-Nantes + teste endpoints lineups par game_id
"""
import requests, json, os
from dotenv import load_dotenv
load_dotenv()

EMAIL    = "damien.gheza@gmail.com"
PASSWORD = os.getenv("SORAREINSIDE_PASSWORD", "")
PLATFORM_API = "https://platform-api.sorareinside.com"

session = requests.Session()
session.headers.update({
    "Origin": "https://sorareinside.com",
    "Referer": "https://sorareinside.com/",
    "User-Agent": "Mozilla/5.0",
    "Content-Type": "application/json",
})
r = session.post(f"{PLATFORM_API}/auth/login",
                 json={"email": EMAIL, "password": PASSWORD}, timeout=30)
print(f"Login: {r.status_code}\n")

GW = "football-21-24-apr-2026"

# Competitions des 5 ligues principales
TARGET_COMP_SLUGS = {"ligue-1-fr", "premier-league-gb-eng", "la-liga-es",
                     "bundesliga-de", "mls-us"}

# ═══════════════════════════════════════════════════════════════════════════
# 1) Fetch games + parse structure nested
# ═══════════════════════════════════════════════════════════════════════════
print("="*80)
print(f"1) /games?gameweek_slug={GW} — parsing nested")
print("="*80)
r = session.get(f"{PLATFORM_API}/games", params={"gameweek_slug": GW, "limit": 100}, timeout=30)
body = r.json()
regions = body if isinstance(body, list) else []
print(f"  {len(regions)} regions retournees\n")

# Parse nested
all_games = []  # liste de (comp_slug, comp_name, game)
for region in regions:
    region_name = region.get("regionName", "?")
    for comp in (region.get("competitions") or []):
        comp_slug = (comp.get("slug") or "").lower()
        comp_name = comp.get("name", "?")
        # Sorareinside parfois met le slug dans comp.slug ou comp.games[0].competition.slug
        for g in (comp.get("games") or []):
            # Essaie d'avoir le slug via nested
            game_comp_slug = ((g.get("competition") or {}).get("slug") or "").lower() or comp_slug
            all_games.append((game_comp_slug, comp_name, g))

print(f"  {len(all_games)} games total\n")
# Groupe par competition
from collections import Counter
comps_count = Counter(cs for cs, _, _ in all_games)
print("  Competitions presentes :")
for cs, n in comps_count.most_common():
    target = "⭐" if cs in TARGET_COMP_SLUGS else "  "
    print(f"    {target} {cs:<40} : {n} games")

# ═══════════════════════════════════════════════════════════════════════════
# 2) Liste TOUS les games des 5 ligues cibles
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'='*80}")
print("2) Games des 5 ligues cibles")
print("="*80)
target_games = [(cs, cn, g) for cs, cn, g in all_games if cs in TARGET_COMP_SLUGS]
print(f"  {len(target_games)} games ciblés\n")
psg_nantes_game = None
for cs, cn, g in target_games:
    ht = g.get("homeTeam", {}) or {}
    at = g.get("awayTeam", {}) or {}
    ht_slug = (ht.get("slug") or "").lower()
    at_slug = (at.get("slug") or "").lower()
    gid = g.get("id", "?")
    date = g.get("date", "?")
    print(f"    [{cs}] {ht.get('name','?')} (slug={ht_slug}) vs {at.get('name','?')} (slug={at_slug}) @ {date}")
    print(f"        game_id = {gid}")
    if ("paris" in ht_slug or "paris" in at_slug) and ("nantes" in ht_slug or "nantes" in at_slug):
        psg_nantes_game = g

if not psg_nantes_game:
    print("\n  ⚠️  PSG-Nantes pas trouve dans les games L1 du GW mid-week")
    print("      Peut-etre dans la GW weekend ?")
else:
    print(f"\n  ✅ PSG-Nantes identifie !")
    print(f"     game_id: {psg_nantes_game.get('id')}")

# ═══════════════════════════════════════════════════════════════════════════
# 3) Test /lineups?game_id=X pour PSG-Nantes (si trouve)
# ═══════════════════════════════════════════════════════════════════════════
if psg_nantes_game:
    gid = psg_nantes_game.get("id")
    print(f"\n{'='*80}")
    print(f"3) Test /lineups avec game_id={gid}")
    print("="*80)
    # Essaye avec et sans le prefixe "Game:"
    gid_clean = gid.replace("Game:", "") if isinstance(gid, str) else gid
    for params in [
        {"game_id": gid, "limit": 50},
        {"game_id": gid_clean, "limit": 50},
        {"gameweek_slug": GW, "game_id": gid, "limit": 50},
        {"gameweek_slug": GW, "game_id": gid_clean, "limit": 50},
        {"game_ids": gid, "limit": 50},
        {"game_ids": gid_clean, "limit": 50},
    ]:
        r = session.get(f"{PLATFORM_API}/lineups", params=params, timeout=20)
        count = "?"
        if r.status_code == 200:
            body = r.json()
            if isinstance(body, dict):
                count = body.get("count", len(body.get("lineups", [])))
                lineups = body.get("lineups", [])
            elif isinstance(body, list):
                count = len(body)
                lineups = body
            else:
                lineups = []
            if count and count != "?" and int(count) > 0:
                teams = set(l.get("team_slug") for l in lineups)
                print(f"  ✅ params={params}")
                print(f"      count={count}, teams={teams}")
                # Dump 1 lineup
                if lineups:
                    lid = lineups[0].get("id")
                    print(f"      1er lineup : id={lid} team={lineups[0].get('team_slug')} formation={lineups[0].get('formation')}")
                    # Test extraire les players de cette lineup
                    print(f"\n      --- Endpoints pour players de lineup={lid} ---")
                    for ep_params in [
                        (f"/lineups/linedup-players", {"lineup_id": lid, "limit": 50}),
                        (f"/lineups/linedup-players", {"lineup_ids": lid, "limit": 50}),
                        (f"/lineups/linedup-players", {"lineupId": lid, "limit": 50}),
                        (f"/lineups/{lid}/linedup-players", {}),
                        (f"/lineups/{lid}/players", {}),
                    ]:
                        ep, ep_p = ep_params
                        r2 = session.get(f"{PLATFORM_API}{ep}", params=ep_p, timeout=15)
                        if r2.status_code == 200:
                            body2 = r2.json()
                            if isinstance(body2, list):
                                items = body2
                            elif isinstance(body2, dict):
                                items = body2.get("linedUpPlayers") or body2.get("data") or body2.get("players") or []
                            else:
                                items = []
                            n = len(items) if isinstance(items, list) else "?"
                            slugs = set()
                            if isinstance(items, list):
                                for it in items:
                                    if isinstance(it, dict):
                                        p = it.get("players") or it.get("player") or {}
                                        if isinstance(p, dict):
                                            s = p.get("slug")
                                            if s: slugs.add(s)
                            print(f"        ✅ 200 {ep} params={ep_p}")
                            print(f"           n={n}, {len(slugs)} slugs uniques: {list(slugs)[:10]}")
                break  # stop au premier params qui marche
            else:
                print(f"  ⚠️  params={params} -> count={count} (vide)")
        else:
            pass  # silencieux sur les 404

print("\n✅ Fin du probe")
