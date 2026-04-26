#!/usr/bin/env python3
"""
build_club_aliases.py — Construit club_aliases.json (football-data -> Sorare canonical)
=======================================================================================
Compare les noms de clubs dans fixtures.json (home_api/away_api venant de football-data API)
aux noms canoniques Sorare (cles de sorare_club_slugs.json = noms exacts dans players.json).
Sauve le mapping dans club_aliases.json — utilise par fetch_fixtures.py pour normaliser
les noms a l'ecriture.

A relancer quand :
  - un nouveau club est promu / relegue
  - tu vois "club inconnu" dans les logs ou un joueur qui n'apparait pas dans Stellar
  - apres un fetch_all_players.py qui a peut-etre ajoute de nouveaux clubs

Le mapping est ensuite committe au repo.
"""
import json, sys, unicodedata, re
from difflib import SequenceMatcher

sys.stdout.reconfigure(errors="replace")

ROOT = "."
PATH_SORARE_SLUGS = f"{ROOT}/sorare_club_slugs.json"
PATH_FIXTURES = f"{ROOT}/deglingo-scout-app/public/data/fixtures.json"
PATH_OUT = f"{ROOT}/club_aliases.json"

# Overrides manuels (cas que la similarity rate a moins de 0.7 mais qu'on connait)
# Format : nom_football_data -> nom_canonique_Sorare
MANUAL_OVERRIDES = {
    "Lille OSC": "LOSC Lille",
    "Racing Club de Lens": "RC Lens",
    "Deportivo Alavés": "D. Alavés",
    "Real Betis Balompié": "Real Betis",
}

# Ligues qu'on couvre (les autres = UCL/UEL/UECL avec adversaires etrangers, ignore)
SCOPE_LEAGUES = ["L1", "PL", "Liga", "Bundes", "MLS"]

THRESHOLD = 0.70  # similarity ratio min pour auto-match


def norm(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", s.lower())


def main():
    with open(PATH_SORARE_SLUGS, encoding="utf-8") as f:
        sorare_clubs = set(json.load(f).keys())
    with open(PATH_FIXTURES, encoding="utf-8") as f:
        fixtures = json.load(f).get("fixtures", [])

    # Collecte tous les noms api distincts par ligue
    fx_names = set()
    for f in fixtures:
        if f.get("league") not in SCOPE_LEAGUES:
            continue
        for k in ("home_api", "away_api"):
            n = f.get(k, "")
            if n:
                fx_names.add(n)

    print(f"[build_club_aliases] {len(sorare_clubs)} clubs canoniques Sorare")
    print(f"[build_club_aliases] {len(fx_names)} noms distincts dans fixtures.json (scope {SCOPE_LEAGUES})")

    aliases = {}
    unmatched = []
    for n in sorted(fx_names):
        if n in sorare_clubs:
            continue  # deja canonique, pas besoin d'alias
        if n in MANUAL_OVERRIDES:
            aliases[n] = MANUAL_OVERRIDES[n]
            continue
        # Auto-match par norm equality
        nn = norm(n)
        cand = [c for c in sorare_clubs if norm(c) == nn]
        if cand:
            aliases[n] = cand[0]
            continue
        # Fuzzy similarity
        best, best_r = None, 0
        for sc in sorare_clubs:
            r = SequenceMatcher(None, nn, norm(sc)).ratio()
            if r > best_r:
                best_r = r
                best = sc
        if best_r >= THRESHOLD:
            aliases[n] = best
        else:
            unmatched.append((n, best, best_r))

    print()
    print(f"[build_club_aliases] {len(aliases)} aliases generes :")
    for k, v in sorted(aliases.items()):
        print(f"  {k!r:42} -> {v!r}")
    if unmatched:
        print()
        print(f"[build_club_aliases] {len(unmatched)} non resolus (probablement clubs Concacaf/etrangers):")
        for n, best, r in unmatched:
            print(f"  {n!r:42} ?? best={best!r} ({r:.2f})")
        print("[build_club_aliases] Si un de ces clubs DEVRAIT etre dans Sorare players.json, ajoute-le a MANUAL_OVERRIDES en haut du script.")

    with open(PATH_OUT, "w", encoding="utf-8") as f:
        json.dump(aliases, f, ensure_ascii=False, indent=2, sort_keys=True)
    print()
    print(f"[build_club_aliases] OK -> {PATH_OUT}")


if __name__ == "__main__":
    main()
