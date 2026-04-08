#!/usr/bin/env python3
"""
Fetch Sorare card picture URLs for all players in players.json.
Injecte sorare_card_url + sorare_player_url + sorare_slug dans players.json.

Strategie :
1. Genere des slugs candidats depuis le nom du joueur
2. Verifie player(slug:...) sur le 1er candidat via GraphQL batch (aliases)
3. Si echec, retry avec candidats suivants
4. SLUG_OVERRIDES pour les cas connus difficiles (mononyms, noms civils)

Usage: py fetch_sorare_cards.py
"""

import json, os, time, re, unicodedata, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from urllib.request import Request, urlopen
from urllib.error import HTTPError

GRAPHQL_URL = "https://api.sorare.com/graphql"
SEASON = 2025
BATCH_SIZE = 20
SLEEP = 0.5

script_dir = os.path.dirname(os.path.abspath(__file__))
data_dir = os.path.join(script_dir, "deglingo-scout-app", "public", "data")
players_path = os.path.join(data_dir, "players.json")

# ─── Override manuel pour les cas difficiles ──────────────────────────────────
# Format: "Nom dans notre DB" -> "slug Sorare"
SLUG_OVERRIDES = {
    # Mononyms / noms civils tres differents
    "Vitinha":          "vitor-machado-ferreira",
    "Rodri":            "rodrigo-hernandez-cascante",
    "Vini Jr.":         "vinicius-jose-paiva-souza-junior",
    "Vinicius Jr":      "vinicius-jose-paiva-souza-junior",
    "Vinicius Junior":  "vinicius-jose-paiva-souza-junior",
    "Casemiro":         "carlos-henrique-casimiro",
    "Richarlison":      "richarlison-de-andrade",
    "Fabinho":          "fabio-henrique-tavares",
    "Ederson":          "ederson-santana-de-moraes",
    "Alisson":          "alisson-ramon-becker",
    "Fred":             "frederico-rodrigues-de-paula-santos",
    "Jota":             "diogo-jose-teixeira-da-silva",
    "Diogo Jota":       "diogo-jose-teixeira-da-silva",
    "Bernardo Silva":   "bernardo-mota-veiga-de-carvalho-e-silva",
    "Kylian Mbappe":    "kylian-mbappe-lottin",
    "Kylian Mbappé":    "kylian-mbappe-lottin",
    "Lamine Yamal":     "lamine-yamal-nasraoui-ebana",
    "Gavi":             "pablo-martin-paez-gavira",
    "Pedri":            "pedro-gonzalez-lopez",
    "Ferran Torres":    "ferran-torres-garcia",
    "Ansu Fati":        "anssumane-fati-vieira",
    "Yamal":            "lamine-yamal-nasraoui-ebana",
    "Ferland Mendy":    "ferland-sinna-mendy",
    "Lucas Hernandez":  "lucas-francois-bernard-hernandez",
    "Theo Hernandez":   "theo-bernard-ernest-hernandez",
    "Mike Maignan":     "mike-maignan",
    "Marquinhos":       "marcos-aoas-correa",
    "Neymar":           "neymar-da-silva-santos-junior",
    "Raphinha":         "raphael-dias-belloli",
    "Firmino":          "roberto-firmino-barbosa-de-oliveira",
    "Militao":          "eder-gabriel-militao",
    "Eder Militao":     "eder-gabriel-militao",
    "Tchouameni":       "aurelien-tchouameni",
    "Bellingham":       "jude-bellingham",
    "Vitor Roque":      "vitor-roque",
    "Dani Olmo":        "daniel-olmo-carvajal",
    "Mikel Merino":     "mikel-merino-zazon",
    "Yerlan Azhiben":   "yerlan-azhiben",
    "Joao Cancelo":     "joao-pedro-cavaco-cancelo",
    "Cancelo":          "joao-pedro-cavaco-cancelo",
    "Joao Felix":       "joao-felix-sequeira",
    "Joao Pedro":       "joao-pedro-junqueira-de-jesus",
    "Andreas Christensen": "andreas-bjelland-christensen",
    "Alejandro Balde":  "alejandro-balde",
    "Jules Kounde":     "jules-olivier-kounde",
    "Endrick":          "endrick-felipe-moreira-de-sousa",
    # Bundesliga
    "Jamal Musiala":    "jamal-musiala",
    "Leroy Sane":       "leroy-aziz-sane",
    "Harry Kane":       "harry-edward-kane",
    "Joshua Kimmich":   "joshua-walter-kimmich",
    "Serge Gnabry":     "serge-david-gnabry",
    "Leon Goretzka":    "leon-goretzka",
    "Thomas Muller":    "thomas-muller",
    "Manuel Neuer":     "manuel-peter-neuer",
    "Alphonso Davies":  "alphonso-boyle-davies",
    "Dayot Upamecano":  "dayot-upamecano",
    "Kim Min-jae":      "min-jae-kim",
    "Granit Xhaka":     "granit-xhaka",
    "Florian Wirtz":    "florian-wirtz",
    "Victor Boniface":  "victor-okoh-boniface",
    # Premier League
    "Mohamed Salah":    "mohamed-salah",
    "Trent Alexander-Arnold": "trent-alexander-arnold",
    "Virgil van Dijk":  "virgil-van-dijk",
    "Darwin Nunez":     "darwin-gabriel-nunez-ribeiro",
    "Erling Haaland":   "erling-braut-haaland",
    "Kevin De Bruyne":  "kevin-de-bruyne",
    "Phil Foden":       "philip-walter-foden",
    "Bukayo Saka":      "bukayo-ayoyinka-saka",
    "Martin Odegaard":  "martin-odegaard",
    "Declan Rice":      "declan-rice",
    "Bruno Fernandes":  "bruno-miguel-borges-fernandes",
    "Marcus Rashford":  "marcus-rashford",
    "Cole Palmer":      "cole-palmer",
    "Nicolas Jackson":  "nicolas-jackson",
    "Enzo Fernandez":   "enzo-jeremias-fernandez",
    "Christopher Nkunku": "christopher-nkunku",
    "Raheem Sterling":  "raheem-shaquille-sterling",
    # Ligue 1
    "Ousmane Dembele":  "ousmane-dembele",
    "Randal Kolo Muani": "randal-kolo-muani",
    "Warren Zaire-Emery": "warren-zaire-emery",
    "Achraf Hakimi":    "achraf-hakimi-mouh",
    "Goncalo Ramos":    "goncalo-bernardo-inacio-ramos",
    "Matvey Safonov":   "matvej-safonov",
    "Nuno Mendes":      "nuno-alexandre-tavares-mendes",
}

