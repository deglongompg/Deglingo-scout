#!/usr/bin/env python3
"""debug_sorare_odds_psg_nantes.py — POC : fetch les titu% via l'API officielle Sorare

DECOUVERTE MAJEURE : le champ `footballPlayingStatusOdds` sur PlayerGameStats
expose les memes data Sorareinside que le frontend Sorare.com affiche,
MAIS scope au game_id specifique (donc marche pour mid-week, weekend, tout).

starterOddsBasisPoints = pct * 100 (ex: 4000 = 40%)

Test sur PSG-Nantes (Game UUID db595776-a88c-4846-ae43-83473161e4d1)
→ doit retrouver Neves 90%, Kvara 70%, Dembele 70%, Doue 40%, Barcola 60%, etc.
"""
import requests, json, os, sys
sys.stdout.reconfigure(errors="replace")
from dotenv import load_dotenv
load_dotenv()

URL     = "https://api.sorare.com/federation/graphql"
API_KEY = os.getenv("SORARE_API_KEY", "")
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
if API_KEY:
    HEADERS["APIKEY"] = API_KEY
    print("🔑 SORARE_API_KEY active")
else:
    print("⚠️  SORARE_API_KEY absente — risque de rate limit")

# Test avec et sans prefixe "Game:" — le Payload live DevTools envoie l'UUID brut
UUID_RAW = "db595776-a88c-4846-ae43-83473161e4d1"  # PSG vs Nantes 2026-04-22
GAME_ID_CANDIDATES = [UUID_RAW, f"Game:{UUID_RAW}"]
GAME_ID = GAME_ID_CANDIDATES[0]  # override si le 1er echoue, voir boucle en bas

# Query basee sur la structure observee dans DevTools Network > Preview
QUERY = """
query GameLineupOdds($id: ID!) {
  football {
    game(id: $id) {
      id
      date
      statusTyped
      homeTeam { ... on Club { slug code name } }
      awayTeam { ... on Club { slug code name } }
      playerGameScores {
        anyPlayer {
          slug
          displayName
        }
        anyPlayerGameStats {
          anyTeam { ... on Club { slug code } }
          fieldStatus
          footballPlayingStatusOdds {
            starterOddsBasisPoints
            reliability
            providerIconUrl
          }
        }
      }
    }
  }
}
"""

print(f"\n📡 POST {URL}")
body = None
game = None
for gid in GAME_ID_CANDIDATES:
    print(f"   essai: id = {gid!r}")
    r = requests.post(URL, json={"query": QUERY, "variables": {"id": gid}},
                      headers=HEADERS, timeout=30)
    print(f"   HTTP {r.status_code}")
    body = r.json()
    if "errors" in body:
        print(f"   ⚠️  erreurs: {[e.get('message') for e in body['errors']][:3]}")
        continue
    game = body.get("data", {}).get("football", {}).get("game")
    if game:
        print(f"   ✅ match trouve avec id={gid!r}\n")
        break

if not game:
    print("\n❌ Aucune des 2 formes d'ID n'a marche. Dump :")
    print(json.dumps(body, ensure_ascii=False, indent=2)[:1500])
    with open("/tmp/sorare_psg_nantes_errors.json", "w") as f:
        json.dump(body, f, ensure_ascii=False, indent=2)
    sys.exit(1)

print(f"\n✅ Game trouve :")
print(f"   {game['homeTeam']['name']} vs {game['awayTeam']['name']}")
print(f"   {game['date']}  status={game.get('statusTyped')}")
print(f"   {len(game.get('playerGameScores', []) or [])} joueurs dans playerGameScores")

# Sauvegarde raw pour inspection
with open("/tmp/sorare_psg_nantes_raw.json", "w", encoding="utf-8") as f:
    json.dump(body, f, ensure_ascii=False, indent=2)
print(f"   💾 raw -> /tmp/sorare_psg_nantes_raw.json")

# Extract titu% par joueur
print(f"\n{'─'*68}")
print(f"{'Joueur':<30} {'Club':<18} {'Titu%':>6} {'Rel':>7} {'Field':>10}")
print(f"{'─'*68}")

rows = []
for pgs in (game.get("playerGameScores") or []):
    player = (pgs.get("anyPlayer") or {})
    stats  = (pgs.get("anyPlayerGameStats") or {})
    team   = (stats.get("anyTeam") or {})
    odds   = (stats.get("footballPlayingStatusOdds") or {})
    basis  = odds.get("starterOddsBasisPoints")
    pct    = (basis / 100) if basis is not None else None
    rows.append({
        "slug": player.get("slug"),
        "name": player.get("displayName"),
        "team_code": team.get("code"),
        "team_slug": team.get("slug"),
        "titu_pct": pct,
        "reliability": odds.get("reliability"),
        "field_status": stats.get("fieldStatus"),
    })

# Tri par équipe puis titu% decroissant
rows.sort(key=lambda x: (x["team_code"] or "", -(x["titu_pct"] or -1)))
for r_ in rows:
    pct_s = f"{r_['titu_pct']:>5.0f}%" if r_['titu_pct'] is not None else "  -  "
    print(f"{(r_['name'] or '?'):<30} {(r_['team_code'] or ''):<18} {pct_s:>6} {(r_['reliability'] or ''):>7} {(r_['field_status'] or ''):>10}")

# Check valeurs attendues (depuis les 2 screenshots PSG + Nantes)
print(f"\n{'─'*68}")
print("VALIDATION vs screenshots sorareinside/sorare :")
expected = {
    "joao-neves":        90,
    "warren-zaire-emery": 90,
    "lucas-hernandez":   90,
    "khvicha-kvaratskhelia": 70,
    "ousmane-dembele":    70,
    "willian-pacho":      70,
    "achraf-hakimi":      70,
    "fabian-ruiz-pena":   70,  # ou fabian-ruiz
    "marquinhos":         70,
    "bradley-barcola":    60,
    "lucas-chevalier":    60,
    "desire-doue":        40,
    "mohamed-kaba":       60,
    "matthis-abline":     80,
    "anthony-lopes":      90,
}
got = {r_["slug"]: r_["titu_pct"] for r_ in rows}
for slug, exp in expected.items():
    actual = got.get(slug)
    ok = "✅" if actual == exp else ("❌" if actual is not None else "❓")
    if slug not in got:
        # Try fuzzy (fabian-ruiz vs fabian-ruiz-pena)
        fuzzy = [s for s in got if slug.split("-")[0] in s and (slug.split("-")[1] in s if "-" in slug else True)]
        if fuzzy:
            actual = got[fuzzy[0]]
            ok = "✅" if actual == exp else "❌"
            print(f"  {ok} {slug:<28} attendu={exp}% got={actual}% (matche: {fuzzy[0]})")
            continue
    print(f"  {ok} {slug:<28} attendu={exp}% got={actual}%")

print("\n✅ Fin du POC\n")
