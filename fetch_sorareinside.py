#!/usr/bin/env python3
"""
fetch_sorareinside.py — Récupère les prévisions de titularisation depuis Sorareinside
=====================================================================================
Utilise le compte Sorareinside de l'utilisateur (email + password dans .env)
pour récupérer les probabilités de titularisation (Sorareinside via Supabase auth).

Usage :
  py fetch_sorareinside.py

Ajouter dans .env :
  SORAREINSIDE_PASSWORD=ton_mot_de_passe
"""
import requests, json, os, sys, time
sys.stdout.reconfigure(errors="replace")
from dotenv import load_dotenv

load_dotenv()

# ── CONFIG ──────────────────────────────────────────────────────────────────
EMAIL    = "damien.gheza@gmail.com"
PASSWORD = os.getenv("SORAREINSIDE_PASSWORD", "")

SUPABASE_URL     = "https://ikemjasfbdnkxbijukiz.supabase.co"
SUPABASE_ANON    = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrZW1qYXNmYmRua3hiaWp1a2l6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTUyNDQxODksImV4cCI6MjAzMDgyMDE4OX0.yGUw_0ZtGMMERpWJu3K1Issn22wCobE8TbDMPHWPCBw"
PLATFORM_API     = "https://platform-api.sorareinside.com"

PLAYERS_IN  = "deglingo-scout-app/public/data/players.json"
OUT_PATHS   = [
    "deglingo-scout-app/public/data/players.json",
    "public/data/players.json",
]

# ── AUTH ─────────────────────────────────────────────────────────────────────
def login():
    if not PASSWORD:
        print("❌ SORAREINSIDE_PASSWORD manquant dans .env")
        print("   Ajoute :  SORAREINSIDE_PASSWORD=ton_mot_de_passe")
        sys.exit(1)

    print(f"🔐 Login Sorareinside ({EMAIL})...")

    # Auth via Supabase
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": SUPABASE_ANON,
        "Content-Type": "application/json"
    }
    r = requests.post(url, json={"email": EMAIL, "password": PASSWORD},
                      headers=headers, timeout=30)

    if r.status_code != 200:
        print(f"❌ Auth failed: {r.status_code} {r.text[:300]}")
        # Try platform API login as fallback
        return login_platform()

    data = r.json()
    access_token  = data.get("access_token", "")
    refresh_token = data.get("refresh_token", "")

    if not access_token:
        print(f"❌ Pas de access_token dans la réponse: {str(data)[:200]}")
        sys.exit(1)

    print("✅ Authentifié via Supabase")
    return access_token, refresh_token


def login_platform():
    """Fallback: login via platform API directly"""
    r = requests.post(f"{PLATFORM_API}/auth/login",
                      json={"email": EMAIL, "password": PASSWORD},
                      headers={"Content-Type": "application/json",
                               "Origin": "https://sorareinside.com",
                               "Referer": "https://sorareinside.com/"},
                      timeout=30)
    if r.status_code != 200 and r.status_code != 201:
        print(f"❌ Platform login failed: {r.status_code} {r.text[:300]}")
        sys.exit(1)

    data = r.json()
    print("Platform login response keys:", list(data.keys()) if isinstance(data, dict) else str(data)[:100])
    # Extract token from response
    access_token  = data.get("accessToken") or data.get("access_token") or data.get("token", "")
    refresh_token = data.get("refreshToken") or data.get("refresh_token", "")
    print("✅ Authentifié via Platform API")
    return access_token, refresh_token


# ── AUTH SESSION ─────────────────────────────────────────────────────────────
def make_session():
    """Login via platform API and return authenticated session + current GW slugs"""
    session = requests.Session()
    session.headers.update({
        "Origin": "https://sorareinside.com",
        "Referer": "https://sorareinside.com/",
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/json",
    })
    login_r = session.post(f"{PLATFORM_API}/auth/login",
                           json={"email": EMAIL, "password": PASSWORD},
                           timeout=30)
    if login_r.status_code not in (200, 201):
        print(f"❌ Cookie login failed: {login_r.status_code} {login_r.text[:200]}")
        sys.exit(1)
    print(f"✅ Cookies obtenus: {list(session.cookies.keys())}")
    return session