# ─── Helpers ──────────────────────────────────────────────────────────────────

def strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def to_slug_part(s):
    s = strip_accents(s.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")

def name_to_slug_candidates(name):
    """Genere slug candidats depuis un nom. Tente nom complet, puis variantes."""
    # Override manuel en premier
    if name in SLUG_OVERRIDES:
        return [SLUG_OVERRIDES[name]]

    parts = name.strip().split()
    slugged = [to_slug_part(p) for p in parts]

    candidates = []
    candidates.append("-".join(slugged))           # full: "bruno-fernandes"
    if len(slugged) > 2:
        candidates.append("-".join([slugged[0], slugged[-1]]))  # first+last
    if len(slugged) > 1:
        candidates.append(slugged[-1])             # last only
    candidates.append(slugged[0])                  # first only

    return list(dict.fromkeys(candidates))

def normalize_name(s):
    s = strip_accents(s.lower())
    s = re.sub(r"[^a-z0-9]", "", s)
    return s

def names_match(api_name, our_name):
    """Compare displayName Sorare vs notre nom — flexible"""
    a = normalize_name(api_name)
    b = normalize_name(our_name)
    if a == b:
        return True
    # Notre nom contenu dans le nom Sorare (ex: "Mbappe" dans "Kylian Mbappe Lottin")
    our_words = [normalize_name(w) for w in our_name.split() if len(w) > 2]
    if our_words and all(w in a for w in our_words):
        return True
    # Nom Sorare contenu dans notre nom
    api_words = [normalize_name(w) for w in api_name.split() if len(w) > 2]
    if api_words and all(w in b for w in api_words):
        return True
    return False

def gql_fetch(query):
    req = Request(
        GRAPHQL_URL,
        data=json.dumps({"query": query}).encode(),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "DeglIngo-Scout/1.0"
        }
    )
    try:
        with urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except HTTPError as e:
        print(f"  HTTP {e.code}: {e.reason}")
        return None
    except Exception as e:
        print(f"  Error: {e}")
        return None

# ─── Batch: check player slugs ────────────────────────────────────────────────

