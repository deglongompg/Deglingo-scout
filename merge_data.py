import json, os, shutil

STATUS_FILE  = "player_status.json"
PRICES_FILE  = "player_prices.json"

LEAGUES = {
    "deglingo_ligue1_final.json": "L1",
    "deglingo_premier_league_final.json": "PL",
    "deglingo_la_liga_final.json": "Liga",
    "deglingo_bundesliga_final.json": "Bundes",
}

POS_MAP = {
    "Goalkeeper": "GK",
    "Defender": "DEF",
    "Midfielder": "MIL",
    "Forward": "ATT",
}

all_players = []

for filename, league_short in LEAGUES.items():
    with open(filename, "r", encoding="utf-8") as f:
        players = json.load(f)
    for p in players:
        p["position"] = POS_MAP.get(p.get("position", ""), p.get("position", ""))
        p["league"] = league_short
        apps = max(p.get("appearances", 1), 1)
        p["ga_per_match"] = round((p.get("goals", 0) + p.get("assists", 0)) / apps, 3)
        # Fix titu_pct if missing or 0
        mp = p.get("matchs_played", 0) or 0
        mt = p.get("matchs_total", 0) or 0
        if mt > 0 and (not p.get("titu_pct") or p["titu_pct"] == 0):
            p["titu_pct"] = round(mp / mt * 100)
        # Fix reg10 if missing — recalculate from last_10
        if p.get("reg10") is None:
            l10 = (p.get("last_10") or p.get("last_5") or [])[:10]
            p["reg10"] = round(sum(1 for s in l10 if s > 60) / len(l10) * 100) if l10 else 0
        # Ensure no None on critical display fields
        for k in ["l2", "l5", "l10", "aa2", "aa5", "aa10", "floor", "ceiling",
                   "min_15", "max_15", "regularite", "ds_rate", "titu_pct"]:
            if p.get(k) is None:
                p[k] = 0
        all_players.append(p)

    # Validation report
    bad_titu = sum(1 for p in all_players if p["titu_pct"] == 0 and (p.get("matchs_played", 0) or 0) > 0)
    bad_reg = sum(1 for p in all_players if p.get("reg10") is None)
    if bad_titu or bad_reg:
        print(f"⚠️  Anomalies: {bad_titu} titu_pct=0 suspects, {bad_reg} reg10=None")
    else:
        print(f"✅ Validation OK — aucune donnée vide détectée")

# ── Merge player_status.json si dispo (généré par fetch_player_status.py) ──
if os.path.exists(STATUS_FILE):
    with open(STATUS_FILE, encoding="utf-8") as f:
        status = json.load(f)
    patched = 0
    for p in all_players:
        s = status.get(p.get("slug", ""))
        if s:
            p["injured"]     = s.get("injured",     False)
            p["suspended"]   = s.get("suspended",   False)
            p["sorare_proj"] = s.get("sorare_proj",  None)
            patched += 1
        else:
            p.setdefault("injured",     False)
            p.setdefault("suspended",   False)
            p.setdefault("sorare_proj", None)
    print(f"✅ player_status.json mergé — {patched} joueurs avec status")
else:
    print(f"ℹ️  Pas de player_status.json — run fetch_player_status.py le vendredi")

# ── Merge player_prices.json si dispo (généré par fetch_prices.py) ──
if os.path.exists(PRICES_FILE):
    with open(PRICES_FILE, encoding="utf-8") as f:
        prices = json.load(f)
    patched_prices = 0
    for p in all_players:
        pr = prices.get(p.get("slug", ""))
        if pr:
            p["price_limited"] = pr.get("price_limited")
            p["price_rare"]    = pr.get("price_rare")
            patched_prices += 1
        else:
            p.setdefault("price_limited", None)
            p.setdefault("price_rare",    None)
    print(f"✅ player_prices.json mergé — {patched_prices} joueurs avec prix")
else:
    print(f"ℹ️  Pas de player_prices.json — run fetch_prices.py pour les prix")

for outdir in ["public/data", "deglingo-scout-app/public/data"]:
    os.makedirs(outdir, exist_ok=True)
    with open(f"{outdir}/players.json", "w", encoding="utf-8") as f:
        json.dump(all_players, f, ensure_ascii=False)
    shutil.copy("teams_data.json", f"{outdir}/teams.json")

print(f"✅ {len(all_players)} joueurs exportés → public/data/ + deglingo-scout-app/public/data/")
print(f"✅ teams.json copié dans les deux répertoires")
