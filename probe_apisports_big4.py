"""Probe API-Football : noms Big-4 + UCL/UEL/UECL pour preparer aliases."""
import requests, os, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from dotenv import load_dotenv
load_dotenv()

KEY = os.getenv("API_FOOTBALL_KEY")
HEADERS = {"x-apisports-key": KEY}

LEAGUES = {
    "L1": (61, 2025),
    "PL": (39, 2025),
    "Liga": (140, 2025),
    "Bundes": (78, 2025),
    "MLS": (253, 2025),
    # Coupes europe
    "UCL": (2, 2025),
    "UEL": (3, 2025),
    "UECL": (848, 2025),
}

# Get Sorare canonical names (player.club) per league
players = json.load(open("deglingo-scout-app/public/data/players.json", encoding="utf-8"))
sorare_clubs_by_league = {}
for p in players:
    lg = p.get("league")
    c = p.get("club")
    if lg and c:
        sorare_clubs_by_league.setdefault(lg, set()).add(c)

# Aliases existants
existing_aliases = json.load(open("club_aliases.json", encoding="utf-8"))
print(f"Aliases existant : {len(existing_aliases)} mappings")

print("\n" + "=" * 90)
print("Mapping API-Football -> Sorare canonical")
print("=" * 90)
new_aliases = {}
for code, (lid, season) in LEAGUES.items():
    print(f"\n--- {code} (id={lid}) ---")
    r = requests.get(
        "https://v3.football.api-sports.io/teams",
        headers=HEADERS,
        params={"league": lid, "season": season},
        timeout=30,
    )
    teams = r.json().get("response", []) or []
    api_names = sorted({(t.get("team") or {}).get("name") for t in teams if (t.get("team") or {}).get("name")})
    print(f"  {len(api_names)} teams API-Football")

    # Pour chaque API name : trouver le canonical Sorare correspondant (fuzzy)
    sorare_clubs = sorare_clubs_by_league.get(code, set()) if code in sorare_clubs_by_league else set()
    if not sorare_clubs and code in ("UCL", "UEL", "UECL"):
        # UCL/UEL/UECL : on prend l'union Big-5 (les teams euro viennent de la)
        sorare_clubs = set()
        for lg in ("L1", "PL", "Liga", "Bundes"):
            sorare_clubs |= sorare_clubs_by_league.get(lg, set())

    matched = 0
    for api in api_names:
        # Si exact match
        if api in sorare_clubs:
            matched += 1
            continue
        # Si alias existe
        if api in existing_aliases:
            if existing_aliases[api] in sorare_clubs:
                matched += 1
                continue
        # Sinon fuzzy
        api_low = api.lower().replace(".", "").replace("-", " ").replace("  ", " ")
        candidates = []
        for sc in sorare_clubs:
            sc_low = sc.lower().replace(".", "").replace("-", " ").replace("  ", " ")
            # words in common
            api_words = set(w for w in api_low.split() if len(w) > 2 and w not in ("fc", "cf", "ac", "sc", "afc", "rc"))
            sc_words = set(w for w in sc_low.split() if len(w) > 2 and w not in ("fc", "cf", "ac", "sc", "afc", "rc"))
            common = api_words & sc_words
            if common:
                # score: nombre de mots en commun + bonus si exact substring
                score = len(common) * 10
                if api_low in sc_low or sc_low in api_low: score += 5
                candidates.append((score, sc))
        candidates.sort(reverse=True)
        if candidates and candidates[0][0] >= 10:
            best = candidates[0][1]
            if api != best:
                new_aliases[api] = best
                print(f"  [NEW ALIAS] '{api}' -> '{best}'  (other: {[c[1] for c in candidates[1:3]]})")
        else:
            print(f"  [NO MATCH] '{api}'  candidates: {[c[1] for c in candidates[:3]]}")

print("\n" + "=" * 90)
print(f"NEW aliases proposes : {len(new_aliases)}")
print("=" * 90)
for k, v in new_aliases.items():
    print(f"  '{k}': '{v}'")

# Ecrit dans un fichier separe pour review (pas auto-merge)
with open("club_aliases_new_proposed.json", "w", encoding="utf-8") as f:
    json.dump(new_aliases, f, ensure_ascii=False, indent=2)
print(f"\nSauve dans club_aliases_new_proposed.json (review avant merge)")