def check_slugs_batch(items):
    """
    items: list of (key, player_name, slug_to_test)
    Retourne {key: {card_url, player_url, matched_slug, display_name}} ou key: None
    """
    if not items:
        return {}

    aliases = []
    for key, _, slug in items:
        aliases.append(f"""
  {key}: allCards(first: 1, rarities: [common], playerSlugs: ["{slug}"], seasonStartYears: [{SEASON}]) {{
    nodes {{ pictureUrl player {{ displayName slug pictureUrl }} }}
  }}""")

    query = "{ football {" + "".join(aliases) + "} }"
    data = gql_fetch(query)
    if not data or "data" not in data:
        return {key: None for key, _, _ in items}

    football = data["data"].get("football", {})
    results = {}

    for key, our_name, slug in items:
        nodes = football.get(key, {}).get("nodes", [])
        if nodes:
            node = nodes[0]
            api_name = node["player"]["displayName"]
            if names_match(api_name, our_name):
                results[key] = {
                    "card_url": node["pictureUrl"],
                    "player_url": node["player"]["pictureUrl"],
                    "matched_slug": node["player"]["slug"],
                    "display_name": api_name,
                }
            else:
                results[key] = None
        else:
            results[key] = None

    return results

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    with open(players_path, encoding="utf-8") as f:
        players = json.load(f)

    print(f"Deglingo Scout — fetch_sorare_cards")
    print(f"   {len(players)} joueurs | Saison {SEASON}")

    already = sum(1 for p in players if p.get("sorare_card_url"))
    to_process = [p for p in players if not p.get("sorare_card_url")]
    print(f"   Deja mappes : {already}")
    print(f"   A traiter   : {len(to_process)}")

    player_index = {p["name"]: p for p in players}
    found = 0
    not_found = 0
    total = len(to_process)

    i = 0
    while i < total:
        batch_players = to_process[i:i+BATCH_SIZE]

        # Build items avec 1er candidat slug
        items = []
        player_candidates = {}  # key -> (name, [all_candidates])
        for j, p in enumerate(batch_players):
            key = f"p{i+j}"
            candidates = name_to_slug_candidates(p["name"])
            items.append((key, p["name"], candidates[0]))
            player_candidates[key] = (p["name"], candidates)

        results = check_slugs_batch(items)

        # Retry avec candidats suivants pour les echecs
        retry_items = []
        for key, (name, candidates) in player_candidates.items():
            if results.get(key) is None and len(candidates) > 1:
                retry_items.append((key, name, candidates, 1))

        while retry_items:
            next_retry = []
            batch_retry = [(key, name, candidates[idx]) for key, name, candidates, idx in retry_items]
            retry_results = check_slugs_batch(batch_retry)
            for key, name, candidates, idx in retry_items:
                r = retry_results.get(key)
                if r is not None:
                    results[key] = r
                elif idx + 1 < len(candidates):
                    next_retry.append((key, name, candidates, idx + 1))
            retry_items = next_retry
            if retry_items:
                time.sleep(0.2)

        # Mise a jour players
        for key, (name, candidates) in player_candidates.items():
            p = player_index.get(name)
            if p is None:
                continue
            r = results.get(key)
            if r:
                p["sorare_card_url"] = r["card_url"]
                p["sorare_player_url"] = r["player_url"]
                p["sorare_slug"] = r["matched_slug"]
                found += 1
                print(f"  OK  {name} -> {r['matched_slug']}".encode('utf-8', errors='replace').decode('utf-8'))
            else:
                p["sorare_card_url"] = None
                p["sorare_player_url"] = None
                p["sorare_slug"] = None
                not_found += 1
                # Affiche seulement les joueurs connus (D-Score > 50)
                if p.get("l5", 0) and p.get("l5") > 50:
                    print(f"  NOK {name} (L5={p.get('l5')}) -> tried: {candidates}")

        i += BATCH_SIZE

        # Sauvegarde intermediaire tous les 200 joueurs
        if i % 200 == 0:
            with open(players_path, "w", encoding="utf-8") as f:
                json.dump(players, f, ensure_ascii=False, indent=2)
            pct = int((i/total)*100)
            print(f"  >> Sauvegarde {i}/{total} ({pct}%) | OK={found} NOK={not_found}")

        time.sleep(SLEEP)

    # Sauvegarde finale
    with open(players_path, "w", encoding="utf-8") as f:
        json.dump(players, f, ensure_ascii=False, indent=2)

    print(f"\nDone!")
    print(f"   Trouves    : {found + already} / {len(players)}")
    print(f"   Non trouves: {not_found}")
    total_with_card = sum(1 for p in players if p.get("sorare_card_url"))
    print(f"   Total avec carte: {total_with_card}")

if __name__ == "__main__":
    main()
