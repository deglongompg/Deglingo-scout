#!/usr/bin/env python3
"""
Deglingo Scout — Reclassification V3
Applique les nouveaux seuils MIL/ATT basés sur le detailedScore.
Input:  4 fichiers JSON (L1, PL, Liga, Bundesliga)
Output: 4 fichiers JSON reclassifiés + rapport de changements
"""

import json
import os
import sys
from datetime import datetime

# =====================================================
# CLASSIFICATION MIL V3
# =====================================================
def classify_mil_v3(p):
    aa5 = p.get('aa5', 0) or 0
    dsr = p.get('ds_rate', 0) or 0
    reg = p.get('regularite', 0) or 0
    ecart = p.get('ecart_5', 0) or 0
    aa_def = p.get('aa_defending', 0) or 0
    aa_pass = p.get('aa_passing', 0) or 0
    aa_poss = p.get('aa_possession', 0) or 0
    aa_att = p.get('aa_attacking', 0) or 0
    ftp = p.get('final_third_passes_avg', 0) or 0
    appearances = max(p.get('appearances', 1) or 1, 1)
    ga = (p.get('goals', 0) + p.get('assists', 0)) / appearances
    has_ds = (aa_def + aa_pass + aa_poss + aa_att) > 0

    # 1. GOAT — monstre AA (score ou régularité)
    if aa5 >= 18 and (dsr >= 20 or reg >= 50):
        return "MIL GOAT"

    if has_ds:
        # 2. RELANCEUR — passing domine largement
        if aa_pass >= 12 and aa_pass > (aa_def + aa_poss):
            return "MIL Relanceur"

        # 3. RÉCUP — possession + defending dominent, peu d'attacking
        if (aa_def + aa_poss) > (aa_pass + aa_att) and (aa_poss >= 8 or aa_def >= 5):
            return "MIL Récup"

        # 4. B2B — équilibré, bon AA, régulier
        if aa_pass >= 6 and aa_att >= 3 and aa_poss >= 5 and aa5 >= 10 and reg >= 40:
            return "MIL B2B"

        # 5. CRÉATEUR — offensif, haut FTP ou décisif
        if (aa_att >= 3 or ga >= 0.20) and (ftp >= 8 or aa_pass >= 8):
            if aa5 >= 8 or reg >= 30:
                return "MIL Créateur"

        # 6. DRIBBLEUR — haut attacking, volatile
        if aa_att >= 5:
            return "MIL Dribbleur"

    else:
        # Fallback sans detailedScore
        if aa5 >= 18 and reg >= 50:
            return "MIL GOAT"
        if aa5 >= 10 and reg >= 70 and dsr < 20:
            return "MIL Récup"
        if aa5 >= 10 and dsr >= 20 and reg >= 60:
            return "MIL B2B"
        if dsr >= 30 or ga >= 0.25:
            return "MIL Créateur"

    return "MIL Rotation"


# =====================================================
# CLASSIFICATION ATT V3
# =====================================================
def classify_att_v3(p):
    aa5 = p.get('aa5', 0) or 0
    dsr = p.get('ds_rate', 0) or 0
    reg = p.get('regularite', 0) or 0
    ecart = p.get('ecart_5', 0) or 0
    aa_def = p.get('aa_defending', 0) or 0
    aa_pass = p.get('aa_passing', 0) or 0
    aa_poss = p.get('aa_possession', 0) or 0
    aa_att = p.get('aa_attacking', 0) or 0
    ftp = p.get('final_third_passes_avg', 0) or 0
    appearances = max(p.get('appearances', 1) or 1, 1)
    ga = (p.get('goals', 0) + p.get('assists', 0)) / appearances
    has_ds = (aa_def + aa_pass + aa_poss + aa_att) > 0
    aa_total = aa_pass + aa_poss + aa_att

    # 1. GOAT — haut AA + régulier + décisif
    if aa5 >= 12 and reg >= 70 and (dsr >= 30 or ga >= 0.35):
        return "ATT GOAT"

    # 2. COMPLET — bon AA + régulier
    if aa5 >= 8 and reg >= 60:
        return "ATT Complet"

    if has_ds:
        # 3. DRIBBLEUR — haut attacking
        if aa_att >= 5:
            return "ATT Dribbleur"

        # 4. CRÉATEUR — passe et crée, FTP élevé
        if aa_pass >= 6 and ftp >= 6:
            return "ATT Créateur"

        # 5. FINISSEUR — dépend du DS, faible AA
        if aa_total < 10:
            return "ATT Finisseur"

        # 6. Profil hybride — AA total correct mais pas de dominante
        if aa_total >= 10:
            if reg >= 40 or aa5 >= 6:
                return "ATT Complet"
            return "ATT Dribbleur"

    else:
        # Fallback sans detailedScore
        if ga >= 0.40:
            return "ATT Finisseur"
        if aa5 >= 8 and reg >= 50:
            return "ATT Complet"

    return "ATT Rotation"


