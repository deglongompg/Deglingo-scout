#!/usr/bin/env python3
"""
Fetch card prices (Limited & Rare in-season) from Sorare marketplace.
Enriches existing player JSON files with price_limited and price_rare fields.

Usage:
  python3 fetch_prices.py           # All leagues
  python3 fetch_prices.py L1        # Ligue 1 only
"""

import requests, json, time, sys, os

URL = "https://api.sorare.com/federation/graphql"
H = {"Content-Type": "application/json"}
SLEEP = 1.0
CURRENT_SEASON = 2025  # 2025-26 season

LEAGUE_FILES = {
    "L1":     "deglingo_ligue1_final.json",
    "PL":     "deglingo_premier_league_final.json",
    "Liga":   "deglingo_la_liga_final.json",
    "Bundes": "deglingo_bundesliga_final.json",
}

def q(query, variables=None):
    for attempt in range(3):
        try:
            r = requests.post(URL, json={"query": query, "variables": variables or {}}, headers=H, timeout=30)
            data = r.json()
            if "errors" in data:
                msg = data["errors"][0].get("message","")
                if "rate" in msg.lower() or "too many" in msg.lower() or "complexity" in msg.lower():
                    print(f"  ⏳ Rate limited, pause 30s..."); time.sleep(30); continue
            return data
        except Exception as e:
            print(f"  ⚠️ {e}"); time.sleep(10)
    return {"errors": [{"message": "Failed"}]}


def get_exchange_rate():
    data = q('{ config { exchangeRate { rates } } }')
    try:
        rates = data["data"]["config"]["exchangeRate"]["rates"]
        if isinstance(rates, str):
            rates = json.loads(rates)
        return rates["wei"]["eur"]
    except:
        return 1.876e-15  # fallback


def fetch_player_prices(slug, wei_eur):
    """Get lowest listed price for Limited and Rare in-season cards."""
    data = q("""query($slug: String!) {
      tokens {
        liveSingleSaleOffers(first: 10, sport: FOOTBALL, playerSlug: $slug) {
          nodes {
            senderSide {
              amounts { wei eurCents referenceCurrency }
              anyCards { rarityTyped seasonYear }
            }
            receiverSide {
              amounts { wei eurCents referenceCurrency }
            }
          }
        }
      }
    }""", {"slug": slug})

    prices = {"limited": [], "rare": []}

    try:
        nodes = data["data"]["tokens"]["liveSingleSaleOffers"]["nodes"]
    except:
        return None, None

    for n in nodes:
        sender = n["senderSide"]
        receiver = n["receiverSide"]
        card = sender["anyCards"][0] if sender.get("anyCards") else None
        if not card:
            continue
        if card["seasonYear"] != CURRENT_SEASON:
            continue

        rarity = card["rarityTyped"]
        if rarity not in ("limited", "rare"):
            continue

        ra = receiver["amounts"]
        eur = 0
        if ra.get("eurCents") and int(ra["eurCents"]) > 0:
            eur = int(ra["eurCents"]) / 100
        elif ra.get("wei") and ra["wei"] and ra["wei"] != "0":
            eur = int(ra["wei"]) * wei_eur

        if eur > 0:
            prices[rarity].append(round(eur, 2))

    lim = min(prices["limited"]) if prices["limited"] else None
    rare = min(prices["rare"]) if prices["rare"] else None
    return lim, rare


def process_league(league_code, wei_eur):
    filename = LEAGUE_FILES[league_code]
    if not os.path.exists(filename):
        print(f"❌ {filename} introuvable")
        return

    with open(filename, "r", encoding="utf-8") as f:
        players = json.load(f)

    print(f"\n{'='*60}")
    print(f"💰 PRIX CARTES {league_code} — {len(players)} joueurs")
    print(f"{'='*60}")

    found = 0
    for i, p in enumerate(players):
        slug = p.get("slug")
        if not slug:
            continue
        name = p.get("name", slug)
        print(f"  [{i+1}/{len(players)}] {name}...", end=" ")

        lim, rare = fetch_player_prices(slug, wei_eur)
        time.sleep(SLEEP)

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

        # Save periodically
        if (i + 1) % 20 == 0:
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(players, f, ensure_ascii=False, indent=2)

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(players, f, ensure_ascii=False, indent=2)

    print(f"\n✅ {league_code}: {found}/{len(players)} joueurs avec prix")
    print(f"💾 Sauvé: {filename}")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "ALL"

    print("📡 Récupération du taux de change ETH/EUR...")
    wei_eur = get_exchange_rate()
    print(f"  1 ETH = {1e18 * wei_eur:.2f} EUR")

    if target == "ALL":
        for lg in ["L1", "PL", "Liga", "Bundes"]:
            process_league(lg, wei_eur)
    elif target in LEAGUE_FILES:
        process_league(target, wei_eur)
    else:
        print(f"❌ Usage: python3 fetch_prices.py [L1|PL|Liga|Bundes|ALL]")
        sys.exit(1)

    print("\n🏁 Done! Lance ensuite:")
    print("  python3 merge_data.py")
    print("  cd deglingo-scout-app && npx vite build")
