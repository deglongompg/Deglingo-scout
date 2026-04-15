#!/usr/bin/env python3
"""
Analyse de sensibilité D-Score Match vs Score Réel GW
Reproduit exactement la formule dscore.js en Python
"""
import json, sys, math
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

with open('deglingo-scout-app/public/data/players.json', 'r', encoding='utf-8') as f:
    players = json.load(f)
with open('deglingo-scout-app/public/data/teams.json', 'r', encoding='utf-8') as f:
    teams = json.load(f)
with open('deglingo-scout-app/public/data/fixtures.json', 'r', encoding='utf-8') as f:
    fx = json.load(f)

pf = fx.get('player_fixtures', {})
LG_AVG_XG = {"PL": 1.51, "L1": 1.49, "Liga": 1.52, "Bundes": 1.65, "MLS": 1.50}

EXTRA_GOAT = {
    "lamine yamal", "michael olise", "kylian mbappe", "harry kane", "pedri", "joshua kimmich",
    "vitinha", "bruno fernandes", "nico schlotterbeck", "gabriel magalhaes",
    "alejandro grimaldo", "dominik szoboszlai", "luis diaz", "achraf hakimi",
    "maximilian mittelstadt", "nuno mendes",
}

def norm_name(s):
    import unicodedata
    s = unicodedata.normalize("NFD", s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return s.replace("-", " ").replace(".", " ").replace("'", " ").lower().strip()

def is_extra_goat(p):
    return norm_name(p.get('name', '')) in EXTRA_GOAT

def find_team(lg_teams, club):
    if not club: return None
    cl = club.lower().replace("-", " ")
    for t in lg_teams:
        tn = t['name'].lower().replace("-", " ")
        if cl in tn or tn in cl: return t
    nc = norm_name(club)
    for t in lg_teams:
        nt = norm_name(t['name'])
        if nc in nt or nt in nc: return t
    words = nc.split()[:2]
    prefix = " ".join(words)
    if len(prefix) > 4:
        for t in lg_teams:
            if norm_name(t['name']).startswith(prefix): return t
    return None

def norm(v, lo, hi, inv=False):
    if hi == lo: return 0.5
    n = max(0, min(1, (v - lo) / (hi - lo)))
    return 1 - n if inv else n

def cs_prob(def_xga, opp_xg, league):
    avg = LG_AVG_XG.get(league, 1.50)
    raw_lambda = (def_xga * opp_xg) / avg
    lam = max(0.5, min(2.0, raw_lambda))
    return round(math.exp(-lam) * 100)

def d_score_match(p, o, is_home, player_team=None):
    _l5 = p.get('l5') or 0
    _aa5 = p.get('aa5') or 0
    _reg = p.get('regularite') or 0
    _floor = p.get('min_15') or p.get('floor') or 0

    has_recent = _l5 > 0 or (p.get('l10') or 0) > 0
    titu_pct = p.get('titu_pct') or 0
    starter_pct = p.get('sorare_starter_pct') or 0
    if not has_recent and titu_pct == 0 and starter_pct < 70:
        return min(15, round((p.get('ga_per_match') or 0) * 20))

    effective_titu = max(titu_pct, starter_pct)
    inactivity = 0 if effective_titu >= 50 else (-8 if effective_titu >= 30 else (-18 if effective_titu >= 10 else (-28 if effective_titu > 0 else -35)))

    mp = p.get('matchs_played') or p.get('appearances') or 0
    sample_base = 0 if mp >= 5 else (-5 if mp >= 3 else (-12 if mp >= 2 else -20))
    sample_penalty = round(sample_base / 2) if titu_pct >= 70 and mp >= 3 else sample_base

    l25 = p.get('l25') or p.get('l10') or _l5
    aa25 = p.get('aa10') or _aa5
    blend_w = 0 if l25 < 50 else min(0.6, (l25 - 50) / 40)
    l_eff = _l5 * (1 - blend_w) + l25 * blend_w
    aa_eff = _aa5 * (1 - blend_w) + aa25 * blend_w

    pos = p.get('position', '')

    # GK
    if pos == "GK":
        opp_xg_gk = o.get('xg_ext' if is_home else 'xg_dom', 1.3)
        ppda_gk = o.get('ppda_ext' if is_home else 'ppda_dom', 12)
        def_xga_gk = (player_team.get('xga_dom' if is_home else 'xga_ext', 1.3)) if player_team else 1.3
        avg_xg = LG_AVG_XG.get(p.get('league'), 1.50)
        raw_lam = (def_xga_gk * opp_xg_gk) / avg_xg
        lam = max(0.5, min(2.0, raw_lam))
        cs_prob_gk = math.exp(-lam) * 100

        last5 = p.get('last_5') or []
        gk_recent = len([s for s in last5[:3] if s > 0])
        gk_lost = last5[0] == 0 and last5[1] == 0 and any(s > 0 for s in last5) if len(last5) >= 2 else False
        gk_inact = 0 if gk_recent >= 2 else (-5 if gk_recent >= 1 else (min(inactivity - 10, -10) if gk_lost else inactivity))

        l40_gk = p.get('l40') or 0
        has_l40 = l40_gk > 0
        l_eff_gk = _l5 * 0.3 + l40_gk * 0.7 if has_l40 and gk_recent >= 2 else (l40_gk * 0.85 if has_l40 else l_eff)
        aa40_gk = p.get('aa40') or 0
        aa_eff_gk = aa_eff * 0.4 + aa40_gk * 0.6 if has_l40 and aa40_gk > 0 and gk_recent <= 1 else aa_eff
        gk_sample = 0 if has_l40 and gk_recent >= 2 else (round(sample_penalty * 0.4) if gk_recent >= 2 else (round(sample_penalty * 0.5) if has_l40 else sample_penalty))
        gk_inact_final = 0 if has_l40 and gk_recent >= 2 else gk_inact

        f_gk = norm(l_eff_gk, 20, 70) * 14
        aa_gk = norm(aa_eff_gk, -20, 15) * 10
        fl_gk = norm(_floor, 10, 60) * 8
        rg_gk = norm(_reg, 0, 100) * 5
        l25_gk = norm(l25, 25, 70) * 3 if l25 > l_eff_gk else 0
        socle_gk = f_gk + aa_gk + fl_gk + rg_gk + l25_gk

        cs_ev = (cs_prob_gk / 100) * 10
        cs_bonus = norm(cs_ev, 0, 6) * 22
        xg_pen = norm(opp_xg_gk, 0.5, 2.2, True) * 16
        own_def = norm(def_xga_gk, 0.8, 2.0, True) * 6
        saves = norm(ppda_gk, 7, 20, True) * 6
        ctx_gk = cs_bonus + xg_pen + own_def + saves

        sc_gk = [s for s in last5 if s > 0]
        l2_gk = (sc_gk[0] + sc_gk[1]) / 2 if len(sc_gk) >= 2 else (sc_gk[0] if sc_gk else l_eff)
        tr_gk = (l2_gk - l_eff) / l_eff * 100 if l_eff > 0 else 0
        ts_gk = norm(tr_gk, -30, 40) * 10
        hs_gk = 3 if len(sc_gk) >= 2 and sc_gk[0] >= 60 and sc_gk[1] >= 60 else 0
        cs_gk2 = -3 if len(sc_gk) >= 2 and sc_gk[0] < 35 and sc_gk[1] < 35 else 0
        mom_gk = ts_gk + hs_gk + cs_gk2 + 2
        dom_gk = 5 if is_home else -2

        goat_gk = 0
        if mp >= 5 and l25 >= 45:
            goat_gk += min(5, max(0, (l25 - 40) / 2.5))
            goat_gk += min(2, max(0, (_floor - 20) / 10))
            goat_gk += 2 if _reg >= 80 else (1 if _reg >= 50 else 0)

        raw_gk = socle_gk + ctx_gk + mom_gk + dom_gk + goat_gk + gk_sample + gk_inact_final
        min_gk = _floor / 100 * 50 if mp >= 5 else 0
        starter_floor_gk = 35 + min(15, round((p.get('aa10') or p.get('aa5') or 0) * 0.3) + round(ctx_gk * 0.2)) if starter_pct >= 70 else 0
        min_score_gk = max(min_gk, starter_floor_gk)
        ceil_gk = p.get('ceiling') or 100
        lost_cap = 35 if gk_lost and starter_pct < 70 else ceil_gk
        clamped_gk = max(min_score_gk, min(lost_cap, raw_gk))
        compressed_gk = clamped_gk if clamped_gk <= 55 else 55 + (clamped_gk - 55) * 0.65
        return round(compressed_gk)

    # OUTFIELD
    f = norm(l_eff, 25, 80)
    lb = norm(l25, 30, 80) * 5 if l25 > l_eff else 0
    aa = norm(aa_eff, -5, 35)
    fl = norm(_floor, 15, 70)
    rg = norm(_reg, 0, 100)
    gb = norm(p.get('ga_per_match') or 0, 0, 0.8) * 6
    socle = f*13 + lb + aa*12 + fl*7 + rg*7 + gb

    ppda = o.get('ppda_ext' if is_home else 'ppda_dom', 12)
    xga = o.get('xga_ext' if is_home else 'xga_dom', 1.3)
    opp_xg = o.get('xg_ext' if is_home else 'xg_dom', 1.3)

    contexte = 0
    if pos == "DEF":
        def_xga = (player_team.get('xga_dom' if is_home else 'xga_ext', 1.3)) if player_team else 1.3
        def_lam = max(0.5, min(2.0, (def_xga * opp_xg) / LG_AVG_XG.get(p.get('league'), 1.5)))
        def_cs = math.exp(-def_lam)
        cs_exp = def_cs * 10
        cs_score = norm(cs_exp, 0, 8) * 26
        ppda_score = (norm(ppda, 7, 20, True) if aa_eff > 18 else norm(ppda, 7, 20)) * 14
        form_score = norm(l_eff, 20, 75) * 10
        contexte = cs_score + ppda_score + form_score
    elif pos == "MIL":
        mp_ = max(0, p.get('aa_passing') or 0)
        mo_ = max(0, p.get('aa_possession') or 0)
        ma_ = max(0, p.get('aa_attacking') or 0)
        md_ = max(0, p.get('aa_defending') or 0)
        mt_ = mp_ + mo_ + ma_ + md_ or 1
        m_crea = (mp_ + mo_) / mt_
        m_ppda_crea = norm(ppda, 7, 20)
        m_ppda_fin = norm(ppda, 7, 20, True)
        m_ppda_blend = m_ppda_crea * m_crea + m_ppda_fin * (1 - m_crea)
        concede = norm(opp_xg, 0.8, 2.5, True) * 8
        quality = min(1.0, max(0.6, l_eff * 0.6 / 70 + aa_eff * 0.4 / 20))
        if aa_eff >= 10:
            ctx_raw = m_ppda_blend*22 + norm(xga, 0.8, 2)*10 + concede + norm(l_eff, 25, 75)*14
        else:
            ctx_raw = norm(xga, 0.8, 2)*10 + norm(ppda, 7, 20, True)*8 + concede + norm(l_eff, 20, 80)*22
        contexte = ctx_raw * quality
    else:  # ATT
        ap_ = max(0, p.get('aa_passing') or 0)
        ao_ = max(0, p.get('aa_possession') or 0)
        aa_ = max(0, p.get('aa_attacking') or 0)
        ad_ = max(0, p.get('aa_defending') or 0)
        at_ = ap_ + ao_ + aa_ + ad_ or 1
        crea_pct = (ap_ + ao_) / at_
        fin_pct = aa_ / at_
        ftp = p.get('final_third_passes_avg') or 0
        gpm = (p.get('goals') or 0) / max(1, p.get('appearances') or 1)
        poss_pct = ao_ / at_
        is_pivot = poss_pct >= 0.40 and ftp < 6 and fin_pct >= 0.2
        is_drib = not is_pivot and ftp >= 9 and gpm < 0.55 and fin_pct >= 0.2
        ppda_crea = norm(ppda, 7, 20)
        ppda_fin = norm(ppda, 7, 20, True)
        ppda_drib = (ppda_crea + ppda_fin) / 2 + (0.15 if ppda < 12 else 0)
        ppda_pivot = (ppda_crea + ppda_fin) / 2
        ppda_blend = ppda_pivot if is_pivot else (ppda_drib if is_drib else ppda_crea * crea_pct + ppda_fin * fin_pct + (ppda_crea + ppda_fin) / 2 * (1 - crea_pct - fin_pct))
        if aa_eff >= 8:
            contexte = norm(xga, 0.8, 2)*24 + ppda_blend*12 + norm(l_eff, 20, 80)*14
        else:
            contexte = norm(xga, 0.8, 2)*25 + ppda_fin*14 + norm(l_eff, 20, 80)*11

    # Momentum
    sc = [s for s in (p.get('last_5') or []) if s > 0]
    l2 = (sc[0] + sc[1]) / 2 if len(sc) >= 2 else (sc[0] if sc else l_eff)
    tr = (l2 - l_eff) / l_eff * 100 if l_eff > 0 else 0
    ts = norm(tr, -30, 40) * 10
    hs = 3 if len(sc) >= 2 and sc[0] >= 65 and sc[1] >= 65 else 0
    cs2 = -3 if len(sc) >= 2 and sc[0] < 40 and sc[1] < 40 else 0
    momentum = ts + hs + cs2 + 2
    if l25 > 60 and momentum < 0:
        momentum = momentum * (1 - blend_w)

    dom_bonus = 5 if is_home else -3

    # Pivot malus
    pivot_malus = 0
    if pos == "ATT":
        po2 = max(0, p.get('aa_possession') or 0)
        pa2 = max(0, p.get('aa_attacking') or 0)
        pt2 = (max(0, p.get('aa_passing') or 0) + po2 + pa2 + max(0, p.get('aa_defending') or 0)) or 1
        if po2/pt2 >= 0.40 and (p.get('final_third_passes_avg') or 0) < 6 and pa2/pt2 >= 0.2:
            pivot_malus = -4

    # Domination bonus
    dom_b = 0
    is_atk_def = "Lat" in (p.get('archetype') or '') and aa_eff > 15
    if player_team and (pos == "MIL" or is_atk_def):
        team_xg = player_team.get('xg_dom' if is_home else 'xg_ext', 1.3)
        opp_xg_ctx = o.get('xg_ext' if is_home else 'xg_dom', 1.3)
        gap = team_xg - opp_xg_ctx
        if gap > 0.5:
            eff_gap = gap - 0.5
            aa_scale = min(1.5, (p.get('aa5') or 0) / 20)
            cap_b = (6 if is_atk_def else 10) if is_home else (8 if aa_eff >= 15 else 0)
            dom_b = min(cap_b, eff_gap * 14 * aa_scale)

    # GOAT season bonus
    goat_season = 0
    if mp >= 5 and l25 >= 64:
        gs1 = max(0, (l25 - 55) / 2)
        gs2 = max(0, ((p.get('ceiling') or 0) - 70) / 8)
        gs3 = (p.get('ga_per_match') or 0) / 0.25
        gs4 = (aa25 - _aa5) / 2 if aa25 > _aa5 else 0
        if pos == "ATT":
            goat_season = min(7, gs1) + min(3, gs2) + min(2, gs3) + min(2, gs4)
        elif pos == "MIL":
            goat_season = min(5, gs1) + min(2, gs2) + min(2, gs3) + min(1, gs4)
        elif pos == "DEF":
            goat_season = min(3, gs1) + min(1, gs2) + min(1, gs4)

    recency = 0  # skip for now

    raw_base = socle + contexte + momentum + dom_bonus + pivot_malus + dom_b + goat_season + sample_penalty + inactivity + recency
    extra_goat = 6 if is_extra_goat(p) and raw_base <= 85 else 0
    raw = raw_base + extra_goat

    opp_xg_b = o.get('xg_ext' if is_home else 'xg_dom', 1.3)
    cf = max(0, min(1, (opp_xg_b - 0.8) / 1.2))
    damp = max(0, 1 - (raw - 45) / 40)
    decisive = min(18, (p.get('ga_per_match') or 0) * 45 * cf * damp) if pos != "GK" else 0
    raw_wb = raw + decisive

    quality_floor = _floor / 100 * 55 if mp >= 5 else 0
    is_inj_ret = 1 <= mp < 4
    eg_floor = 67 + max(0, momentum) + max(0, dom_bonus) + dom_b + round(contexte * 0.35) if is_extra_goat(p) and is_inj_ret else 0
    s_floor = 35 + min(15, round((p.get('aa10') or p.get('aa5') or 0) * 0.3) + round(contexte * 0.2)) if starter_pct >= 70 else 0
    min_s = min(100, max(quality_floor, eg_floor, s_floor))

    clamped = max(min_s, min(100, raw_wb))
    compressed = clamped if clamped <= 55 else 55 + (clamped - 55) * 0.65
    return round(compressed)


# ═══ ANALYSE ═══
print("=" * 80)
print("  ANALYSE D-SCORE MATCH vs SCORE REEL — GW en cours (Ven-Dim)")
print("=" * 80)

results = []
for p in players:
    score = p.get('last_so5_score')
    if score is None or score <= 0: continue
    f = pf.get(p.get('slug')) or pf.get(p.get('name'))
    if not f: continue

    lg_teams = [t for t in teams if t.get('league') == p.get('league')]
    opp = find_team(lg_teams, f.get('opp', ''))
    if not opp: continue
    pt = find_team(lg_teams, p.get('club', ''))

    ds = d_score_match(p, opp, f.get('isHome', False), pt)
    results.append({
        'name': p['name'], 'position': p.get('position'), 'archetype': p.get('archetype', ''),
        'ds': ds, 'score': score, 'diff': score - ds,
        'l10': p.get('l10', 0) or 0, 'league': p.get('league'),
    })

print(f"\nJoueurs analyses: {len(results)}")

# GLOBAL
diffs = [r['diff'] for r in results]
abs_diffs = [abs(d) for d in diffs]
print(f"\n{'='*60}")
print(f"  GLOBAL")
print(f"{'='*60}")
print(f"  D-Score moyen:    {sum(r['ds'] for r in results)/len(results):.1f}")
print(f"  Score reel moyen: {sum(r['score'] for r in results)/len(results):.1f}")
print(f"  Diff moyenne:     {sum(diffs)/len(diffs):+.1f}")
print(f"  Ecart absolu moy: {sum(abs_diffs)/len(abs_diffs):.1f}")
print(f"  Ecart-type:       {(sum((d - sum(diffs)/len(diffs))**2 for d in diffs)/len(diffs))**0.5:.1f}")
w10 = sum(1 for d in abs_diffs if d <= 10)
w15 = sum(1 for d in abs_diffs if d <= 15)
w20 = sum(1 for d in abs_diffs if d <= 20)
print(f"  Precision +-10:   {w10/len(results)*100:.1f}%")
print(f"  Precision +-15:   {w15/len(results)*100:.1f}%")
print(f"  Precision +-20:   {w20/len(results)*100:.1f}%")

# PAR LIGUE
print(f"\n{'='*60}")
print(f"  PAR LIGUE")
print(f"{'='*60}")
for lg in ['L1', 'PL', 'Liga', 'Bundes', 'MLS']:
    sub = [r for r in results if r['league'] == lg]
    if not sub: continue
    d = [r['diff'] for r in sub]
    ad = [abs(x) for x in d]
    print(f"  {lg:6s}: {len(sub):3d} joueurs | DS moy: {sum(r['ds'] for r in sub)/len(sub):5.1f} | Score: {sum(r['score'] for r in sub)/len(sub):5.1f} | Diff: {sum(d)/len(d):+5.1f} | Ecart abs: {sum(ad)/len(ad):5.1f}")

# PAR POSITION
print(f"\n{'='*60}")
print(f"  PAR POSITION")
print(f"{'='*60}")
for pos in ['GK', 'DEF', 'MIL', 'ATT']:
    sub = [r for r in results if r['position'] == pos]
    if not sub: continue
    d = [r['diff'] for r in sub]
    ad = [abs(x) for x in d]
    print(f"  {pos:3s}: {len(sub):3d} joueurs | DS moy: {sum(r['ds'] for r in sub)/len(sub):5.1f} | Score: {sum(r['score'] for r in sub)/len(sub):5.1f} | Diff: {sum(d)/len(d):+5.1f} | Ecart abs: {sum(ad)/len(ad):5.1f}")

# PAR TRANCHE D-SCORE
print(f"\n{'='*60}")
print(f"  PAR TRANCHE D-SCORE")
print(f"{'='*60}")
for lo, hi in [(0,30),(30,40),(40,50),(50,60),(60,70),(70,80),(80,90),(90,101)]:
    sub = [r for r in results if lo <= r['ds'] < hi]
    if not sub: continue
    d = [r['diff'] for r in sub]
    ad = [abs(x) for x in d]
    label = f"[{lo:2d}-{hi:2d}["
    print(f"  DS {label}: {len(sub):3d} joueurs | DS moy: {sum(r['ds'] for r in sub)/len(sub):5.1f} | Score: {sum(r['score'] for r in sub)/len(sub):5.1f} | Diff: {sum(d)/len(d):+5.1f} | Ecart abs: {sum(ad)/len(ad):5.1f}")

# PAR ARCHETYPE
print(f"\n{'='*60}")
print(f"  PAR ARCHETYPE")
print(f"{'='*60}")
from collections import defaultdict
arch_stats = defaultdict(list)
for r in results:
    if r['archetype']:
        arch_stats[r['archetype']].append(r)
for arch, sub in sorted(arch_stats.items(), key=lambda x: -len(x[1])):
    if len(sub) < 5: continue
    d = [r['diff'] for r in sub]
    ad = [abs(x) for x in d]
    pos = sub[0]['position']
    print(f"  {pos:3s} {arch:25s}: {len(sub):3d} | DS: {sum(r['ds'] for r in sub)/len(sub):5.1f} | Score: {sum(r['score'] for r in sub)/len(sub):5.1f} | Diff: {sum(d)/len(d):+5.1f} | Ecart: {sum(ad)/len(ad):5.1f}")

# TOP D-SCORE >= 80
print(f"\n{'='*60}")
print(f"  TOP D-SCORE >= 80 — Detail")
print(f"{'='*60}")
top = sorted([r for r in results if r['ds'] >= 80], key=lambda x: -x['ds'])
for r in top[:25]:
    emoji = "✅" if abs(r['diff']) <= 15 else ("⚠️" if abs(r['diff']) <= 25 else "❌")
    print(f"  {emoji} {r['name']:25s} {r['position']:3s} | DS={r['ds']:3d} Score={r['score']:5.1f} Diff={r['diff']:+5.1f} | {r['archetype']}")

# TOP D-SCORE >= 70 underperformers
print(f"\n{'='*60}")
print(f"  UNDERPERFORMERS — DS >= 70 mais Score < 50")
print(f"{'='*60}")
under = sorted([r for r in results if r['ds'] >= 70 and r['score'] < 50], key=lambda x: x['diff'])
for r in under[:20]:
    print(f"  ❌ {r['name']:25s} {r['position']:3s} | DS={r['ds']:3d} Score={r['score']:5.1f} Diff={r['diff']:+5.1f} | {r['archetype']}")