# =====================================================
# CLASSIFICATION DEF (inchangée — rappel pour complétude)
# =====================================================
def classify_def_v3(p):
    aa5 = p.get('aa5', 0) or 0
    dsr = p.get('ds_rate', 0) or 0
    aa_def = p.get('aa_defending', 0) or 0
    aa_pass = p.get('aa_passing', 0) or 0
    aa_poss = p.get('aa_possession', 0) or 0
    aa_att = p.get('aa_attacking', 0) or 0
    ftp = p.get('final_third_passes_avg', 0) or 0
    has_ds = (aa_def + aa_pass + aa_poss + aa_att) > 0

    if has_ds:
        # Score latéral vs central
        ftp_norm = min(ftp / 15, 1)
        aa_att_norm = min(aa_att / 5, 1)
        dsr_norm = min(dsr / 40, 1)
        aa_pass_norm = min(aa_pass / 15, 1)
        aa_def_norm = min(aa_def / 10, 1)

        lat_score = ftp_norm * 30 + aa_att_norm * 20 + dsr_norm * 20 + aa_pass_norm * 15
        cen_score = aa_def_norm * 30 + (1 - min(ftp / 10, 1)) * 20 + (1 - min(aa_att / 3, 1)) * 15

        if lat_score > cen_score + 10:
            return "DEF Latéral"
        else:
            return "DEF Central"
    else:
        # Fallback
        ecart = p.get('ecart_5', 0) or 0
        if ecart > 20 or (aa5 > 18 and dsr > 25):
            return "DEF Latéral"
        return "DEF Central"


# =====================================================
# GK (inchangé)
# =====================================================
def classify_gk(p):
    return "GK"


# =====================================================
# DISPATCHER
# =====================================================
def classify_v3(p):
    pos = p.get('position', '')
    if pos == 'Goalkeeper':
        return classify_gk(p)
    elif pos == 'Defender':
        return classify_def_v3(p)
    elif pos == 'Midfielder':
        return classify_mil_v3(p)
    elif pos == 'Forward':
        return classify_att_v3(p)
    return "UNKNOWN"


# =====================================================
# MAIN
# =====================================================
def main():
    INPUT_DIR = "/mnt/user-data/uploads"
    OUTPUT_DIR = "/home/claude"

    files = {
        "Ligue 1": "deglingo_ligue1_final.json",
        "Premier League": "deglingo_premier_league_final.json",
        "La Liga": "deglingo_la_liga_final.json",
        "Bundesliga": "deglingo_bundesliga_final.json",
    }

    total_changes = 0
    total_players = 0
    report = []
    report.append(f"{'='*70}")
    report.append(f"DEGLINGO SCOUT — RECLASSIFICATION V3")
    report.append(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    report.append(f"{'='*70}\n")

    all_old = {}
    all_new = {}

    for league, filename in files.items():
        filepath = os.path.join(INPUT_DIR, filename)
        with open(filepath, 'r') as f:
            players = json.load(f)

        changes = []
        for p in players:
            old_arch = p.get('archetype', 'N/A')
            new_arch = classify_v3(p)

            if old_arch != new_arch:
                changes.append({
                    'name': p.get('name', '?'),
                    'club': p.get('club', '?'),
                    'position': p.get('position', '?'),
                    'old': old_arch,
                    'new': new_arch,
                    'aa5': p.get('aa5', 0),
                })

            # Stocker les comptages
            all_old[old_arch] = all_old.get(old_arch, 0) + 1
            all_new[new_arch] = all_new.get(new_arch, 0) + 1

            p['archetype'] = new_arch

        # Sauvegarder
        output_path = os.path.join(OUTPUT_DIR, filename)
        with open(output_path, 'w') as f:
            json.dump(players, f, ensure_ascii=False, indent=2)

        total_changes += len(changes)
        total_players += len(players)

        report.append(f"--- {league} ({filename}) ---")
        report.append(f"  Joueurs: {len(players)} | Changements: {len(changes)}")

        # Résumé des changements par transition
        transitions = {}
        for c in changes:
            key = f"{c['old']} → {c['new']}"
            transitions.setdefault(key, []).append(c['name'])

        for trans, names in sorted(transitions.items(), key=lambda x: -len(x[1])):
            report.append(f"  {trans}: {len(names)}")
            for n in names[:5]:
                report.append(f"    - {n}")
            if len(names) > 5:
                report.append(f"    ... et {len(names)-5} autres")
        report.append("")

    # Résumé global
    report.append(f"\n{'='*70}")
    report.append(f"RÉSUMÉ GLOBAL")
    report.append(f"{'='*70}")
    report.append(f"Total joueurs: {total_players}")
    report.append(f"Total changements: {total_changes} ({total_changes/total_players*100:.1f}%)\n")

    report.append(f"{'Archétype':<20s} {'V1 (ancien)':>12s} {'V3 (nouveau)':>12s} {'Delta':>8s}")
    report.append(f"{'-'*52}")
    all_archs = sorted(set(list(all_old.keys()) + list(all_new.keys())))
    for arch in all_archs:
        old = all_old.get(arch, 0)
        new = all_new.get(arch, 0)
        delta = new - old
        sign = "+" if delta > 0 else ""
        report.append(f"  {arch:<20s} {old:>10d} {new:>10d} {sign}{delta:>7d}")

    report_text = "\n".join(report)
    print(report_text)

    # Sauvegarder le rapport
    with open(os.path.join(OUTPUT_DIR, "reclassification_v3_report.txt"), 'w') as f:
        f.write(report_text)

    # Copier les fichiers vers outputs
    for filename in files.values():
        src = os.path.join(OUTPUT_DIR, filename)
        dst = os.path.join("/mnt/user-data/outputs", filename)
        with open(src, 'r') as f:
            data = f.read()
        with open(dst, 'w') as f:
            f.write(data)

    print(f"\n✅ 4 fichiers reclassifiés sauvegardés dans /mnt/user-data/outputs/")


if __name__ == "__main__":
    main()
