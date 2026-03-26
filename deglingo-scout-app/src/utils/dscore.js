// Normalize name for fuzzy matching (remove accents, hyphens, dots, lowercase)
function normName(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-.']/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

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

  // SOCLE (40%)
  const f   = norm(p.l5, 25, 80);
  const lb  = p.l10 > p.l5 ? norm(p.l10, 30, 80) * 5 : 0;
  const aa  = norm(p.aa5, -5, 35);
  const fl  = norm(p.min_15 ?? p.floor, 15, 70);
  const rg  = norm(p.regularite, 0, 100);
  const gb  = norm(p.ga_per_match || 0, 0, 0.8) * 6;
  const socle = f*13 + lb + aa*12 + fl*7 + rg*7 + gb;

  // CONTEXTE (45%)
  const ppda = isHome ? o.ppda_ext : o.ppda_dom;
  const xga  = isHome ? o.xga_ext  : o.xga_dom;
  const pos  = p.position;
  let contexte = 0;
  if (pos === "GK")
    contexte = norm(xga, 0.7, 2.5, true)*22 + norm(ppda, 7, 20)*16 + norm(p.l5, 20, 70)*12;
  else if (pos === "DEF")
    contexte = norm(xga, 0.7, 2.5, true)*20 + (p.aa5 > 18 ? norm(ppda, 7, 20, true) : norm(ppda, 7, 20))*16 + norm(p.l5, 20, 75)*14;
  else if (pos === "MIL") {
    // MIL AA élevé: PPDA impact dépend du profil (créateur = bloc bas positif, offensif = bloc bas neutre)
    const _mP = Math.max(0, p.aa_passing || 0), _mO = Math.max(0, p.aa_possession || 0);
    const _mA = Math.max(0, p.aa_attacking || 0), _mD = Math.max(0, p.aa_defending || 0);
    const _mT = _mP + _mO + _mA + _mD || 1;
    const mCreaPct = (_mP + _mO) / _mT;
    const mPpdaCrea = norm(ppda, 7, 20);       // bloc bas = positif pour créateur
    const mPpdaFin  = norm(ppda, 7, 20, true); // bloc bas = négatif pour finisseur
    const mPpdaBlend = mPpdaCrea * mCreaPct + mPpdaFin * (1 - mCreaPct);
    contexte = p.aa5 >= 10
      ? mPpdaBlend*26 + norm(xga, 0.8, 2)*8  + norm(p.l5, 25, 75)*16
      : norm(xga,  0.8, 2)*22 + norm(ppda, 7, 20, true)*14 + norm(p.l5, 20, 80)*14;
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
    contexte = p.aa5 >= 8
      ? norm(xga, 0.8, 2)*24 + ppdaBlend*12 + norm(p.l5, 20, 80)*14
      : norm(xga, 0.8, 2)*25 + ppdaFin*14   + norm(p.l5, 20, 80)*11;
  }

  // MOMENTUM (15%)
  const sc   = p.last_5 || [];
  const l2   = sc.length >= 2 ? (sc[0] + sc[1]) / 2 : (sc[0] || p.l5);
  const tr   = p.l5 > 0 ? (l2 - p.l5) / p.l5 * 100 : 0;
  const ts   = norm(tr, -30, 40) * 10;
  const hs   = sc.length >= 2 && sc[0] >= 65 && sc[1] >= 65 ? 3 : 0;
  const cs   = sc.length >= 2 && sc[0] < 40  && sc[1] < 40  ? -3 : 0;
  const momentum = ts + hs + cs + 2;

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

  // DOMINATION BONUS — équipe forte à domicile = MIL/ATT vont monopoliser le ballon
  // Plus l'écart xG est grand + plus le AA5 est élevé → plus le joueur profite de la domination
  let dominationBonus = 0;
  if (isHome && playerTeam && pos === "MIL") {
    const teamXg = playerTeam.xg_dom || 1.3;
    const oppXg  = o.xg_ext || 1.3;
    const gap = teamXg - oppXg; // PSG 2.30 - Toulouse 1.26 = 1.04
    // Seuil: gap > 0.5 xG minimum pour considérer une domination
    // Monaco 2.04 vs Marseille 1.79 = 0.25 → pas de bonus (choc)
    // PSG 2.30 vs Toulouse 1.26 = 1.04 → grosse domination
    if (gap > 0.5) {
      const effectiveGap = gap - 0.5; // ne compter que l'excédent
      const aaScale = Math.min(1.3, p.aa5 / 20); // AA5=30 → 1.3x, AA5=10 → 0.5x
      dominationBonus = Math.min(10, effectiveGap * 14 * aaScale);
    }
  }

  const raw = socle + contexte + momentum + domBonus + pivotMalus + dominationBonus;
  const minScore = p.min_15 ?? p.floor;
  return Math.round(Math.max(minScore / 100 * 55, Math.min(95, raw)));
}
