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
    """Fetch all lineup predictions for a specific GW with pagination"""
    print(f"\n📡 Fetching linedup-players pour GW: {gw_slug}")

    url = f"{PLATFORM_API}/lineups/linedup-players"
    all_items = []
    limit = 200
    offset = 0

    while True:
        r = session.get(url, params={
            "gameweekSlug": gw_slug,
            "limit": limit,
            "offset": offset
        }, timeout=60)

        if r.status_code != 200:
            print(f"  Error {r.status_code}: {r.text[:200]}")
            break

        data = r.json()
        items = data.get("data", data) if isinstance(data, dict) else data
        if not isinstance(items, list):
            items = []

        all_items.extend(items)
        print(f"  offset={offset}: +{len(items)} items (total={len(all_items)})")

        if len(items) < limit:
            break  # No more pages
        offset += limit

    return all_items, "linedup-players"


# ── PARSE & MAP ───────────────────────────────────────────────────────────────
def parse_lineup_data(data, source):
    """Parse Sorareinside lineup data and map sorare_slug -> starter_pct"""
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
    # Show nested player keys if present
    if "player" in first:
        print(f"  first.player keys: {list(first['player'].keys())}")

    for item in items:
        if not isinstance(item, dict):
            continue

        # Player slug is in nested "players" object (JOIN result from DB)
        player_obj = item.get("players") or item.get("player") or {}
        slug = (player_obj.get("slug") or player_obj.get("sorare_slug") or
                item.get("slug") or item.get("sorare_slug") or
                item.get("player_slug") or "")

        # Confidence percentage (0-100) — main field from linedup-players
        conf = item.get("confidence_percentage") or item.get("confidence")

        if not slug or conf is None:
            continue

        slug_to_pct[slug] = int(conf)

    print(f"  Mapped {len(slug_to_pct)} joueurs")
    if slug_to_pct:
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

    # Collect all predictions across GWs (current + next)
    all_slug_to_pct = {}
    for gw_slug in gw_slugs:
        data, source = fetch_lineups(session, gw_slug)
        if data is not None:
            pct_map = parse_lineup_data(data, source)
            all_slug_to_pct.update(pct_map)

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
