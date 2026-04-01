// Normalize name for fuzzy matching (remove accents, hyphens, dots, lowercase)
function normName(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-.']/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

// ─── EXTRA GOAT — tier manuel au-dessus de GOAT ─────────────────────────────
// 8 joueurs définis manuellement selon Sorare : top prix du marché,
// capables de tout casser peu importe le calendrier → +8 pts flat.
// Règle : pas de bonus si le D-Score brut est déjà > 85.
const EXTRA_GOAT_SET = new Set([
  // Tier prix top marché (L40 Sorare >= 65) — màj mensuelle
  "lamine yamal", "michael olise", "kylian mbappe",
  "harry kane", "pedri", "joshua kimmich",
  "vitinha", "bruno fernandes",
  // Ajout mars 2026
  "nico schlotterbeck", "gabriel magalhaes",
  "alejandro grimaldo", "dominik szoboszlai",
  "luis diaz", "achraf hakimi",
  "maximilian mittelstadt", "nuno mendes",
]);
export function isExtraGoat(p) {
  if (!p?.name) return false;
  const n = p.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[-.']/g," ").replace(/\s+/g," ").trim().toLowerCase();
  return EXTRA_GOAT_SET.has(n);
}
// ─────────────────────────────────────────────────────────────────────────────

// Find a team in the teams array by player club name (handles PSG/Bayern/etc mismatches)
export function findTeam(teams, club) {
  if (!teams || !club) return null;
  // Direct includes (both directions)
  let t = teams.find(t => club.includes(t.name) || t.name.includes(club));
  if (t) return t;
  // Normalized match
  const nc = normName(club);
  t = teams.find(t => { const nt = normName(t.name); return nc.includes(nt) || nt.includes(nc); });
  if (t) return t;
  // First 2 words match (avoids "Paris" matching "Paris FC" for "Paris Saint-Germain")
  const words = nc.split(" ").slice(0, 2).join(" ");
  if (words.length > 4) {
    t = teams.find(t => normName(t.name).startsWith(words));
    if (t) return t;
  }
  return null;
}

// League average xG for bookmaker-style lambda calculation
const LG_AVG_XG = { PL: 1.51, L1: 1.49, Liga: 1.52, Bundes: 1.65 };

// Clean Sheet probability (Poisson bookmaker method)
// lambda = xGA_defender × xG_attacker / league_avg
// P(CS) = e^(-lambda)
export function csProb(defXga, oppXg, league) {
  const avg = LG_AVG_XG[league] || 1.50;
  const rawLambda = (defXga * oppXg) / avg;
  // Clamp lambda [0.5, 2.0] → CS range ~13%-61% (matches bookmaker odds)
  const lambda = Math.max(0.5, Math.min(2.0, rawLambda));
  return Math.round(Math.exp(-lambda) * 100);
}

export function norm(v, lo, hi, inv = false) {
  if (hi === lo) return 0.5;
  let n = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return inv ? 1 - n : n;
}

export function dScoreMatch(player, opp, isHome, playerTeam = null) {
  const p = player;
  const o = opp;

  // ─── NULL SAFETY: évite NaN si données manquantes ───
  const _l5  = p.l5 || 0;
  const _aa5 = p.aa5 || 0;
  const _reg = p.regularite || 0;
  const _floor = p.min_15 ?? p.floor ?? 0;

  // ─── GHOST PLAYER FILTER: joueur sans données récentes = D-Score minimal ───
  // Si L5=0 ET L10=0 ET Titu=0% → le joueur n'a pas joué, on ne prédit rien
  const hasRecentData = _l5 > 0 || (p.l10 || 0) > 0;
  const tituPct = p.titu_pct || 0;
  if (!hasRecentData && tituPct === 0) {
    // Score minimal basé uniquement sur le contexte adversaire (pour ne pas afficher 0)
    // mais plafonné à 15 max — ce joueur ne devrait jamais être recommandé
    return Math.min(15, Math.round((p.ga_per_match || 0) * 20));
  }

  // ─── INACTIVITY PENALTY: joueur qui ne joue presque plus ───
  // Titu < 20% sur L10 = rotation/blessé → forte pénalité
  const inactivityPenalty = tituPct >= 50 ? 0 : tituPct >= 30 ? -8 : tituPct >= 10 ? -18 : tituPct > 0 ? -28 : -35;

  // ─── SAMPLE SIZE PENALTY: évite les Pinnock (1 match = 92 → faux GOAT) ───
  const mp = p.matchs_played || p.last_5?.filter(s => s > 0)?.length || 0;
  // Réduit si titu élevé (joueur régulier pénalisé par limite API, pas par vraie incertitude)
  const sampleBase = mp >= 5 ? 0 : mp >= 3 ? -5 : mp >= 2 ? -12 : -20;
  const samplePenalty = tituPct >= 70 && mp >= 3 ? Math.round(sampleBase / 2) : sampleBase;

  // ─── SEASON BLEND: protège les GOATs contre un mauvais match récent ───
  // L25/AA25 = saison longue (l10 en approx, l25 quand dispo)
  const l25  = p.l25 || p.l10 || _l5;
  const aa25 = p.aa10 || _aa5;
  // Poids saison: L25 > 50 → commence à blender, cap 0.6 à L25=74+
  const blendW = l25 < 50 ? 0 : Math.min(0.6, (l25 - 50) / 40);
  const lEff  = _l5 * (1 - blendW) + l25 * blendW;
  const aaEff = _aa5 * (1 - blendW) + aa25 * blendW;

  // ─── GK-SPECIFIC ALGORITHM ───
  if (p.position === "GK") {
    const oppXgGK = isHome ? o.xg_ext : o.xg_dom;
    const ppdaGK = isHome ? o.ppda_ext : o.ppda_dom;
    const defXgaGK = playerTeam ? (isHome ? (playerTeam.xga_dom || 1.3) : (playerTeam.xga_ext || 1.5)) : 1.3;
    const avgXg = LG_AVG_XG[p.league] || 1.50;
    const rawLambda = (defXgaGK * oppXgGK) / avgXg;
    const lambda = Math.max(0.5, Math.min(2.0, rawLambda));
    const csProbGK = Math.exp(-lambda) * 100;

    // STARTER DETECTION — pour les GK, regarder les 3 matchs les plus récents (index 0,1,2)
    // last_5[0] = match le plus récent, inclut DNP=0
    // 2+ non-zéros dans les 3 derniers = titulaire actuel → pas de pénalité
    // 1 non-zéro dans les 3 derniers = partagé/incertain → petite pénalité
    // 0 non-zéros dans les 3 derniers MAIS jouait avant = a perdu sa place → pénalité supplémentaire
    const last5arr = p.last_5 || [];
    const gkRecentPlays = last5arr.slice(0, 3).filter(s => s > 0).length;
    const gkLostSpot = last5arr[0] === 0 && last5arr[1] === 0 && last5arr.some(s => s > 0);
    const gkInactivityPenalty = gkRecentPlays >= 2 ? 0
      : gkRecentPlays >= 1 ? -5
      : gkLostSpot ? Math.min(inactivityPenalty - 10, -10)
      : inactivityPenalty;

    // BASE FORME GK — L40 comme référence principale quand données récentes sparse
    // Un GK backup qui prend la place après 1 match a L40 qui prouve sa vraie qualité
    const l40GK = p.l40 || 0;
    const hasL40 = l40GK > 0;
    // Si L40 connu et GK joue actuellement → blender L40 (70%) + L5 récent (30%)
    // Si L40 connu mais 0 match récent → utiliser L40 pur (forma établie historiquement)
    const lEffGK = hasL40 && gkRecentPlays >= 1
      ? _l5 * 0.3 + l40GK * 0.7
      : hasL40 ? l40GK * 0.85
      : lEff;
    // AA: même logique — aa40 comme base si sparse
    const aa40GK = p.aa40 || 0;
    const aaEffGK = hasL40 && aa40GK > 0 && gkRecentPlays <= 1
      ? aaEff * 0.4 + aa40GK * 0.6
      : aaEff;
    // Sample + inactivité : si L40 connu ET GK joue actuellement → qualité établie, 0 pénalité
    // L40 = référence Sorare officielle sur 40 matchs → on sait ce que vaut ce GK
    const gkSamplePenalty = (hasL40 && gkRecentPlays >= 1) ? 0
      : gkRecentPlays >= 2 ? Math.round(samplePenalty * 0.4)
      : hasL40 ? Math.round(samplePenalty * 0.5)
      : samplePenalty;
    // Même logique pour inactivity : L40 connu + joue actuellement → 0 pénalité historique
    const gkInactivityPenaltyFinal = (hasL40 && gkRecentPlays >= 1) ? 0 : gkInactivityPenalty;

    // SOCLE GK (40 pts max) — forme + AA (range GK: -20 à +15) + floor + régularité
    const fGK = norm(lEffGK, 20, 70) * 14;
    const aaGK = norm(aaEffGK, -20, 15) * 10;  // GK AA range: négatif = buts encaissés, positif = arrêts
    const flGK = norm(_floor, 10, 60) * 8;
    const rgGK = norm(_reg, 0, 100) * 5;
    const l25GK = l25 > lEffGK ? norm(l25, 25, 70) * 3 : 0;
    const socleGK = fGK + aaGK + flGK + rgGK + l25GK;

    // CONTEXTE GK (50 pts max) — basé sur le scoring Sorare réel
    // Sur Sorare: CS = score passe de ~35 à ~60 (Decisive Score, pas AA)
    // But encaissé = -5 pts/but (Decisive Score)
    // Espérance CS: csProbGK × impact ~25 pts → normalisé sur plage réaliste
    const csExpectedValue = (csProbGK / 100) * 10; // espérance en pts Sorare (0 à 6 pts)
    const csBonus = norm(csExpectedValue, 0, 6) * 22;

    // Pénalité buts encaissés: oppXg dom/ext × -5 pts/but sur Sorare
    // oppXg 0.7 = -3.5 pts → super, oppXg 2.0 = -10 pts → catastrophe
    // Plus l'adversaire a un xG faible, mieux c'est
    const xgPenaltyScore = norm(oppXgGK, 0.5, 2.2, true) * 16;

    // Combo: xGA de l'équipe du GK (sa propre défense)
    // defXgaGK bas = bonne défense = moins de buts = protège le GK
    const ownDefense = norm(defXgaGK, 0.8, 2.0, true) * 6;

    // PPDA : pressing adverse = plus de tirs cadrés = plus d'arrêts = AA GK
    const savesBonus = norm(ppdaGK, 7, 20, true) * 6;
    const contexteGK = csBonus + xgPenaltyScore + ownDefense + savesBonus;

    // MOMENTUM GK (15 pts max)
    // Filtrer les 0s (DNP = non-titulaire) pour ne pas pénaliser un match non joué
    const scGK = (p.last_5 || []).filter(s => s > 0);
    const l2GK = scGK.length >= 2 ? (scGK[0] + scGK[1]) / 2 : (scGK[0] || lEff);
    const trGK = lEff > 0 ? (l2GK - lEff) / lEff * 100 : 0;
    const tsGK = norm(trGK, -30, 40) * 10;
    const hsGK = scGK.length >= 2 && scGK[0] >= 60 && scGK[1] >= 60 ? 3 : 0;
    const csGK = scGK.length >= 2 && scGK[0] < 35 && scGK[1] < 35 ? -3 : 0;
    const momentumGK = tsGK + hsGK + csGK + 2;

    // DOM/EXT
    const domBonusGK = isHome ? 5 : -2;

    // GOAT GK BONUS — GK régulier avec bon CS% sur la saison
    // Calibré pour que Safonov (l25=57, floor=34, reg=60%) atteigne max ~78
    let goatGK = 0;
    if (mp >= 5 && l25 >= 45) {
      goatGK += Math.min(5, Math.max(0, (l25 - 40) / 2.5));   // Saison solide (cap 5 vs 8 avant)
      goatGK += Math.min(2, Math.max(0, (_floor - 20) / 10));  // Floor GK (cap 2 vs 5 avant)
      goatGK += _reg >= 80 ? 2 : _reg >= 50 ? 1 : 0;          // Régularité (2:1:0 vs 4:2:0 avant)
    }

    const rawGK = socleGK + contexteGK + momentumGK + domBonusGK + goatGK + gkSamplePenalty + gkInactivityPenaltyFinal;
    const minScoreGK = mp >= 5 ? _floor / 100 * 50 : 0;
    // Un GK ne peut pas dépasser son ceiling historique (meilleur match récent)
    const ceilGK = p.ceiling || 100;
    // GK qui a perdu sa place (DNP 2 derniers matchs) → score plafonné à 42
    // Il ne jouera très probablement pas → D-Score élevé serait trompeur pour Sorare
    const gkLostSpotCap = gkLostSpot ? 35 : ceilGK;
    return Math.round(Math.max(minScoreGK, Math.min(gkLostSpotCap, rawGK)));
  }

  // ─── OUTFIELD PLAYERS ───
  // SOCLE (40%) — utilise lEff et aaEff au lieu de l5/aa5 bruts
  const f   = norm(lEff, 25, 80);
  const lb  = l25 > lEff ? norm(l25, 30, 80) * 5 : 0;
  const aa  = norm(aaEff, -5, 35);
  const fl  = norm(_floor, 15, 70);
  const rg  = norm(_reg, 0, 100);
  const gb  = norm(p.ga_per_match || 0, 0, 0.8) * 6;
  const socle = f*13 + lb + aa*12 + fl*7 + rg*7 + gb;

  // CONTEXTE (45%)
  const ppda = isHome ? o.ppda_ext : o.ppda_dom;
  const xga  = isHome ? o.xga_ext  : o.xga_dom;   // ce que l'adversaire ENCAISSE (pour ATT/MIL)
  const oppXg = isHome ? o.xg_ext  : o.xg_dom;     // ce que l'adversaire MARQUE (pour DEF/GK)
  const pos  = p.position;
  let contexte = 0;
  if (pos === "GK")
    // GK: oppXg élevé = buts encaissés (-10/but) = catastrophe
    // PPDA bas = pressing = plus de tirs cadrés = plus d'arrêts (neutre/positif pour AA GK)
    contexte = norm(oppXg, 0.8, 2.5, true)*22 + norm(ppda, 7, 20)*16 + norm(lEff, 20, 70)*12;
  else if (pos === "DEF") {
    // DEF: CS = +10 pts (decisive score), but encaissé = -4 pts/but
    // Espérance CS: prob × 10 pts → composante la plus importante du contexte DEF
    const defXgaDEF = playerTeam ? (isHome ? (playerTeam.xga_dom || 1.3) : (playerTeam.xga_ext || 1.5)) : 1.3;
    const defLambda = Math.max(0.5, Math.min(2.0, (defXgaDEF * oppXg) / (LG_AVG_XG[p.league] || 1.5)));
    const defCsProb = Math.exp(-defLambda); // 0-1
    const csExpDEF = defCsProb * 10; // espérance du +10 CS (ex: 50% CS = +5 pts attendus)
    const csScore = norm(csExpDEF, 0, 8) * 26; // CS = composante dominante pour DEF
    // PPDA: pressing = erreurs/cartons supplémentaires pour DEF offensif
    const ppdaScore = (aaEff > 18 ? norm(ppda, 7, 20, true) : norm(ppda, 7, 20)) * 14;
    const formScore = norm(lEff, 20, 75) * 10;
    contexte = csScore + ppdaScore + formScore;
  }
  else if (pos === "MIL") {
    // MIL: pas de CS bonus, but encaissé = -2 pts/but
    // oppXg élevé = risque de malus -2/but = composante défensive
    // xga (ce que l'adversaire encaisse) = opportunités offensives AA
    const _mP = Math.max(0, p.aa_passing || 0), _mO = Math.max(0, p.aa_possession || 0);
    const _mA = Math.max(0, p.aa_attacking || 0), _mD = Math.max(0, p.aa_defending || 0);
    const _mT = _mP + _mO + _mA + _mD || 1;
    const mCreaPct = (_mP + _mO) / _mT;
    const mPpdaCrea = norm(ppda, 7, 20);       // bloc bas = positif pour créateur
    const mPpdaFin  = norm(ppda, 7, 20, true); // pressing = positif pour finisseur
    const mPpdaBlend = mPpdaCrea * mCreaPct + mPpdaFin * (1 - mCreaPct);
    // Malus défensif: adversaire qui marque beaucoup = -2/but en Sorare
    const concedeMalusMIL = norm(oppXg, 0.8, 2.5, true) * 8; // pénalité si oppXg élevé
    // Quality scale: 60% forme + 40% AA — un MIL avec AA5=9 ne profite pas autant qu'un AA5=22
    // García (lEff=56, aa5=9)  → scale ~0.66 | Güler (lEff=67, aa5=22) → scale ~1.0
    const milQualityScale = Math.min(1.0, Math.max(0.6, lEff * 0.6 / 70 + aaEff * 0.4 / 20));
    const milContextRaw = aaEff >= 10
      ? mPpdaBlend*22 + norm(xga, 0.8, 2)*10 + concedeMalusMIL + norm(lEff, 25, 75)*14
      : norm(xga, 0.8, 2)*10 + norm(ppda, 7, 20, true)*8 + concedeMalusMIL + norm(lEff, 20, 80)*22;
    contexte = milContextRaw * milQualityScale;
  }
  else { // ATT — PPDA impact dépend du profil AA du joueur
    const _aP = Math.max(0, p.aa_passing || 0), _aO = Math.max(0, p.aa_possession || 0);
    const _aA = Math.max(0, p.aa_attacking || 0), _aD = Math.max(0, p.aa_defending || 0);
    const _aT = _aP + _aO + _aA + _aD || 1;
    const creaPct = (_aP + _aO) / _aT; // 0-1, % créateur (passes+poss)
    const finPct = _aA / _aT;           // 0-1, % finisseur (tirs/dribbles)
    // Profile detection
    const ftp = p.final_third_passes_avg || 0;
    const gpm = (p.goals || 0) / (p.appearances || 1);
    const possPct = _aO / _aT;
    const isPivot = possPct >= 0.40 && ftp < 6 && finPct >= 0.2;
    const isDribbleur = !isPivot && ftp >= 9 && gpm < 0.55 && finPct >= 0.2;
    // Créateur: bloc bas = POSITIF, Finisseur: bloc bas = NÉGATIF
    const ppdaCrea = norm(ppda, 7, 20);       // bloc bas = haut score = positif
    const ppdaFin  = norm(ppda, 7, 20, true); // bloc bas = bas score = négatif
    // Dribbleur: pressing = jackpot (espaces), bloc bas = neutre
    const ppdaDrib = (ppdaCrea + ppdaFin) / 2 + (ppda < 12 ? 0.15 : 0);
    // Pivot: bloc bas = neutre (plus de centres MAIS surface compacte → s'annule)
    const ppdaPivot = (ppdaCrea + ppdaFin) / 2; // strict neutre
    const ppdaBlend = isPivot ? ppdaPivot
      : isDribbleur ? ppdaDrib
      : ppdaCrea * creaPct + ppdaFin * finPct + (ppdaCrea + ppdaFin) / 2 * (1 - creaPct - finPct);
    contexte = aaEff >= 8
      ? norm(xga, 0.8, 2)*24 + ppdaBlend*12 + norm(lEff, 20, 80)*14
      : norm(xga, 0.8, 2)*25 + ppdaFin*14   + norm(lEff, 20, 80)*11;
  }

  // MOMENTUM (15%) — amorti pour les GOATs saison
  // Filtrer les 0s (DNP = non-titulaire) pour ne pas pénaliser un match non joué
  const sc   = (p.last_5 || []).filter(s => s > 0);
  const l2   = sc.length >= 2 ? (sc[0] + sc[1]) / 2 : (sc[0] || lEff);
  const tr   = lEff > 0 ? (l2 - lEff) / lEff * 100 : 0;
  const ts   = norm(tr, -30, 40) * 10;
  const hs   = sc.length >= 2 && sc[0] >= 65 && sc[1] >= 65 ? 3 : 0;
  const cs   = sc.length >= 2 && sc[0] < 40  && sc[1] < 40  ? -3 : 0;
  let momentum = ts + hs + cs + 2;
  // Amortissement: un GOAT saison (L25>60) ne se fait pas punir autant
  if (l25 > 60 && momentum < 0) {
    momentum = momentum * (1 - blendW); // réduit la pénalité proportionnellement
  }

  // DOM/EXT
  const domBonus = isHome ? 5 : -3;

  // PIVOT ANTI-META MALUS — AA5 structurellement bas (~3), dépend du décisif pour >60pts
  let pivotMalus = 0;
  if (p.position === "ATT") {
    const _pO2 = Math.max(0, p.aa_possession || 0);
    const _pA2 = Math.max(0, p.aa_attacking || 0);
    const _pT2 = (Math.max(0, p.aa_passing || 0) + _pO2 + _pA2 + Math.max(0, p.aa_defending || 0)) || 1;
    const _possPct2 = _pO2 / _pT2;
    const _ftp2 = p.final_third_passes_avg || 0;
    const _finPct2 = _pA2 / _pT2;
    if (_possPct2 >= 0.40 && _ftp2 < 6 && _finPct2 >= 0.2) pivotMalus = -4;
  }

  // DOMINATION BONUS — équipe forte qui domine = MIL AA élevé + DEF latéraux profitent
  // À domicile: cap 10 (MIL) / cap 6 (DEF lat)
  // À l'extérieur: uniquement MIL avec aaEff >= 15 (Real, Barca, PSG...), cap 6
  // Real Madrid away AA20+ vs Mallorca = domination réelle même en déplacement
  let dominationBonus = 0;
  const isAttackingDEF = (p.archetype || "").includes("Latéral") && aaEff > 15;
  if (playerTeam && (pos === "MIL" || isAttackingDEF)) {
    const teamXg = isHome ? (playerTeam.xg_dom || 1.3) : (playerTeam.xg_ext || 1.3);
    const oppXgCtx = isHome ? (o.xg_ext || 1.3) : (o.xg_dom || 1.3);
    const gap = teamXg - oppXgCtx;
    if (gap > 0.5) {
      const effectiveGap = gap - 0.5;
      const aaScale = Math.min(1.5, p.aa5 / 20); // AA5=30 → 1.5x, AA5=20 → 1.0x, AA5=10 → 0.5x
      const capBonus = isHome
        ? (isAttackingDEF ? 6 : 10)   // domicile: cap normal
        : (aaEff >= 15 ? 8 : 0);       // extérieur: MIL élites cap 8 (Valverde, Kimmich, Vitinha...)
      dominationBonus = Math.min(capBonus, effectiveGap * 14 * aaScale);
    }
  }

  // BONUS GOAT SAISON — par poste, récompense la constance sur 25 matchs
  // ATT: bonus max (volatile, dépend du décisif) cap 23
  // MIL: bonus moyen cap 18
  // DEF: bonus faible (déjà boosté par CS%) cap 8
  // GK: pas de bonus
  // GOAT bonus: sample >= 5 matchs ET L25 >= 64 (vrais GOATs uniquement)
  let goatSeasonBonus = 0;
  if (mp >= 5 && l25 >= 64) {
    const gs1_raw = Math.max(0, (l25 - 55) / 2);
    const gs2_raw = Math.max(0, ((p.ceiling || 0) - 70) / 8);
    const gs3_raw = (p.ga_per_match || 0) / 0.25;
    const gs4_raw = aa25 > _aa5 ? (aa25 - _aa5) / 2 : 0;
    if (pos === "ATT") {
      goatSeasonBonus = Math.min(12, gs1_raw) + Math.min(5, gs2_raw) + Math.min(4, gs3_raw) + Math.min(3, gs4_raw);
    } else if (pos === "MIL") {
      goatSeasonBonus = Math.min(8, gs1_raw) + Math.min(3, gs2_raw) + Math.min(4, gs3_raw) + Math.min(3, gs4_raw);
    } else if (pos === "DEF") {
      goatSeasonBonus = Math.min(4, gs1_raw) + Math.min(2, gs2_raw) + Math.min(2, gs4_raw);
    }
    // GK: goatSeasonBonus = 0
  }

  // Recency penalty — joueur absent des derniers matchdays
  // > 14 jours = 2 GW manqués → -6 pts / > 21 jours = 3 GW → -10 pts
  const daysSinceLast = p.last_date
    ? Math.floor((Date.now() - new Date(p.last_date)) / 86400000)
    : 0;
  const recencyPenalty = mp === 0 ? 0  // ghost player — déjà géré par ghost filter
    : daysSinceLast > 21 ? -10
    : daysSinceLast > 14 ? -6
    : 0;

  // Extra GOAT bonus — +8 pts flat, sauf si score brut déjà > 85
  const rawBase = socle + contexte + momentum + domBonus + pivotMalus + dominationBonus + goatSeasonBonus + samplePenalty + inactivityPenalty + recencyPenalty;
  const extraGoatBonus = isExtraGoat(p) && rawBase <= 85 ? 8 : 0;
  const raw = rawBase + extraGoatBonus;
  // Floor clamp désactivé si sample < 5 (floor gonflé artificiellement sur 1-2 matchs)
  const qualityFloor = mp >= 5 ? _floor / 100 * 55 : 0;
  // Extra GOAT floor: protection retour de blessure uniquement (mp 1, 2 ou 3)
  // Pour les EG qui jouent normalement (mp >= 4), pas de floor — seulement le +8 bonus
  const isInjuryReturn = mp >= 1 && mp < 4;
  const extraGoatFloor = isExtraGoat(p) && isInjuryReturn
    ? 67 + Math.max(0, momentum) + Math.max(0, domBonus) + dominationBonus + Math.round(contexte * 0.35)
    : 0;
  const minScore = Math.min(100, Math.max(qualityFloor, extraGoatFloor));
  return Math.round(Math.max(minScore, Math.min(100, raw)));
}