def get_current_gw_slugs(session):
    """Get current + upcoming GW slugs from Sorare API"""
    import os
    from dotenv import load_dotenv
    load_dotenv()

    URL     = "https://api.sorare.com/federation/graphql"
    API_KEY = os.getenv("SORARE_API_KEY", "")
    headers = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
    if API_KEY:
        headers["APIKEY"] = API_KEY

    Q = '''query { so5 { featuredSo5Fixtures { slug startDate } } }'''
    r = requests.post(URL, json={"query": Q}, headers=headers, timeout=30)
    fixtures = r.json().get("data", {}).get("so5", {}).get("featuredSo5Fixtures", [])

    # Featured = current + next
    slugs = [f["slug"] for f in fixtures if "football" in f.get("slug", "")]
    print(f"  GW slugs disponibles: {slugs}")
    return slugs


# ── FETCH LINEUPS ─────────────────────────────────────────────────────────────
def fetch_lineups(session, gw_slug):
    """Fetch all lineup predictions for a specific GW with pagination.
    Le serveur Sorareinside cap a 50 items/page. Strategie :
    - On submit WORKERS=4 pages en parallele via ThreadPoolExecutor (moins agressif)
    - Chaque page a 3 retries avec backoff exponentiel sur timeout/erreur reseau
    - Timeout eleve (60s) car l'API peut etre lente surtout sur les GW week-end
    - On s'arrete UNIQUEMENT quand une page renvoie <limit items (vraie fin de pagination)
    - Les pages en erreur apres retries sont LOGUEES mais n'arretent pas la pagination
      (sinon une page lente en milieu de pagination fait perdre tout le reste)
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    print(f"\n📡 Fetching linedup-players pour GW: {gw_slug}")

    url = f"{PLATFORM_API}/lineups/linedup-players"
    limit = 50
    all_items = []
    done_paging = False
    failed_offsets = []
    WORKERS = 4
    MAX_RETRIES = 3
    TIMEOUT = 60
    # Sorareinside retourne ~54k items par GW (50 matchs x 18 joueurs x ~60 scenarios).
    # On monte le safety cap tres haut pour ne jamais couper en plein milieu.
    max_pages = 2000  # ~100,000 items max

    # Pre-copy la session (cookies auth) pour chaque worker
    headers_for_worker = dict(session.headers)
    cookies_for_worker = session.cookies.get_dict()

    def fetch_page(offset):
        last_err = None
        for attempt in range(MAX_RETRIES):
            try:
                r = requests.get(url, params={"gameweekSlug": gw_slug, "limit": limit, "offset": offset},
                                 headers=headers_for_worker, cookies=cookies_for_worker, timeout=TIMEOUT)
                if r.status_code != 200:
                    last_err = f"HTTP {r.status_code}"
                    if attempt < MAX_RETRIES - 1:
                        time.sleep(2 ** attempt)
                        continue
                    return offset, None, last_err
                data = r.json()
                items = data.get("data", data) if isinstance(data, dict) else data
                if not isinstance(items, list):
                    items = []
                return offset, items, None
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError,
                    requests.exceptions.ReadTimeout) as e:
                last_err = f"{type(e).__name__}"
                if attempt < MAX_RETRIES - 1:
                    print(f"    retry offset={offset} (attempt {attempt+1}/{MAX_RETRIES}) after {last_err}")
                    time.sleep(2 ** attempt)
                    continue
                return offset, None, last_err
            except Exception as e:
                return offset, None, str(e)[:80]
        return offset, None, last_err or "unknown"

    # Batch de WORKERS pages en parallele, on continue tant qu'aucune page "pleine" ne renvoie <limit
    next_offset = 0
    while not done_paging and next_offset < max_pages * limit:
        batch_offsets = [next_offset + i * limit for i in range(WORKERS)]
        with ThreadPoolExecutor(max_workers=WORKERS) as executor:
            futures = {executor.submit(fetch_page, off): off for off in batch_offsets}
            results = [None] * WORKERS
            for fut in as_completed(futures):
                off = futures[fut]
                idx = batch_offsets.index(off)
                _, items, err = fut.result()
                results[idx] = (items or [], err)

        # Process dans l'ordre : on SKIP les pages en erreur (pas break), break SEULEMENT sur <limit
        batch_end_detected = False
        for idx, (items, err) in enumerate(results):
            off = batch_offsets[idx]
            if err:
                print(f"  ⚠️  offset={off}: FAILED apres {MAX_RETRIES} retries ({err}) — continue")
                failed_offsets.append(off)
                continue
            all_items.extend(items)
            print(f"  offset={off}: +{len(items)} items (total={len(all_items)})")
            if len(items) < limit:
                batch_end_detected = True
                # Ne break PAS tout de suite : continue a traiter les autres pages du batch
                # au cas ou elles auraient aussi retourne des items (hors ordre par rapport au serveur)

        # Si une page a signale la fin (<limit), ET que toutes les autres du batch sont traitees :
        if batch_end_detected:
            done_paging = True
        next_offset += WORKERS * limit

    if failed_offsets:
        print(f"  ⚠️  {len(failed_offsets)} pages en echec definitif: offsets {failed_offsets}")
    # Warn si on a atteint le safety cap sans voir vraie fin de pagination
    if not done_paging and next_offset >= max_pages * limit:
        print(f"  ⚠️  SAFETY CAP atteint ({max_pages * limit} items) — il y a probablement PLUS de data non fetchee !")
        print(f"      Augmente max_pages dans fetch_sorareinside.py si besoin.")
    return all_items, "linedup-players"


# ── PARSE & MAP ───────────────────────────────────────────────────────────────
DEBUG_SLUGS = {"bradley-barcola", "mohamed-kaba", "desire-doue", "ousmane-dembele",
               "vitor-machado-ferreira", "achraf-hakimi", "warren-zaire-emery"}

def parse_lineup_data(data, source):
    """Parse Sorareinside lineup data and map sorare_slug -> starter_pct.

    IMPORTANT : comprendre la structure Sorareinside :
    - Un joueur apparait dans N items (on a vu jusqu'a 160 pour Zaire-Emery).
    - Les items regroupent plusieurs lineup_id (scenarios de formation) et plusieurs
      positions possibles pour ce joueur dans ces scenarios.
    - Pour UN lineup_id donne, un joueur peut avoir 2 items : un comme starter
      (conf=70) + un comme alternate (conf=30), somme = 100%.
    - 'total_confidence_percentage' = somme de toutes les conf du joueur = proba qu'il
      soit DANS LE GROUPE (starter OU alt OU bench). Pas un titu% !
    - 'confidence_percentage' = proba qu'il soit a CETTE position specifique.

    -> titu% = part du temps ou il est STARTER, par rapport au temps ou il est dans
       le groupe (starter + alt + bench). Formule :

        titu = sum(conf des items starter) / sum(conf de tous les items "en groupe") * 100

    Cas particuliers :
    - Tous items is_dnp : 0%
    - Aucun starter mais des alt : 25-40% selon la conf
    - Aucune conf disponible : skip (garde fallback Sorare enum)
    """
    slug_to_pct = {}

    if data is None:
        return slug_to_pct

    items = data if isinstance(data, list) else data.get("data", [])
    print(f"\n📊 Parsing {len(items)} items depuis '{source}'...")

    if not items:
        print("  Aucun item trouvé")
        return slug_to_pct

    # Show structure of first item
    first = items[0] if items else {}
    print(f"  First item keys: {list(first.keys())}")
    if "players" in first and isinstance(first.get("players"), dict):
        print(f"  first.players keys: {list(first['players'].keys())}")

    # Groupe les items par slug
    slug_to_entries = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        player_obj = item.get("players") or item.get("player") or {}
        slug = (player_obj.get("slug") or player_obj.get("sorare_slug") or
                item.get("slug") or item.get("sorare_slug") or
                item.get("player_slug") or "")
        if not slug:
            continue
        slug_to_entries.setdefault(slug, []).append(item)

    print(f"  {len(slug_to_entries)} slugs uniques sur {len(items)} items")

    # Pour chaque slug, calcule le titu%
    counts = {"dnp": 0, "starter": 0, "bench_only": 0, "alt_only": 0, "no_conf": 0}
    def conf_val(e):
        c = e.get("confidence_percentage")
        return c if c is not None else 0

    for slug, entries in slug_to_entries.items():
        # DNP total : tous les items marques is_dnp
        if all(e.get("is_dnp") for e in entries):
            slug_to_pct[slug] = 0
            counts["dnp"] += 1
            continue

        # Separation des items hors DNP
        starter = [e for e in entries
                  if not e.get("is_bench") and not e.get("is_alternate") and not e.get("is_dnp")]
        alt     = [e for e in entries if e.get("is_alternate") and not e.get("is_dnp")]
        bench   = [e for e in entries if e.get("is_bench") and not e.get("is_dnp")]

        s_sum = sum(conf_val(e) for e in starter)
        a_sum = sum(conf_val(e) for e in alt)
        b_sum = sum(conf_val(e) for e in bench)
        total_in_squad = s_sum + a_sum + b_sum

        if total_in_squad == 0:
            # Aucune conf : skip (fallback enum restera)
            counts["no_conf"] += 1
            continue

        # Titu% = part starter / total "en groupe"
        titu_ratio = s_sum / total_in_squad
        pct = round(titu_ratio * 100)

        # Cap a 95 (aucun prediction n'est jamais 100% sure en foot)
        pct = min(pct, 95)
        slug_to_pct[slug] = pct

        if starter:
            counts["starter"] += 1
        elif alt:
            counts["alt_only"] += 1
        elif bench:
            counts["bench_only"] += 1

    print(f"  Breakdown : starters={counts['starter']} alt_only={counts['alt_only']} "
          f"bench_only={counts['bench_only']} dnp={counts['dnp']} no_conf={counts['no_conf']}")
    print(f"  Mapped {len(slug_to_pct)} joueurs (sur {len(slug_to_entries)} slugs uniques)")

    # Debug cible sur quelques joueurs connus — montre detail entries + titu final
    for slug in DEBUG_SLUGS:
        entries = slug_to_entries.get(slug)
        if entries:
            n_starter = sum(1 for e in entries if not e.get("is_bench") and not e.get("is_alternate") and not e.get("is_dnp"))
            n_alt     = sum(1 for e in entries if e.get("is_alternate"))
            n_bench   = sum(1 for e in entries if e.get("is_bench"))
            n_dnp     = sum(1 for e in entries if e.get("is_dnp"))
            s_sum_dbg = sum(conf_val(e) for e in entries if not e.get("is_bench") and not e.get("is_alternate") and not e.get("is_dnp"))
            a_sum_dbg = sum(conf_val(e) for e in entries if e.get("is_alternate") and not e.get("is_dnp"))
            b_sum_dbg = sum(conf_val(e) for e in entries if e.get("is_bench") and not e.get("is_dnp"))
            print(f"\n  🔎 DEBUG {slug}: {len(entries)} items (starter={n_starter} alt={n_alt} bench={n_bench} dnp={n_dnp})")
            print(f"     Somme conf : starter={s_sum_dbg} alt={a_sum_dbg} bench={b_sum_dbg}")
            if slug in slug_to_pct:
                print(f"     -> titu%={slug_to_pct[slug]}%")
            else:
                print(f"     -> NOT mapped (no_conf)")

    if slug_to_pct:
        print(f"\n  Echantillon (5 premiers) :")
        for slug, pct in list(slug_to_pct.items())[:5]:
            print(f"    {slug}: {pct}%")

    return slug_to_pct


# ── PATCH players.json ────────────────────────────────────────────────────────
def patch_players(slug_to_pct):
    patched_total = 0
    for path in OUT_PATHS:
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            data = json.load(f)

        patched = 0
        for p in data:
            slug = p.get("slug", "")
            if slug in slug_to_pct:
                p["sorare_starter_pct"] = slug_to_pct[slug]
                patched += 1
            else:
                p.setdefault("sorare_starter_pct", None)

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        print(f"✅ {patched} joueurs patchés → {path}")
        patched_total += patched
    return patched_total


# ── MAIN ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    login()  # just validate password exists

    session = make_session()
    gw_slugs = get_current_gw_slugs(session)

    if not gw_slugs:
        print("❌ Impossible de trouver les GW slugs")
        sys.exit(1)

    # Parse slug -> (start_date, end_date) pour filtrer les GW passees
    # Format slug: "football-21-24-apr-2026"
    import re
    from datetime import date as _date
    today = _date.today()
    months = {"jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,"jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12}

    def parse_gw(slug):
        m = re.match(r'football-(\d+)-(\d+)-([a-z]+)-(\d{4})', slug)
        if not m: return None, None
        d_start, d_end, mon_s, year_s = int(m.group(1)), int(m.group(2)), m.group(3), int(m.group(4))
        mon = months.get(mon_s, 0)
        return _date(year_s, mon, d_start), _date(year_s, mon, d_end)

    # Filtre : garde uniquement les GW non encore terminees (end >= today)
    upcoming = []
    for slug in gw_slugs:
        start, end = parse_gw(slug)
        if not start: continue
        if end < today:
            print(f"  ⏩ Skip GW passee: {slug} (end={end} < today={today})")
            continue
        upcoming.append((start, end, slug))

    # Trie par date de debut ASCENDANTE : la GW la plus proche en PREMIER
    upcoming.sort()
    # Limite a 2 GWs max (en cours + suivante) — au-dela c'est trop loin, donnees peu fiables
    upcoming = upcoming[:2]
    print(f"  GW a fetcher (max 2, ordre = plus proche d'abord): {[s for _,_,s in upcoming]}")

    # Merge avec setdefault : pour chaque joueur, la PREMIERE GW (la plus proche) prime
    # Ainsi Doue mid-week (40%) n'est PAS ecrase par Doue weekend (70%)
    all_slug_to_pct = {}
    for start, end, gw_slug in upcoming:
        data, source = fetch_lineups(session, gw_slug)
        if data is not None:
            pct_map = parse_lineup_data(data, source)
            new_added = 0
            for slug, pct in pct_map.items():
                if slug not in all_slug_to_pct:  # setdefault : 1ere GW gagne
                    all_slug_to_pct[slug] = pct
                    new_added += 1
            print(f"  Apres {gw_slug}: +{new_added} nouveaux (total={len(all_slug_to_pct)})")

    print(f"\n📊 Total joueurs avec Titu%: {len(all_slug_to_pct)}")

    if not all_slug_to_pct:
        print("\n⚠️  Aucune donnée trouvée. Debug - récupère la structure brute:")
        session2 = make_session()
        for gw_slug in gw_slugs[:1]:
            for url in [f"{PLATFORM_API}/lineups/linedup-players",
                        f"{PLATFORM_API}/lineups",
                        f"{PLATFORM_API}/lineups/changes"]:
                r = session2.get(url, params={"gameweekSlug": gw_slug, "gameweek_slug": gw_slug}, timeout=30)
                print(f"\n{url}?gameweekSlug={gw_slug}: {r.status_code}")
                print(r.text[:500])
        sys.exit(1)

    patched = patch_players(all_slug_to_pct)

    print(f"\n{'='*55}")
    print(f"✅ Terminé ! {patched} joueurs mis à jour avec Titu% Sorareinside")
    print(f"   Lance maintenant : npm run build")
    print(f"{'='*55}")
