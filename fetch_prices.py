#!/usr/bin/env python3
"""
Fetch card prices (Limited & Rare in-season) from Sorare marketplace.
- Limited: tokenPrices API (accurate floor, includes manager listings)
- Rare: tokenPrices + liveSingleSaleOffers backup (first:45)
- 2 queries per player, ~4s/player with anti-ban sleep

Usage:
  python3 fetch_prices.py           # All leagues
  python3 fetch_prices.py L1        # Ligue 1 only
  python3 fetch_prices.py PL --fresh  # Reset prices and re-fetch
"""

import requests, json, time, sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
from dotenv import load_dotenv

load_dotenv()

URL = "https://api.sorare.com/federation/graphql"
API_KEY = os.getenv("SORARE_API_KEY", "")
H = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
if API_KEY:
    H["APIKEY"] = API_KEY
    SLEEP = 0.5  # Prix = plus sensible, on reste safe (~120 req/min)
    print(f"🔑 API Key détectée — mode rapide (prix)")
else:
    SLEEP = 6.0  # Safe: no rate limit, no VPN needed
    print(f"⚠️  Pas de clé API — mode lent (prix)")
CURRENT_SEASON = 2025  # 2025-26 season (EU leagues)
SEASON_BY_LEAGUE = {"L1": 2025, "PL": 2025, "Liga": 2025, "Bundes": 2025, "MLS": 2025, "JPL": 2025, "Ere": 2025}

LEAGUE_FILES = {
    "L1":     "deglingo_ligue1_final.json",
    "PL":     "deglingo_premier_league_final.json",
    "Liga":   "deglingo_la_liga_final.json",
    "Bundes": "deglingo_bundesliga_final.json",
    "MLS":    "deglingo_mls_final.json",
    "JPL":    "deglingo_jupiler_final.json",
    "Ere":    "deglingo_eredivisie_final.json",
}

def gql(query, variables=None):
    for attempt in range(3):
        try:
            r = requests.post(URL, json={"query": query, "variables": variables or {}}, headers=H, timeout=30)
            if r.status_code == 403:
                print(f"\n  🚫 BAN 403 ! Change d'IP (VPN) et relance.")
                sys.exit(1)
            if r.status_code == 429 or "Too many" in r.text[:200]:
                wait = 45 if attempt < 2 else 90
                print(f"\n  ⏳ Rate limited, pause {wait}s...")
                time.sleep(wait)
                continue
            data = r.json()
            if "errors" in data:
                msg = data["errors"][0].get("message", "")
                if "rate" in msg.lower() or "too many" in msg.lower():
                    print(f"\n  ⏳ Rate limited, pause 45s...")
                    time.sleep(45)
                    continue
            return data
        except Exception as e:
            print(f"\n  ⚠️ {e}")
            time.sleep(10)
    return {"errors": [{"message": "Failed after 3 attempts"}]}


# Query 1: tokenPrices for Limited + Rare (card.liveSingleSaleOffer = secondary market floor)
Q_TOKEN_PRICES = """query($s: String!, $r: Rarity!) { tokens { tokenPrices(playerSlug: $s, rarity: $r) {
  card { seasonYear ... on Card { inSeasonEligible } liveSingleSaleOffer { receiverSide { amounts { eurCents wei } } } }
}}}"""

# Query 2: liveSingleSaleOffers backup (catches offers tokenPrices might miss)
Q_OFFERS = """query($s: String!) { tokens {
  liveSingleSaleOffers(first: 20, sport: FOOTBALL, playerSlug: $s) {
    nodes {
      senderSide { anyCards { rarityTyped seasonYear ... on Card { inSeasonEligible } } }
      receiverSide { amounts { eurCents wei } }
    }
  }
}}"""


def extract_eur(amounts):
    """Extract EUR price from amounts object."""
    if not amounts:
        return 0
    if amounts.get("eurCents") and int(amounts["eurCents"]) > 0:
        return round(int(amounts["eurCents"]) / 100, 2)
    if amounts.get("wei") and str(amounts["wei"]) not in ("0", "None", "", "null"):
        try:
            return round(int(amounts["wei"]) / 1e18 * 1800, 2)
        except:
            pass
    return 0


