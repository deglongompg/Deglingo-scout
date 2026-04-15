#!/usr/bin/env python3
"""
fetch_player_status.py — Mise à jour rapide du vendredi matin
=============================================================
Fetch UNIQUEMENT : blessures, suspensions, score projeté Sorare.
Source : humains Sorare (coach, blessés, suspendu) — pas de calcul historique.

Durée : ~3 min pour 1450 joueurs
Workflow vendredi :
  py fetch_player_status.py
  npm run build
  [déployer]
"""
import requests, json, os, time, sys
sys.stdout.reconfigure(errors="replace")
NO_TITU = "--no-titu" in sys.argv  # Mercredi: pas de titu% (pas encore publie)
from dotenv import load_dotenv

load_dotenv()

URL      = "https://api.sorare.com/federation/graphql"
API_KEY  = os.getenv("SORARE_API_KEY", "")
HEADERS  = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "Accept": "application/json"}
if API_KEY:
    HEADERS["APIKEY"] = API_KEY

SLEEP = 0.12   # 500 req/min max Sorare

PLAYERS_IN   = "deglingo-scout-app/public/data/players.json"
STATUS_FILE  = "player_status.json"
OUT_PATHS    = [
    "deglingo-scout-app/public/data/players.json",
    "public/data/players.json",
]

Q = """query($slug: String!) {
  football {
    player(slug: $slug) {
      displayName
      activeInjuries   { active }
      activeSuspensions { active }
      nextClassicFixtureProjectedScore
      nextClassicFixturePlayingStatusOdds { starterOddsBasisPoints }
    }
  }
}"""


def fetch_status(slug):
    r = requests.post(URL, json={"query": Q, "variables": {"slug": slug}},
                      headers=HEADERS, timeout=30)
    p = ((r.json().get("data") or {}).get("football") or {}).get("player") or {}
    injured   = any(x.get("active") for x in (p.get("activeInjuries")    or []))
    suspended = any(x.get("active") for x in (p.get("activeSuspensions") or []))
    proj      = p.get("nextClassicFixtureProjectedScore")
    odds      = (p.get("nextClassicFixturePlayingStatusOdds") or {})
    bp        = odds.get("starterOddsBasisPoints")
    starter_pct = min(round(bp / 100), 90) if bp is not None else None
    # Titu% >= 10% → joueur de retour, ignorer le flag blessé/suspendu
    if starter_pct is not None and starter_pct >= 10:
        injured = False
        suspended = False
    # Blessé/suspendu sans titu% élevé → forcer à 0
    elif (injured or suspended) and starter_pct is not None:
        starter_pct = 0
    return {
        "injured":          injured,
        "suspended":        suspended,
        "sorare_proj":      round(proj, 1) if proj is not None else None,
        "sorare_starter_pct": None if NO_TITU else starter_pct,
    }


# ── LECTURE ──────────────────────────────────────────────────────────────────
print("📥 Lecture players.json...")
with open(PLAYERS_IN, encoding="utf-8") as f:
    players = json.load(f)

total = len(players)
status = {}
injured_list   = []
suspended_list = []
errors         = 0

print(f"🔄 Fetch status pour {total} joueurs (Sorare API)...\n")

for i, p in enumerate(players):
    slug = p.get("slug", "")
    if not slug:
        continue
    try:
        s = fetch_status(slug)
        status[slug] = s
        tag = " BLESSE" if s["injured"] else (" SUSPENDU" if s["suspended"] else "")
        if s["injured"]:
            injured_list.append(f"{p.get('name','?')} ({p.get('club','?')})")
        if s["suspended"]:
            suspended_list.append(f"{p.get('name','?')} ({p.get('club','?')})")
        starter = f"{s['sorare_starter_pct']}%" if s["sorare_starter_pct"] is not None else "-"
        if tag or (i+1) % 50 == 0:
            print(f"  [{i+1:4}/{total}] {p.get('name','?'):<28} proj={str(s['sorare_proj'] or '-'):>5}  start={starter:>4}{tag}")
        time.sleep(SLEEP)
    except Exception as e:
        errors += 1
        print(f"  [{i+1:4}/{total}] ERR {slug}: {e}")
        time.sleep(1)

# ── SAUVEGARDE STATUS STANDALONE ─────────────────────────────────────────────
with open(STATUS_FILE, "w", encoding="utf-8") as f:
    json.dump(status, f, ensure_ascii=False, indent=2)
print(f"\n💾 player_status.json sauvegardé ({len(status)} joueurs)")

# ── PATCH players.json ────────────────────────────────────────────────────────
for path in OUT_PATHS:
    if not os.path.exists(path):
        continue
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    patched = 0
    for p in data:
        s = status.get(p.get("slug", ""))
        if s:
            # Toujours écraser injured/suspended (toujours fiables)
            p["injured"]   = s["injured"]
            p["suspended"] = s["suspended"]
            # sorare_proj : écraser seulement si on a une valeur (ne pas effacer les données précédentes)
            if s["sorare_proj"] is not None:
                p["sorare_proj"] = s["sorare_proj"]
            else:
                p.setdefault("sorare_proj", None)
            # sorare_starter_pct : idem — conserver si l'API retourne null (deadline dépassée)
            if s["sorare_starter_pct"] is not None:
                p["sorare_starter_pct"] = s["sorare_starter_pct"]
            else:
                p.setdefault("sorare_starter_pct", None)
            patched += 1
        else:
            p.setdefault("injured",            False)
            p.setdefault("suspended",          False)
            p.setdefault("sorare_proj",        None)
            p.setdefault("sorare_starter_pct", None)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    print(f"✅ {patched} joueurs patchés → {path}")

# ── RÉSUMÉ ───────────────────────────────────────────────────────────────────
print(f"\n{'='*55}")
print(f"📊 RÉSUMÉ STATUS")
print(f"{'='*55}")
print(f"  🏥 Blessés     : {len(injured_list)}")
for n in injured_list:
    print(f"     - {n}")
print(f"  🟥 Suspendus   : {len(suspended_list)}")
for n in suspended_list:
    print(f"     - {n}")
if errors:
    print(f"  ⚠️  Erreurs     : {errors}")
print(f"{'='*55}")
print(f"\n✅ Terminé ! Lance maintenant :")
print(f"   npm run build")
print(f"   [puis déploie sur Cloudflare]")
