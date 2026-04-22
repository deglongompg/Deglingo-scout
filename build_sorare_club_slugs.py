#!/usr/bin/env python3
"""
build_sorare_club_slugs.py — Construit le mapping club → slug Sorare officiel
=============================================================================
Pour chaque club distinct de players.json, on echantillonne 1 joueur et on
interroge `player.activeClub.slug` — ce qui nous donne le slug exact que
l'API Sorare attend dans `club(slug: ...)`.

Resultat sauve dans `sorare_club_slugs.json` :
  {
    "Paris Saint-Germain":   "psg-paris",
    "Real Madrid CF":        "real-madrid",
    "FC Barcelona":          "fc-barcelona",
    ...
  }

Ce fichier est committe au repo. A relancer quand :
  - un nouveau club est promu en L1/PL/Liga/Bundes
  - Sorare change un slug (rare)
  - on voit "club inconnu" dans les logs de fetch_titu_fast

Usage :
  python3 build_sorare_club_slugs.py
  python3 build_sorare_club_slugs.py --verbose
"""
import json, os, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
sys.stdout.reconfigure(errors="replace")
from dotenv import load_dotenv

load_dotenv()

URL     = "https://api.sorare.com/federation/graphql"
API_KEY = os.getenv("SORARE_API_KEY", "")
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
if API_KEY:
    HEADERS["APIKEY"] = API_KEY
    print("🔑 API key Sorare active")

PLAYERS_IN = "deglingo-scout-app/public/data/players.json"
OUT_PATH   = "sorare_club_slugs.json"
VERBOSE    = "--verbose" in sys.argv

WORKERS    = 8


def gql(query, variables=None, retries=3, timeout=20):
    last_err = None
    for attempt in range(retries):
        try:
            r = requests.post(URL, json={"query": query, "variables": variables or {}},
                              headers=HEADERS, timeout=timeout)
            return r.json()
        except Exception as e:
            last_err = e
            time.sleep(0.5 * (attempt + 1))
    return {"errors": [{"message": f"net: {last_err}"}]}


Q = """
query($s: String!) {
  football {
    player(slug: $s) {
      activeClub {
        slug
        name
      }
    }
  }
}
"""


def main():
    # 1. Liste unique des clubs de players.json avec 1 joueur sample par club
    with open(PLAYERS_IN, encoding="utf-8") as f:
        players = json.load(f)

    club_to_slug_sample = {}  # club name -> player slug (1 par club)
    for p in players:
        c = p.get("club")
        if not c: continue
        if c not in club_to_slug_sample and p.get("slug"):
            club_to_slug_sample[c] = p["slug"]

    print(f"📊 {len(club_to_slug_sample)} clubs distincts a resoudre")

    # 2. Fetch activeClub.slug en parallele (1 req par club)
    def fetch_one(club_name, sample_slug):
        body = gql(Q, {"s": sample_slug})
        if "errors" in body:
            return club_name, None, (body["errors"][0].get("message") or "?")[:100]
        player = ((body.get("data") or {}).get("football") or {}).get("player") or {}
        active_club = player.get("activeClub") or {}
        return club_name, active_club.get("slug"), None

    club_to_slug = {}
    errors = []
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(fetch_one, c, s): c for c, s in club_to_slug_sample.items()}
        for i, fut in enumerate(as_completed(futs), 1):
            club, slug, err = fut.result()
            if err:
                errors.append((club, err))
                if VERBOSE: print(f"  ❌ {club:<40} : {err}")
            elif slug:
                club_to_slug[club] = slug
                if VERBOSE: print(f"  ✅ {club:<40} → {slug}")

    print(f"\n✅ {len(club_to_slug)} slugs resolved")
    if errors:
        print(f"⚠️  {len(errors)} erreurs :")
        for c, e in errors[:10]: print(f"   - {c}: {e}")

    # 3. Save
    ordered = dict(sorted(club_to_slug.items()))
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(ordered, f, ensure_ascii=False, indent=2)
    print(f"\n💾 {OUT_PATH} ecrit ({len(ordered)} entries)")

    # 4. Sample output
    print("\nExemples :")
    for c, s in list(ordered.items())[:10]:
        print(f"  {c:<40} → {s}")


if __name__ == "__main__":
    main()