def fetch_player_prices(slug, season=None):
    """Get floor price for Limited and Rare in-season cards.
    Strategy: 1 query (liveSingleSaleOffers) gets both rarities at once.
    If either is missing, fallback to tokenPrices for that rarity.
    = 1 query best case, 2-3 worst case."""
    season = season or CURRENT_SEASON
    lim_prices = []
    rare_prices = []

    # === Query 1: liveSingleSaleOffers — gets BOTH Limited + Rare in one shot ===
    data = gql(Q_OFFERS, {"s": slug})
    time.sleep(SLEEP)
    try:
        for n in data.get("data", {}).get("tokens", {}).get("liveSingleSaleOffers", {}).get("nodes", []):
            cards = n.get("senderSide", {}).get("anyCards", [])
            if not cards:
                continue
            card = cards[0]
            if not card.get("inSeasonEligible"):
                continue
            eur = extract_eur(n.get("receiverSide", {}).get("amounts"))
            if eur <= 0:
                continue
            rarity = card.get("rarityTyped", "")
            if rarity == "limited":
                lim_prices.append(eur)
            elif rarity == "rare":
                rare_prices.append(eur)
    except:
        pass

    # === Fallback: tokenPrices if Limited missing ===
    if not lim_prices:
        data2 = gql(Q_TOKEN_PRICES, {"s": slug, "r": "limited"})
        time.sleep(SLEEP)
        try:
            for c in data2.get("data", {}).get("tokens", {}).get("tokenPrices", []):
                card = c.get("card", {})
                if not card.get("inSeasonEligible"):
                    continue
                offer = card.get("liveSingleSaleOffer")
                if not offer:
                    continue
                eur = extract_eur(offer.get("receiverSide", {}).get("amounts"))
                if eur > 0:
                    lim_prices.append(eur)
        except:
            pass

    # === Fallback: tokenPrices if Rare missing ===
    if not rare_prices:
        data3 = gql(Q_TOKEN_PRICES, {"s": slug, "r": "rare"})
        time.sleep(SLEEP)
        try:
            for c in data3.get("data", {}).get("tokens", {}).get("tokenPrices", []):
                card = c.get("card", {})
                if not card.get("inSeasonEligible"):
                    continue
                offer = card.get("liveSingleSaleOffer")
                if not offer:
                    continue
                eur = extract_eur(offer.get("receiverSide", {}).get("amounts"))
                if eur > 0:
                    rare_prices.append(eur)
        except:
            pass

    lim = round(min(lim_prices), 2) if lim_prices else None
    rare = round(min(rare_prices), 2) if rare_prices else None
    return lim, rare


def process_league(league_code, fresh=False):
    filename = LEAGUE_FILES[league_code]
    if not os.path.exists(filename):
        print(f"❌ {filename} introuvable")
        return

    with open(filename, "r", encoding="utf-8") as f:
        players = json.load(f)

    if fresh:
        for p in players:
            p["price_limited"] = None
            p["price_rare"] = None
        print(f"  🗑️  FRESH mode — prix remis à zéro")

    print(f"\n{'='*60}")
    print(f"💰 PRIX CARTES {league_code} — {len(players)} joueurs")
    print(f"  💤 Sleep: {SLEEP}s/query (2-3 queries/joueur)")
    print(f"{'='*60}")

    found = 0
    skipped = 0
    start = time.time()
    for i, p in enumerate(players):
        slug = p.get("slug")
        if not slug:
            continue
        name = p.get("name", slug)

        if not fresh and (p.get("price_limited") is not None or p.get("price_rare") is not None):
            skipped += 1
            continue

        print(f"  [{i+1}/{len(players)}] {name}...", end=" ", flush=True)

        lim, rare = fetch_player_prices(slug, season=SEASON_BY_LEAGUE.get(league_code, CURRENT_SEASON))

        p["price_limited"] = lim
        p["price_rare"] = rare

        if lim or rare:
            found += 1
            parts = []
            if lim: parts.append(f"L={lim}€")
            if rare: parts.append(f"R={rare}€")
            print(" | ".join(parts))
        else:
            print("—")

        if (i + 1) % 10 == 0:
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(players, f, ensure_ascii=False, indent=2)
            elapsed = time.time() - start
            done = i + 1 - skipped
            if done > 0:
                remaining = (len(players) - i - 1) * (elapsed / done)
                print(f"    💾 Sauvegarde ({i+1}/{len(players)}) | ETA ~{int(remaining/60)}min")

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(players, f, ensure_ascii=False, indent=2)

    # ── Backup séparé dans player_prices.json (survit au --fresh) ──
    PRICES_FILE = "player_prices.json"
    existing_prices = {}
    if os.path.exists(PRICES_FILE):
        with open(PRICES_FILE, encoding="utf-8") as f:
            existing_prices = json.load(f)
    for p in players:
        slug = p.get("slug")
        if slug and (p.get("price_limited") is not None or p.get("price_rare") is not None):
            existing_prices[slug] = {
                "price_limited": p.get("price_limited"),
                "price_rare":    p.get("price_rare"),
            }
    with open(PRICES_FILE, "w", encoding="utf-8") as f:
        json.dump(existing_prices, f, ensure_ascii=False)
    print(f"  💾 player_prices.json mis à jour ({len(existing_prices)} joueurs avec prix)")

    elapsed = time.time() - start
    print(f"\n✅ {league_code} terminé en {int(elapsed/60)}min {int(elapsed%60)}s")
    print(f"  💰 {found} nouveaux prix trouvés")
    if skipped: print(f"  ⏭️  {skipped} skippés (déjà en base)")
    print(f"  💾 {filename}")


if __name__ == "__main__":
    args = sys.argv[1:]
    fresh = "--fresh" in args
    args = [a for a in args if a != "--fresh"]
    target = args[0] if args else "ALL"

    print("🔍 Test API Sorare...", end=" ")
    test = gql('{ football { competition(slug: "ligue-1-fr") { displayName } } }')
    if "errors" in test or "data" not in test:
        print("❌ API KO — check VPN")
        sys.exit(1)
    print("✅ API OK")

    if target == "ALL":
        for lg in ["L1", "PL", "Liga", "Bundes", "MLS", "JPL", "Ere"]:
            process_league(lg, fresh)
    elif target in LEAGUE_FILES:
        process_league(target, fresh)
    else:
        print(f"❌ Usage: python3 fetch_prices.py [L1|PL|Liga|Bundes|MLS|JPL|Ere|ALL] [--fresh]")
        sys.exit(1)

    print("\n🏁 Done! Lance ensuite:")
    print("  python3 merge_data.py")
    print("  cd deglingo-scout-app && npx vite build")
