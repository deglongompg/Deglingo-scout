#!/usr/bin/env python3
"""
fetch_player_status.py — MAJ flash titu% + blessures + projection Sorare
=========================================================================
Batch GraphQL : 20 joueurs par requete avec alias -> 3500 joueurs en ~25s
(vs 7 min sans batch).

Source : API Sorare (coach, blessures, suspensions, titu%).
Duree : ~25-30 sec pour 3500 joueurs (175 batchs @ 0.12s sleep)

Usage :
  py fetch_player_status.py              # avec titu%
  py fetch_player_status.py --no-titu    # mercredi (titu pas encore publie)
  py fetch_player_status.py --batch 30   # taille de batch custom
"""
import requests, json, os, time, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
sys.stdout.reconfigure(errors="replace")
NO_TITU = "--no-titu" in sys.argv  # Mercredi: pas de titu% (pas encore publie)

# CLI : --batch N (default 50) et --workers N (default 4, parallele)
BATCH_SIZE = 50
if "--batch" in sys.argv:
    try:
        BATCH_SIZE = int(sys.argv[sys.argv.index("--batch") + 1])
    except (IndexError, ValueError):
        pass
WORKERS = 4
if "--workers" in sys.argv:
    try:
        WORKERS = int(sys.argv[sys.argv.index("--workers") + 1])
    except (IndexError, ValueError):
        pass

from dotenv import load_dotenv

load_dotenv()

URL      = "https://api.sorare.com/federation/graphql"
API_KEY  = os.getenv("SORARE_API_KEY", "")
HEADERS  = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "Accept": "application/json"}
if API_KEY:
    HEADERS["APIKEY"] = API_KEY
    print(f"🔑 API key Sorare detectee -> complexity max 30000 (batch jusqu'a ~3000 OK)")
else:
    print(f"⚠️  Pas d'API key Sorare (ajoute SORARE_API_KEY=... dans .env) -> complexity max 500")
    if BATCH_SIZE > 50:
        print(f"   BATCH_SIZE ({BATCH_SIZE}) reduit a 50 pour rester sous la limite.")
        BATCH_SIZE = 50

SLEEP = 0.05   # Entre 2 batchs. Limite Sorare = 600 req/min = 10 req/s, avec 4 workers on reste sous le plafond

PLAYERS_IN   = "deglingo-scout-app/public/data/players.json"
STATUS_FILE  = "player_status.json"
OUT_PATHS    = [
    "deglingo-scout-app/public/data/players.json",
    "public/data/players.json",
]


FRAGMENT = """{
      displayName
      activeInjuries   { active }
      activeSuspensions { active }
      nextClassicFixtureProjectedScore
      nextClassicFixturePlayingStatusOdds { starterOddsBasisPoints }
    }"""


def build_batch_query(slugs):
    """Construit une query GraphQL avec des alias p0, p1, p2, ... pour tous les slugs du batch."""
    parts = []
    for i, slug in enumerate(slugs):
        # json.dumps pour escape propre (slugs contiennent parfois apostrophes, accents dans rares cas)
        parts.append(f'      p{i}: player(slug: {json.dumps(slug)}) {FRAGMENT}')
    return "query {\n  football {\n" + "\n".join(parts) + "\n  }\n}"


def parse_player_data(p):
    """Parse la reponse player -> dict avec injured/suspended/proj/starter_pct."""
    if not p:
        return None
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


def fetch_batch(slugs):
    """Fetch un batch de slugs en une seule requete. Retourne {slug: status_dict}."""
    q = build_batch_query(slugs)
    r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=60)
    r.raise_for_status()
    body = r.json()
    if "errors" in body:
        # Log les erreurs mais continue avec ce qu'on a
        print(f"  ⚠️  GraphQL errors (batch): {str(body['errors'])[:200]}")
    data = (body.get("data") or {}).get("football") or {}
    out = {}
    for i, slug in enumerate(slugs):
        p = data.get(f"p{i}")
        out[slug] = parse_player_data(p)
    return out


# ── LECTURE ──────────────────────────────────────────────────────────────────
print("📥 Lecture players.json...")
with open(PLAYERS_IN, encoding="utf-8") as f:
    players = json.load(f)

total = len(players)
status = {}
injured_list   = []
suspended_list = []
errors         = 0

# Build liste de slugs + decoupe en batchs
slug_to_player = {p["slug"]: p for p in players if p.get("slug")}
all_slugs = list(slug_to_player.keys())
batches = [all_slugs[i:i + BATCH_SIZE] for i in range(0, len(all_slugs), BATCH_SIZE)]

print(f"🔄 Fetch status pour {total} joueurs (Sorare API)")
print(f"   Batch size : {BATCH_SIZE} players/requete")
print(f"   Workers    : {WORKERS} requetes en parallele")
print(f"   Total      : {len(batches)} batchs a fetcher")
print(f"   Estimation : ~{len(batches) * 0.35 / WORKERS:.0f}s si 350ms/requete\n")

t_start = time.time()
done = 0

def process_batch(batch_slugs):
    try:
        return batch_slugs, fetch_batch(batch_slugs), None
    except Exception as e:
        return batch_slugs, {}, str(e)

with ThreadPoolExecutor(max_workers=WORKERS) as executor:
    futures = {}
    # Submit avec un petit delai entre soumissions pour lisser le burst initial
    for batch in batches:
        futures[executor.submit(process_batch, batch)] = batch
        time.sleep(SLEEP)

    for future in as_completed(futures):
        batch_slugs, batch_result, err = future.result()
        done += 1
        if err:
            errors += 1
            print(f"  [batch {done:3}/{len(batches)}] ERR: {err[:100]}")
            continue
        for slug, s in batch_result.items():
            if s is None:
                continue
            status[slug] = s
            p = slug_to_player.get(slug) or {}
            if s["injured"]:
                injured_list.append(f"{p.get('name','?')} ({p.get('club','?')})")
            if s["suspended"]:
                suspended_list.append(f"{p.get('name','?')} ({p.get('club','?')})")
        # Log periodique
        if done % max(1, len(batches) // 10) == 0 or done == len(batches):
            elapsed = time.time() - t_start
            rate = (done * BATCH_SIZE) / max(0.1, elapsed)
            print(f"  [batch {done:3}/{len(batches)}] {len(status):4} players fetches · {elapsed:.1f}s · {rate:.0f} players/s")

elapsed_total = time.time() - t_start
print(f"\n⏱  Fetch termine en {elapsed_total:.1f}s ({len(status)}/{total} joueurs recus)")

# Securite : si < 80% des joueurs recus, probable echec massif (complexity limit, rate limit...)
# On s'arrete la sans patcher players.json pour ne pas polluer avec des valeurs par defaut.
if len(status) < total * 0.8:
    print(f"\n❌ ECHEC : seulement {len(status)}/{total} joueurs recus (<80%).")
    print(f"   Cause probable : GraphQL complexity limit depasse ou rate limit Sorare.")
    print(f"   Reduis BATCH_SIZE ou ajoute SORARE_API_KEY dans .env.")
    print(f"   players.json N'EST PAS modifie. Re-run avec --batch 50 par defaut.")
    sys.exit(1)

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
