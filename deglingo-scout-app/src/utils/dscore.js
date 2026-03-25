export function norm(v, lo, hi, inv = false) {
  if (hi === lo) return 0.5;
  let n = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return inv ? 1 - n : n;
}

export function dScoreMatch(player, opp, isHome) {
  const p = player;
  const o = opp;

  // SOCLE (40%)
  const f   = norm(p.l5, 25, 80);
  const lb  = p.l10 > p.l5 ? norm(p.l10, 30, 80) * 5 : 0;
  const aa  = norm(p.aa5, -5, 35);
  const fl  = norm(p.floor, 15, 70);
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
  else if (pos === "MIL")
    contexte = p.aa5 >= 10
      ? norm(ppda, 7, 20)*26 + norm(xga, 0.8, 2)*8  + norm(p.l5, 25, 75)*16
      : norm(xga,  0.8, 2)*22 + norm(ppda, 7, 20, true)*14 + norm(p.l5, 20, 80)*14;
  else // ATT
    contexte = p.aa5 >= 8
      ? norm(xga, 0.8, 2)*26 + norm(ppda, 7, 20, true)*9  + norm(p.l5, 20, 80)*15
      : norm(xga, 0.8, 2)*25 + norm(ppda, 7, 20, true)*14 + norm(p.l5, 20, 80)*11;

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

  const raw = socle + contexte + momentum + domBonus;
  return Math.round(Math.max(p.floor / 100 * 55, Math.min(95, raw)));
}
