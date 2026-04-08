import { useState, useMemo, useEffect } from "react";
import { getGwLockKey, loadFrozen, saveFrozen } from "../utils/freeze";
import { dsColor, dsBg, isSilver, LEAGUE_FLAGS, LEAGUE_NAMES, POSITION_COLORS, getAAProfile } from "../utils/colors";
import { dScoreMatch, csProb, findTeam, isExtraGoat } from "../utils/dscore";
import { t } from "../utils/i18n";

const PC = POSITION_COLORS;

const SHORT_NAMES = {
  "Wolverhampton Wanderers": "Wolves", "Manchester United": "Man Utd", "Manchester City": "Man City",
  "Newcastle United": "Newcastle", "Nottingham Forest": "Nott. Forest", "Crystal Palace": "C. Palace",
  "Paris Saint Germain": "PSG", "Marseille": "OM", "Lyon": "OL",
  "Borussia Dortmund": "Dortmund", "Borussia M.Gladbach": "M'gladbach", "Bayern Munich": "Bayern",
  "Bayer Leverkusen": "Leverkusen", "RasenBallsport Leipzig": "Leipzig", "Eintracht Frankfurt": "Frankfurt",
  "VfB Stuttgart": "Stuttgart", "Rayo Vallecano": "Rayo", "Atletico Madrid": "Atletico",
  "Real Sociedad": "R. Sociedad", "Athletic Club": "Bilbao",
  "Paris Saint-Germain": "PSG", "Olympique de Marseille": "OM", "Olympique Lyonnais": "OL",
  "RC Strasbourg Alsace": "Strasbourg", "Stade Brestois 29": "Brest", "Stade Rennais F.C.": "Rennes",
  "Manchester United FC": "Man Utd", "Manchester City FC": "Man City",
  "Crystal Palace FC": "C. Palace", "Tottenham Hotspur FC": "Tottenham",
  "West Ham United FC": "West Ham", "Brighton & Hove Albion FC": "Brighton",
  "AFC Bournemouth": "Bournemouth", "Leicester City FC": "Leicester",
  "Borussia Mönchengladbach": "M'gladbach", "Bayern München": "Bayern",
  "Bayer 04 Leverkusen": "Leverkusen", "RB Leipzig": "Leipzig",
  "TSG 1899 Hoffenheim": "Hoffenheim", "1. FC Union Berlin": "Union Berlin",
  "1. FC Heidenheim 1846": "Heidenheim", "SC Freiburg": "Freiburg",
  "FC Augsburg": "Augsburg", "SV Werder Bremen": "Bremen", "1. FSV Mainz 05": "Mainz",
  "FC St. Pauli": "St. Pauli", "Atlético de Madrid": "Atletico", "Deportivo Alavés": "Alavés",
};
const sn = (name) => SHORT_NAMES[name] || name;

const LG_META = {
  L1:     { name: "Ligue 1",        flagCode: "fr",     accent: "#4FC3F7" },
  PL:     { name: "Premier League",  flagCode: "gb-eng", accent: "#B388FF" },
  Liga:   { name: "La Liga",         flagCode: "es",     accent: "#FF8A80" },
  Bundes: { name: "Bundesliga",      flagCode: "de",     accent: "#FFD180" },
};

function getTags(p) {
  const tags = [];
  if (isExtraGoat(p)) tags.push("★ Extra GOAT");
  if (p.aa5 >= 20) tags.push("AA Monster");
  if ((p.min_15 ?? p.floor) >= 55) tags.push("Floor King");
  if (p.regularite >= 90) tags.push("Régulier");
  if (p.ga_per_match >= 0.5) tags.push("DS Bomb");
  const l2 = p.l2 || p.l5;  // pipeline value — matchs joués uniquement
  if (p.l5 > 0 && (l2 - p.l5) / p.l5 > 0.15) tags.push("Early Signal");
  return tags;
}

function genVerdict(p, alternatives = [], lang = "fr") {
  const __ = (fr, en) => lang === "en" ? en : fr;
  const l2 = p.l2 || p.l5;  // pipeline value — matchs joués uniquement, pas de DNP=0
  const es = p.l5 > 0 ? Math.round((l2 - p.l5) / p.l5 * 100) : 0;
  const oppPpda = p.isHome ? (p.oppTeam.ppda_ext || 12) : (p.oppTeam.ppda_dom || 12);
  const oppXga = p.isHome ? (p.oppTeam.xga_ext || 1.5) : (p.oppTeam.xga_dom || 1.5);
  const oppXg = p.isHome ? (p.oppTeam.xg_ext || 1.3) : (p.oppTeam.xg_dom || 1.3);
  const style = oppPpda >= 15 ? __("Bloc bas", "Low block") : oppPpda >= 12 ? __("Équilibré", "Balanced") : __("Pressing", "High press");
  const haLabel = p.isHome ? __("à domicile", "at home") : __("en déplacement", "away");
  const lastName = p.name.split(" ").pop();
  const fl = p.min_15 ?? p.floor;

  // Situation: forme lisible avec chiffres exacts
  const pL2 = Math.round(p.l2 || 0), pL5 = Math.round(p.l5 || 0);
  const formeTxt = es > 15
    ? `${lastName} ${__("est en pleine forme", "is in great form")} : L2 = ${pL2} vs L5 = ${pL5} (+${es}%). ${__("Il monte en puissance.", "He's hitting his stride.")}`
    : es > 5 ? `${lastName} ${__("progresse", "is improving")} : L2 = ${pL2} vs L5 = ${pL5} (+${es}%).`
    : es < -10 ? `${__("Attention,", "Warning,")} ${lastName} ${__("est en baisse", "is declining")} : L2 = ${pL2} vs L5 = ${pL5} (${es}%). ${__("Forme descendante.", "Downward trend.")}`
    : `${lastName} ${__("est régulier", "is consistent")} : L2 = ${pL2}, L5 = ${pL5}. ${__("Performances stables.", "Stable performances.")}`;
  const tituTxt = isExtraGoat(p) && p.titu_pct < 50
    ? __("Joueur exceptionnel — même en retour de blessure il peut taper un 100", "Exceptional player — even returning from injury he can score 100")
    : p.titu_pct >= 90 ? __("Titulaire indiscutable", "Undisputed starter") : p.titu_pct >= 70 ? __("Titulaire régulier", "Regular starter") : p.titu_pct >= 50 ? __("Temps de jeu partagé", "Shared playing time") : __("Remplaçant fréquent — risque de ne pas jouer", "Frequent sub — risk of not playing");
  const floorTxt = fl >= 55 ? `${__("Son floor de", "His floor of")} ${Math.round(fl)} pts ${__("garantit une base solide même en soirée difficile.", "guarantees a solid base even on a tough night.")}` : fl >= 40 ? `${__("Son floor de", "His floor of")} ${Math.round(fl)} pts ${__("offre un filet de sécurité correct.", "provides a decent safety net.")}` : `${__("Attention : son floor est bas", "Warning: his floor is low")} (${Math.round(fl)} pts), ${__("gros risque si soirée sans.", "big risk on a blank night.")}`;
  const mp = p.matchs_played || 0;
  const egFloorTxt = isExtraGoat(p) && mp >= 1 && mp < 4
    ? `★ ${__("Extra GOAT protégé par l'algo — plancher activé pour ce retour.", "Extra GOAT protected by the algo — floor activated for this return.")}`
    : "";

  const defXga = p.playerTeam ? (p.isHome ? (p.playerTeam.xga_dom || 1.3) : (p.playerTeam.xga_ext || 1.5)) : 1.3;
  const cs = csProb(defXga, oppXg, p.league);

  // Domination context (MIL at home vs weak team)
  const teamXgDom = p.playerTeam ? (p.playerTeam.xg_dom || 1.3) : 1.3;
  const oppXgExt = p.oppTeam ? (p.oppTeam.xg_ext || 1.3) : 1.3;
  const domGap = teamXgDom - oppXgExt;
  const isDomination = p.isHome && p.position === "MIL" && domGap > 0.5;

  if (p.position === "GK") {
    const csLabel = cs >= 45 ? __("très élevée","very high") : cs >= 30 ? __("correcte","decent") : cs >= 20 ? __("moyenne","average") : __("faible","low");
    return {
      situation: `${formeTxt} ${tituTxt} (${p.titu_pct}%). ${__("Il joue","He plays")} ${haLabel} ${__("face à","against")} ${p.oppName}.${egFloorTxt ? " " + egFloorTxt : ""}`,
      adversaire: `${p.oppName} ${p.isHome ? __("se déplace","travels") : __("reçoit","hosts")} ${__("et marque en moyenne","and scores an average of")} ${oppXg.toFixed(2)} ${__("buts attendus par match (xG).","expected goals per match (xG).")} ${cs >= 45 ? __("C'est une attaque très faible — peu de danger pour le gardien.","This is a very weak attack — little danger for the keeper.") : cs >= 30 ? __("Attaque modeste — le gardien devrait être tranquille.","Modest attack — the keeper should be comfortable.") : cs >= 20 ? __("Attaque correcte — match ouvert, Clean Sheet pas garanti.","Decent attack — open game, Clean Sheet not guaranteed.") : __("Attaque dangereuse — il faudra beaucoup d'arrêts pour s'en sortir.","Dangerous attack — lots of saves needed.")}`,
      style: `${__("La probabilité de Clean Sheet est","Clean Sheet probability is")} ${csLabel} (${cs}%). ${cs >= 30 ? __("Contre une équipe aussi peu offensive, le bonus CS (+10 pts) est très jouable, et les arrêts bonus viendront en complément.","Against such a weak attack, the CS bonus (+10 pts) is very achievable, with bonus saves on top.") : cs >= 20 ? __("Le CS reste possible si la défense tient. L'avantage : face à une attaque moyenne, il y aura des tirs à arrêter = bon potentiel All-Around.","CS is still possible if the defence holds. Plus: facing an average attack means saves to make = good All-Around potential.") : __("Le CS sera difficile à obtenir, mais la bonne nouvelle : beaucoup de tirs adverses = beaucoup d'arrêts = All-Around élevé qui compense.","CS will be hard to get, but the upside: lots of shots to face = lots of saves = high AA score to compensate.")}`,
      conclusion: `${__("Avec un D-Score de","With a D-Score of")} ${p.ds}, ${lastName} ${__("est","is")} ${p.ds >= 70 ? __("un top pick gardien cette semaine. Fonce !","a top GK pick this week. Go for it!") : p.ds >= 60 ? __("un bon choix en gardien. Contexte favorable.","a good keeper pick. Favourable context.") : p.ds >= 50 ? `${__("un pick correct mais pas exceptionnel.","a decent but not exceptional pick.")}${alternatives.length > 0 ? ` ${__("Alternatives","Alternatives")} : ${alternatives.map(a => `${a.name.split(" ").pop()} (${a.ds})`).join(", ")}.` : ""}` : `${__("un pick risqué.","a risky pick.")}${alternatives.length > 0 ? ` ${__("Préfère","Consider instead")} : ${alternatives.map(a => `${a.name.split(" ").pop()} (${a.ds})`).join(", ")}.` : ` ${__("Il y a sûrement mieux cette semaine.","There's surely better this week.")}`}`}`,
    };
  }

  // Adversaire: adapté selon position du joueur
  const oppLieu = p.isHome ? __("se déplace","travels") : __("joue à domicile","plays at home");
  let oppAnalyse;
  if (p.position === "DEF") {
    // Pour un DEF : on parle du potentiel offensif de l'adversaire (combien ils marquent)
    const oppXgOff = oppXg; // xG offensif de l'adversaire
    oppAnalyse = oppXgOff > 1.6 ? `${p.oppName} ${oppLieu} ${__("et c'est une attaque redoutable","and they have a dangerous attack")} (${oppXgOff.toFixed(2)} xG/match) — ${__("ils marquent beaucoup, le Clean Sheet sera difficile à tenir.","they score a lot, CS will be tough to hold.")}`
      : oppXgOff > 1.2 ? `${p.oppName} ${oppLieu} ${__("avec une attaque correcte","with a decent attack")} (${oppXgOff.toFixed(2)} xG/match) — ${__("match ouvert, le CS reste jouable si la défense est solide.","open game, CS is possible if the defence holds.")}`
      : `${p.oppName} ${oppLieu} ${__("et c'est une attaque faible","and they have a weak attack")} (${oppXgOff.toFixed(2)} xG/match) — ${__("peu de danger, contexte idéal pour un Clean Sheet.","little danger, ideal context for a Clean Sheet.")}`;
    oppAnalyse += oppPpda < 12 ? ` ${__("Leur pressing haut (PPDA","Their high press (PPDA")} ${oppPpda.toFixed(1)}) ${__("crée des espaces dans leur dos — contre-attaques possibles pour l'équipe de","creates space behind them — counter-attacks possible for")} ${lastName}${__("'s team.","'s team.")}`
      : oppPpda >= 15 ? ` ${p.oppName} ${__("joue en bloc bas (PPDA","plays a low block (PPDA")} ${oppPpda.toFixed(1)}) — ${__("ils attaquent peu et limitent les risques offensifs.","they attack little and limit offensive risks.")}`
      : ` ${__("Style de jeu équilibré (PPDA","Balanced style (PPDA")} ${oppPpda.toFixed(1)}).`;
  } else {
    // Pour MIL/ATT : on parle de la défense de l'adversaire (combien ils encaissent)
    const oppDefTxt = oppXga > 1.6 ? `${p.oppName} ${__("encaisse beaucoup","concedes a lot")} (${oppXga.toFixed(2)} xGA/match) — ${__("c'est une défense poreuse, idéal pour scorer.","a leaky defence, ideal context to score.")}`
      : oppXga > 1.3 ? `${p.oppName} ${__("a une défense moyenne","has an average defence")} (${oppXga.toFixed(2)} xGA/match) — ${__("des occasions sont à prendre.","chances are there for the taking.")}`
      : `${p.oppName} ${__("a une défense solide","has a solid defence")} (${oppXga.toFixed(2)} xGA/match) — ${__("il faudra forcer pour créer des occasions.","you'll need to work hard to create chances.")}`;
    // Profil AA du joueur : comment il fait ses points ?
    const aaPass = Math.max(0, p.aa_passing || 0);
    const aaPoss = Math.max(0, p.aa_possession || 0);
    const aaAtt = Math.max(0, p.aa_attacking || 0);
    const aaDef = Math.max(0, p.aa_defending || 0);
    const aaTotal = aaPass + aaPoss + aaAtt + aaDef || 1;
    const pctCreator = Math.round((aaPass + aaPoss) / aaTotal * 100); // % passes+possession
    const pctFinisher = Math.round(aaAtt / aaTotal * 100); // % attaque directe
    const ftp = p.final_third_passes_avg || 0;
    const gpm = (p.goals || 0) / (p.appearances || 1);
    const pctPoss = Math.round(aaPoss / aaTotal * 100);
    const isPivot = pctPoss >= 40 && ftp < 6 && pctFinisher >= 20;
    const isDribbleur = !isPivot && ftp >= 9 && gpm < 0.55 && pctFinisher >= 20;
    const isCreator = !isDribbleur && !isPivot && pctCreator >= 60;
    const isFinisher = !isDribbleur && !isPivot && pctFinisher >= 40;

    let oppStyleTxt;
    if (p.position === "ATT" || (p.archetype || "").includes("Complet")) {
      if (oppPpda >= 15) {
        // Bloc bas : adapté au profil du joueur
        oppStyleTxt = isPivot
          ? `${p.oppName} ${__("joue en bloc bas", "plays a low block")} (PPDA ${oppPpda.toFixed(1)}). ${__("Pour un pivot comme", "For a pivot like")} ${lastName} (${pctPoss}% ${__("de son AA en duels/possession", "of his AA from duels/possession")}), ${__("c'est double tranchant : son équipe va monopoliser le ballon et centrer davantage → plus de duels aériens à gagner. Mais la surface sera bondée, peu d'espaces pour se positionner.", "it's double-edged: his team will dominate possession and cross more → more aerial duels to win. But the box will be packed, little space to position himself.")}`
          : isDribbleur
          ? `${p.oppName} ${__("joue en bloc bas", "plays a low block")} (PPDA ${oppPpda.toFixed(1)}) : ${__("défense compacte. Pour un dribbleur comme", "compact defence. For a dribbler like")} ${lastName} (${Math.round(ftp)} ${__("passes/match dans le dernier tiers", "passes/match in the final third")}), ${__("c'est un duel : plus de ballon mais des espaces réduits pour percuter. Ses passes dans le dernier tiers monteront, mais les dribbles réussis seront plus difficiles.", "it's a challenge: more ball but less space to drive forward. His final third passes will increase, but successful dribbles will be harder.")}`
          : isCreator
          ? `${p.oppName} ${__("joue en bloc bas", "plays a low block")} (PPDA ${oppPpda.toFixed(1)}). ${__("Bonne nouvelle :", "Good news:")} ${lastName} ${__("fait", "gets")} ${pctCreator}% ${__("de son AA en passes et possession — la domination au ballon va booster ses stats AA malgré le bloc compact.", "of his AA from passes and possession — ball domination will boost his AA stats despite the compact block.")}`
          : isFinisher
          ? `${p.oppName} ${__("joue en bloc bas", "plays a low block")} (PPDA ${oppPpda.toFixed(1)}) : ${__("défense compacte et regroupée. Problème :", "compact and packed defence. Problem:")} ${lastName} ${__("fait", "gets")} ${pctFinisher}% ${__("de son AA en tirs et dribbles — exactement le type d'actions que le bloc bas étouffe. Peu d'espaces pour ses courses et ses frappes.", "of his AA from shots and dribbles — exactly the kind of actions a low block stifles. Little space for his runs and shots.")}`
          : `${p.oppName} ${__("joue en bloc bas", "plays a low block")} (PPDA ${oppPpda.toFixed(1)}) : ${__("défense compacte.", "compact defence.")} ${lastName} ${__("a un profil mixte", "has a mixed profile")} (${pctCreator}% ${__("créa", "crea")} / ${pctFinisher}% ${__("finition", "finish")}) — ${__("il pourra gratter des points AA sur la possession mais aura moins d'espaces pour ses actions offensives directes.", "he can pick up AA points via possession but will have less space for direct offensive actions.")}`;
      } else if (oppPpda < 12) {
        const solidDef = oppXga < 1.3;
        oppStyleTxt = isPivot
          ? `${p.oppName} ${__("pratique un pressing haut", "plays a high press")} (PPDA ${oppPpda.toFixed(1)}) : ${__("match ouvert.", "open game.")} ${solidDef ? `${__("Mais attention, leur défense reste solide", "But beware, their defence remains solid")} (${oppXga.toFixed(2)} xGA) — ${__("les espaces seront vite refermés.", "space closes down quickly.")}` : `${__("Plus d'espaces dans la surface pour un pivot comme", "More space in the box for a pivot like")} ${lastName}.`} ${__("Son AA viendra des transitions et des duels en jeu direct.", "His AA will come from transitions and direct duels.")}`
          : isDribbleur
          ? (solidDef
            ? `${p.oppName} ${__("pratique un pressing haut", "plays a high press")} (PPDA ${oppPpda.toFixed(1)}) ${__("mais leur défense reste solide", "but their defence remains solid")} (${oppXga.toFixed(2)} xGA). ${__("Le pressing peut ouvrir quelques espaces pour un dribbleur comme", "The press can open some space for a dribbler like")} ${lastName} (${Math.round(ftp)} FTP/match), ${__("mais", "but")} ${p.oppName} ${__("sait se replacer — match compliqué malgré le profil adapté.", "recovers well — tough game despite the fitting profile.")}`
            : `${p.oppName} ${__("pratique un pressing haut", "plays a high press")} (PPDA ${oppPpda.toFixed(1)}) : JACKPOT ${__("pour un dribbleur comme", "for a dribbler like")} ${lastName} ! ${__("Ils montent agressivement et laissent des boulevards dans le dos. Avec", "They press aggressively and leave space in behind. With")} ${Math.round(ftp)} ${__("passes/match dans le dernier tiers, ses percées et ses centres vont faire exploser son AA.", "passes/match in the final third, his runs and crosses will explode his AA.")}`)
          : isFinisher
          ? `${p.oppName} ${__("pratique un pressing haut", "plays a high press")} (PPDA ${oppPpda.toFixed(1)}) : ${__("leur ligne défensive est haute — des espaces dans le dos à exploiter en profondeur.", "their defensive line is high — space in behind to exploit.")} ${solidDef ? `${__("Leur défense reste organisée", "Their defence remains organised")} (${oppXga.toFixed(2)} xGA) ${__("mais les courses de", "but the runs from")} ${lastName} ${__("peuvent surprendre sur les transitions.", "can catch them out on transitions.")}` : `${__("Contexte idéal pour", "Ideal context for")} ${lastName} : ${__("appels dans le dos, vitesse, et finitions — c'est exactement son registre.", "runs in behind, pace, and finishing — exactly his game.")}`}`
          : isCreator
          ? `${p.oppName} ${__("pratique un pressing haut", "plays a high press")} (PPDA ${oppPpda.toFixed(1)}) : ${__("leur ligne monte — des espaces dans le dos.", "their line pushes up — space in behind.")} ${solidDef ? `${__("Défense organisée", "Organised defence")} (${oppXga.toFixed(2)} xGA) ${__("mais", "but")} ${lastName} ${__("peut se créer des situations très dangereuses en profondeur pour marquer ou servir.", "can create very dangerous situations in depth to score or assist.")}` : `${__("Contexte idéal pour", "Ideal context for")} ${lastName} : ${__("il va se retrouver seul face au but ou créer des situations de but en exploitant ces espaces.", "he will find himself one-on-one or create goal chances by exploiting this space.")}`}`
          : `${p.oppName} ${__("pratique un pressing haut", "plays a high press")} (PPDA ${oppPpda.toFixed(1)}) ${solidDef ? `${__("mais reste solide défensivement", "but remains defensively solid")} (${oppXga.toFixed(2)} xGA). ${__("Match compliqué.", "Tough game.")}` : `: ${__("espaces dans le dos et transitions rapides. Match ouvert.", "space in behind and quick transitions. Open game.")}`}`;
      } else {
        oppStyleTxt = `${p.oppName} ${__("joue de façon équilibrée", "plays in a balanced way")} (PPDA ${oppPpda.toFixed(1)}) : ${__("match classique avec des occasions dans les deux sens.", "classic game with chances both ways.")}`;
      }
    } else {
      // MIL : bloc bas = POSITIF (possession = AA), pressing = intense (duels)
      if (isDomination) {
        oppStyleTxt = `🔥 ${__("Contexte de DOMINATION :", "DOMINATION context:")} ${p.playerTeam ? sn(p.playerTeam.name) : __("son équipe", "his team")} (${teamXgDom.toFixed(2)} xG/match ${__("à dom", "at home")}) ${__("va écraser", "will crush")} ${p.oppName} (${oppXgExt.toFixed(2)} xG ext). ${oppPpda >= 15 ? `${__("En plus,", "Also,")} ${p.oppName} ${__("joue en bloc bas", "plays a low block")} (PPDA ${oppPpda.toFixed(1)}) — ${__("possession monopolisée,", "possession monopolised,")} ${lastName} ${__("va accumuler les actions AA.", "will rack up AA actions.")}` : oppPpda < 12 ? `${__("Le pressing de", "The press from")} ${p.oppName} (PPDA ${oppPpda.toFixed(1)}) ${__("ne suffira pas face à cette supériorité technique — transitions et domination.", "won't be enough against this technical superiority — transitions and dominance.")}` : `${__("Même avec un style équilibré", "Even with a balanced style")} (PPDA ${oppPpda.toFixed(1)}), ${p.oppName} ${__("va subir —", "will suffer —")} ${lastName} ${__("aura le ballon en permanence.", "will have the ball constantly.")}`}`;
      } else {
        oppStyleTxt = oppPpda >= 15 ? `${p.oppName} ${__("joue en bloc bas", "plays a low block")} (PPDA ${oppPpda.toFixed(1)}) : ${__("ils laissent la possession à l'adversaire.", "they concede possession.")} ${isCreator ? `${__("Jackpot pour", "Jackpot for")} ${lastName} ${__("qui fait", "who gets")} ${pctCreator}% ${__("de son AA en passes et possession — il va accumuler.", "of his AA from passes and possession — he will rack up.")}` : `${__("Plus de ballon = plus de passes et récupérations AA.", "More ball = more passes and AA recoveries.")}`}`
          : oppPpda >= 12 ? `${p.oppName} ${__("joue de façon équilibrée", "plays in a balanced way")} (PPDA ${oppPpda.toFixed(1)}) : ${__("ni pressing ni bloc bas, un match classique.", "neither press nor low block — a classic game.")}`
          : `${p.oppName} ${__("pratique un pressing haut", "plays a high press")} (PPDA ${oppPpda.toFixed(1)}) : ${__("match intense avec beaucoup de duels et transitions.", "intense game with lots of duels and transitions.")} ${pctFinisher >= 30 ? `${lastName} ${__("pourra se projeter dans les espaces.", "will be able to make runs into space.")}` : `${__("Parfait pour accumuler des actions AA dans l'intensité.", "Perfect for racking up AA actions in the intensity.")}`}`;
      }
    }
    oppAnalyse = `${p.oppName} ${oppLieu} et ${oppDefTxt} ${oppStyleTxt}`;
  }

  // Style: expliquer l'impact sur le joueur
  let styleTxt;
  const csDef = cs; // same CS% for DEF — already computed above with bookmaker formula

  if (p.position === "DEF") {
    styleTxt = csDef >= 35 ? `${__("Probabilité de CS :","CS probability:")} ${csDef}% — ${__("c'est très jouable face à","very achievable against")} ${p.oppName}. ${p.aa5 >= 18 ? `${__("En plus, avec un AA5 de","Plus, with an AA5 of")} ${Math.round(p.aa5)}, ${lastName} ${__("monte beaucoup et accumule des actions offensives — le combo CS + AA peut faire exploser le score.","pushes up a lot and accumulates offensive actions — the CS + AA combo can be explosive.")}` : __("Le bonus CS (+10 pts) peut faire une grosse différence.","The CS bonus (+10 pts) can make a huge difference.")}`
      : csDef >= 22 ? `${__("Probabilité de CS :","CS probability:")} ${csDef}% — ${__("possible mais pas garanti face à","possible but not guaranteed against")} ${p.oppName}. ${p.aa5 >= 18 ? `${__("L'atout de","The strength of")} ${lastName}, ${__("c'est son All-Around très élevé","is his very high All-Around")} (${Math.round(p.aa5)}) ${__("qui sécurise le score même sans CS.","which secures the score even without CS.")}` : __("Il faudra compter sur la solidité défensive.","Rely on defensive solidity.")}`
      : `${__("Probabilité de CS : seulement","CS probability: only")} ${csDef}% — ${p.oppName} ${__("est trop offensif.","is too attacking.")} ${p.aa5 >= 18 ? `${__("Mais","But")} ${lastName} ${__("compense avec son All-Around exceptionnel","compensates with his exceptional All-Around")} (${Math.round(p.aa5)}) : ${__("il crée, passe et monte constamment.","he creates, passes and attacks constantly.")}` : __("Sans CS, le score pourrait être moyen.","Without CS, average score likely.")}`;
  } else if (p.position === "MIL") {
    if (isDomination) {
      const domBonus = Math.round(Math.min(10, (domGap - 0.5) * 14 * Math.min(1.3, p.aa5 / 20)));
      styleTxt = p.aa5 >= 15
        ? `🚀 ${__("DOMINATION à domicile !","HOME DOMINATION!")} ${p.playerTeam ? sn(p.playerTeam.name) : __("Son équipe","His team")} ${__("va monopoliser le ballon face à","will dominate possession against")} ${p.oppName}. ${__("Avec un AA5 de","With an AA5 of")} ${Math.round(p.aa5)}, ${lastName} ${__("va accumuler passes, récupérations et actions offensives en continu. Bonus domination :","will rack up passes, recoveries and offensive actions non-stop. Domination bonus:")} +${domBonus} pts.`
        : `${__("Domination à domicile —","Home domination —")} ${p.playerTeam ? sn(p.playerTeam.name) : __("Son équipe","His team")} ${__("va avoir le ballon en permanence face à","will control possession against")} ${p.oppName}. ${lastName} ${__("en profitera même si son AA5","will benefit even if his AA5")} (${Math.round(p.aa5)}) ${__("est modéré. Bonus domination :","is moderate. Domination bonus:")} +${domBonus} pts.`;
    } else if (p.aa5 >= 15) {
      styleTxt = oppPpda >= 15 ? `${__("Jackpot pour","Jackpot for")} ${lastName} ! ${__("Face au bloc bas de","vs the low block of")} ${p.oppName}, ${__("son équipe va monopoliser le ballon. Avec un AA5 de","his team will dominate possession. With an AA5 of")} ${Math.round(p.aa5)}, ${__("chaque minute de possession = passes décisives, duels gagnés, actions offensives. Score monster garanti.","every minute in possession = key passes, won duels, offensive actions. Monster score guaranteed.")}`
        : oppPpda < 12 ? `${p.oppName} ${__("presse haut — match ouvert avec beaucoup de duels et de transitions. Avec son AA5 de","presses high — open game with lots of duels and transitions. With his AA5 of")} ${Math.round(p.aa5)}, ${lastName} ${__("va accumuler des points dans l'intensité.","will accumulate points in the intensity.")}`
        : `${__("Match équilibré face à","Balanced game against")} ${p.oppName}. ${__("Le profil All-Around de","The All-Around profile of")} ${lastName} (AA5: ${Math.round(p.aa5)}) ${__("lui permet de scorer des points dans tous les registres.","allows him to score points in every category.")}`;
    } else {
      styleTxt = oppXga > 1.5 ? `${__("La défense de","The defence of")} ${p.oppName} ${__("est perméable","is leaky")} (${oppXga.toFixed(2)} xGA) — ${lastName} ${__("et son équipe auront des occasions.","and his team will have chances.")}`
        : `${p.oppName} ${__("est solide défensivement —","is defensively solid —")} ${lastName} ${__("aura moins d'espaces. Il faudra compter sur sa régularité plutôt que sur un gros match offensif.","will have less space. Rely on his consistency rather than a big offensive game.")}`;
    }
  } else { // ATT
    // Recalcul profil AA pour styleTxt (mêmes variables que dans oppAnalyse)
    const saaPass = Math.max(0, p.aa_passing || 0), saaPoss = Math.max(0, p.aa_possession || 0);
    const saaAtt = Math.max(0, p.aa_attacking || 0);
    const saaTotal = saaPass + saaPoss + saaAtt + Math.max(0, p.aa_defending || 0) || 1;
    const sPctCreator = Math.round((saaPass + saaPoss) / saaTotal * 100);
    const sPctFinisher = Math.round(saaAtt / saaTotal * 100);
    const sPctPoss = Math.round(saaPoss / saaTotal * 100);
    const sFtp = p.final_third_passes_avg || 0;
    const sGpm = (p.goals || 0) / (p.appearances || 1);
    const sIsPivot = sPctPoss >= 40 && sFtp < 6 && sPctFinisher >= 20;
    const sIsDribbleur = !sIsPivot && sFtp >= 9 && sGpm < 0.55 && sPctFinisher >= 20;
    const sIsCreator = !sIsPivot && !sIsDribbleur && sPctCreator >= 60;
    const sIsFinisher = !sIsPivot && !sIsDribbleur && sPctFinisher >= 40;
    const profilTxt = sIsPivot ? `${__("pivot","pivot")} (${sPctPoss}% duels/poss, FTP ${sFtp.toFixed(0)})` : sIsDribbleur ? `${__("dribbleur","dribbler")} (${Math.round(sFtp)} FTP/match)` : sIsCreator ? `${__("créateur","creator")} (${sPctCreator}% pass/poss)` : sIsFinisher ? `${__("finisseur","finisher")} (${sPctFinisher}% ${__("tirs/dribbles","shots/dribbles")})` : `${__("complet","all-round")} (${sPctCreator}% ${__("créa","crea")}, ${sPctFinisher}% ${__("finition","finish")})`;

    if (oppXga > 1.6) {
      styleTxt = oppPpda < 12 ? `${__("La défense de","The defence of")} ${p.oppName} ${__("est une passoire","is a sieve")} (${oppXga.toFixed(2)} xGA) ${__("et leur pressing haut ouvre des boulevards — contexte rêvé pour un","and their high press opens up space — dream context for a")} ${profilTxt} ${__("comme","like")} ${lastName}.`
        : oppPpda >= 15 ? `${__("La défense de","The defence of")} ${p.oppName} ${__("est poreuse","is leaky")} (${oppXga.toFixed(2)} xGA) ${__("malgré leur bloc bas.","despite their low block.")} ${sIsCreator ? `${lastName} ${__("en profitera via la possession et les passes.","will benefit via possession and passes.")}` : __("Les occasions viendront, mais il faudra forcer le verrou compact.","Chances will come, but you need to break the compact block.")}`
        : `${__("La défense de","The defence of")} ${p.oppName} ${__("est une vraie passoire","is a real sieve")} (${oppXga.toFixed(2)} xGA/match). ${lastName} ${__("devrait avoir plein d'occasions — contexte idéal pour un attaquant","should have plenty of chances — ideal context for a")} ${profilTxt} ${__("attacker","attacker")}.`;
    } else if (oppXga > 1.3) {
      styleTxt = oppPpda >= 15 ? `${p.oppName} ${__("encaisse","concedes")} (${oppXga.toFixed(2)} xGA), ${__("mais leur bloc bas rend la tâche plus difficile.","but their low block makes it harder.")} ${sIsCreator ? `${__("Atout : en tant que","Upside: as a")} ${profilTxt}, ${lastName} ${__("va gratter des points AA sur la possession dominante.","will pick up AA points via dominant possession.")}` : sIsFinisher ? `${__("En tant que","As a")} ${profilTxt}, ${lastName} ${__("aura peu d'espaces pour ses courses et frappes. Match de patience.","will have little space for runs and shots. A patient game.")}` : `${__("Profil","Profile")} ${profilTxt} — ${__("la possession compensera partiellement le manque d'espaces.","possession will partially compensate for the lack of space.")}`}`
        : oppPpda < 12 ? `${p.oppName} ${__("encaisse régulièrement et leur pressing haut laisse des espaces.","concedes regularly and their high press leaves space.")} ${sIsFinisher ? `${__("Parfait pour les appels en profondeur de","Perfect for the runs in behind from")} ${lastName}.` : `${lastName} ${__("pourra créer dans les transitions.","can create in transitions.")}`}`
        : `${p.oppName} ${__("encaisse régulièrement — des occasions seront à saisir pour","concedes regularly — chances are there for")} ${lastName} (${profilTxt}).`;
    } else {
      styleTxt = oppPpda >= 15 ? `${p.oppName} ${__("est solide ET joue en bloc bas.","is solid AND plays a low block.")} ${sIsCreator ? `${__("Seul espoir :","Only hope:")} ${lastName} ${__("en tant que","as a")} ${profilTxt} ${__("peut gratter des points AA sur la possession. Mais peu de décisif.","can pick up AA points via possession. But few decisive contributions.")}` : `${__("Double peine pour un","Double difficulty for a")} ${profilTxt} ${__("comme","like")} ${lastName}. ${__("Peu d'espaces, peu d'occasions.","Little space, few chances.")}`}`
        : oppPpda < 12 ? `${p.oppName} ${__("est solide mais leur pressing haut monte la ligne défensive —","is solid but their high press pushes the defensive line high —")} ${sIsFinisher ? `${__("des espaces dans le dos à exploiter. C'est LE contexte pour un finisseur comme","space in behind to exploit. THE context for a finisher like")} ${lastName}.` : sIsDribbleur ? `${__("quelques espaces pour un dribbleur comme","some space for a dribbler like")} ${lastName} (${profilTxt}), ${__("mais","but")} ${p.oppName} ${__("sait se replacer vite.","recovers quickly.")}` : `${__("les espaces restent limités pour","space remains limited for")} ${lastName} (${profilTxt}).`}`
        : `${p.oppName} ${__("a une défense solide — match compliqué pour","has a solid defence — tough game for")} ${lastName} (${profilTxt}). ${__("Il faudra un éclair de génie.","It will take a moment of brilliance.")}`;
    }
  }

  return {
    situation: `${formeTxt} ${tituTxt} (${p.titu_pct}%). ${__("Il joue", "He plays")} ${haLabel} ${__("face à", "against")} ${p.oppName}. ${floorTxt}${egFloorTxt ? " " + egFloorTxt : ""}`,
    adversaire: oppAnalyse,
    style: styleTxt,
    conclusion: (() => {
      // Nuancer selon dom/ext et force adversaire (xGA proxy)
      const isExt = !p.isHome;
      const oppStrong = oppXga < 1.25; // adversaire solide défensivement
      const oppXgHigh = oppXg > 1.5; // adversaire dangereux offensivement
      const hardContext = isExt && (oppStrong || oppXgHigh);
      // Anti-meta warning for Pivots
      const _cPo = Math.max(0, p.aa_possession || 0);
      const _cA = Math.max(0, p.aa_attacking || 0);
      const _cT = (Math.max(0, p.aa_passing || 0) + _cPo + _cA + Math.max(0, p.aa_defending || 0)) || 1;
      const _cIsPivot = (_cPo / _cT) >= 0.40 && (p.final_third_passes_avg || 0) < 6 && (_cA / _cT) >= 0.2;
      const pivotWarn = _cIsPivot ? ` ⚠️ ${__("Profil Pivot anti-meta : AA5 structurellement bas", "Pivot anti-meta profile: structurally low AA5")} (~${Math.round(p.aa5)}), ${lastName} ${__("DOIT marquer ou faire une passe D pour dépasser 60 pts. Pick risqué sans décisif.", "MUST score or assist to exceed 60 pts. Risky pick without a decisive contribution.")}` : "";
      const domTxt = isDomination ? ` 🔥 ${__("Bonus domination activé —", "Domination bonus activated —")} ${p.playerTeam ? sn(p.playerTeam.name) : __("son équipe", "his team")} ${__("va écraser", "will dominate")} ${p.oppName} ${__("à domicile.", "at home.")}` : "";
      if (p.ds >= 70) {
        return (hardContext
          ? `D-Score ${__("de", "of")} ${p.ds} — ${lastName} ${__("est un top pick malgré un déplacement compliqué chez", "is a top pick despite a tough away trip to")} ${p.oppName}. ${__("Son profil lui permet de performer même en contexte difficile.", "His profile allows him to perform even in difficult contexts.")}`
          : `D-Score ${__("de", "of")} ${p.ds} — ${lastName} ${__("est un top pick cette semaine.", "is a top pick this week.")} ${p.isHome ? __("À domicile", "At home") : __("Même à l'extérieur", "Even away")}, ${__("le contexte est très favorable, fonce !", "context is very favourable — go for it!")}`) + domTxt + pivotWarn;
      } else if (p.ds >= 60) {
        return (hardContext
          ? `D-Score ${__("de", "of")} ${p.ds} — ${lastName} ${__("reste un bon choix mais attention,", "remains a good pick but beware,")} ${isExt ? __("déplacement", "away trip") : __("match", "match")} ${__("face à", "against")} ${p.oppName} ${__("qui est solide. Ne pas s'attendre à un carton.", "who is solid. Don't expect a big haul.")}`
          : `D-Score ${__("de", "of")} ${p.ds} — ${lastName} ${__("est un bon choix.", "is a good pick.")} ${p.isHome ? __("À domicile, contexte favorable.", "At home, favourable context.") : __("Contexte correct pour performer.", "Decent context to perform.")}`) + pivotWarn;
      } else if (p.ds >= 50) {
        const altTxt = alternatives.length > 0 ? ` ${__("Alternatives", "Alternatives")} : ${alternatives.map(a => `${a.name.split(" ").pop()} (${a.ds})`).join(", ")}.` : "";
        return `D-Score ${__("de", "of")} ${p.ds} — ${lastName} ${__("est un pick correct mais pas exceptionnel", "is a decent but not exceptional pick")}${hardContext ? `, ${__("surtout avec ce déplacement chez", "especially with this away trip to")} ${p.oppName}` : ""}.${altTxt}` + pivotWarn;
      } else {
        const altTxt = alternatives.length > 0 ? ` ${__("Préfère", "Consider instead")} : ${alternatives.map(a => `${a.name.split(" ").pop()} (${a.ds})`).join(", ")}.` : ` ${__("Il y a sûrement mieux cette semaine.", "There's surely better this week.")}`;
        return `D-Score ${__("de", "of")} ${p.ds} — ${lastName} ${__("est un pick risqué", "is a risky pick")}${hardContext ? ` ${__("dans un contexte difficile", "in a difficult context")} (${isExt ? __("extérieur", "away") : ""} vs ${p.oppName})` : ""}.${altTxt}` + pivotWarn;
      }
    })(),
  };
}

function MiniHistogram({ scores }) {
  const h = 28, bw = 7;
  const rev = (scores || []).slice(0, 5).slice().reverse();
  const gc = s => s >= 75 ? "#06D6A0" : s >= 60 ? "#2EC4B6" : s >= 45 ? "#E9C46A" : s >= 30 ? "#F4A261" : "#E76F51";
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", justifyContent: "center", height: h }}>
      {rev.map((s, i) => (
        <div key={i} style={{
          width: bw, borderRadius: "2px 2px 0 0",
          height: `${Math.max((s / 100) * h, 5)}px`,
          background: s >= 100 ? "linear-gradient(180deg,#fff,#C0C0C0,#E8E8E8,#A0A0A0)" : gc(s),
          opacity: i === rev.length - 1 ? 1 : 0.75,
          border: s >= 100 ? "1px solid rgba(255,255,255,0.6)" : "1px solid rgba(255,255,255,0.12)",
          boxShadow: s >= 100 ? "0 0 6px rgba(255,255,255,0.4)" : "none",
        }} />
      ))}
    </div>
  );
}

function Stars({ n }) {
  const isFive = n >= 5;
  return (
    <div style={{ display: "flex", gap: "2px", justifyContent: "center", animation: isFive ? "starPulse 2s ease-in-out infinite" : "none", filter: isFive ? "drop-shadow(0 0 4px #FBBF24)" : "none" }}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width="11" height="11" viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill={i < n ? (isFive ? "#FFD700" : "#FBBF24") : "rgba(255,255,255,0.08)"} stroke={i < n ? (isFive ? "#FFA500" : "#F59E0B") : "none"} strokeWidth="0.5" />
        </svg>
      ))}
    </div>
  );
}

function PlayerCard({ player, isSelected, onClick, logos = {}, badge, isCaptain, gwStart = "" }) {
  const displayPos = badge || player.position;
  const pc = PC[player.position];
  const conf = player.ds >= 75 ? 5 : player.ds >= 60 ? 4 : player.ds >= 50 ? 3 : player.ds >= 40 ? 2 : player.ds >= 30 ? 1 : 0;

  // hasPlayed : vrai seulement si le dernier SO5 est >= la date du match GW de ce joueur
  const refDate = player.matchDate || gwStart;
  const hasPlayed = refDate && player.last_so5_date && player.last_so5_date >= refDate && player.last_so5_score != null;
  const realScore = hasPlayed ? Math.round(player.last_so5_score) : null;
  const realColor = hasPlayed ? (player.last_so5_score >= 75 ? "#4ADE80" : player.last_so5_score >= 60 ? "#A3E635" : player.last_so5_score >= 50 ? "#FBBF24" : player.last_so5_score >= 40 ? "#FB923C" : "#EF4444") : null;

  // Résultat du match réel (buts) : "3-1" si domicile, "1-3" si extérieur
  const hg = player.last_match_home_goals;
  const ag = player.last_match_away_goals;
  const matchResult = hasPlayed && hg != null && ag != null
    ? `${hg}-${ag}`
    : null;
  const matchResultColor = matchResult
    ? (player.isHome ? (hg > ag ? "#4ADE80" : hg === ag ? "#FBBF24" : "#EF4444")
                     : (ag > hg ? "#4ADE80" : ag === hg ? "#FBBF24" : "#EF4444"))
    : null;

  // Position-based card gradient (deep, diagonal, futuristic)
  const cardBg = {
    GK: `linear-gradient(145deg, #0a1e30 0%, #0d2a42 20%, #081c2e 45%, ${pc}15 70%, #06141f 100%)`,
    DEF: `linear-gradient(145deg, #0d0c28 0%, #131242 20%, #0c0b30 45%, ${pc}15 70%, #080720 100%)`,
    MIL: `linear-gradient(145deg, #180c2c 0%, #221248 20%, #180c34 45%, ${pc}15 70%, #0e0620 100%)`,
    ATT: `linear-gradient(145deg, #280c16 0%, #381020 20%, #2a0c18 45%, ${pc}15 70%, #18060e 100%)`,
  }[player.position] || `linear-gradient(145deg, #1a1040, #0d0820)`;

  return (
    <div onClick={onClick} style={{ textAlign: "center", cursor: "pointer", width: "114px", position: "relative" }}>
      {/* Titu% clip badge — right edge */}
      {player.sorare_starter_pct != null && !hasPlayed && (
        <div style={{
          position: "absolute", top: 18, right: -2, zIndex: 20,
          background: player.sorare_starter_pct >= 80
            ? "linear-gradient(135deg, #22c55e, #16a34a)"
            : "linear-gradient(135deg, #eab308, #ca8a04)",
          borderRadius: "5px 0 0 5px",
          padding: "3px 5px 3px 6px",
          fontSize: 10, fontWeight: 700, color: "#fff",
          fontFamily: "system-ui, -apple-system, Arial, sans-serif",
          boxShadow: "-2px 2px 8px rgba(0,0,0,0.5)",
          letterSpacing: "0.02em",
        }}>{player.sorare_starter_pct}%</div>
      )}
      <div style={{
        position: "relative", display: "inline-block",
        transform: isSelected ? "scale(1.06) translateY(-3px)" : "scale(1)",
        transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)",
        filter: isSelected ? `drop-shadow(0 0 18px ${pc}50)` : "drop-shadow(0 4px 12px rgba(0,0,0,0.4))",
      }}>
        <div style={{
          width: 110, height: 156, borderRadius: "12px",
          background: cardBg,
          border: `1.5px solid ${isSelected ? `${pc}BB` : `${pc}20`}`,
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "4px 4px 0", position: "relative", overflow: "hidden",
          boxShadow: isSelected
            ? `inset 0 1px 0 rgba(255,255,255,0.1), 0 0 20px ${pc}25`
            : "inset 0 1px 0 rgba(255,255,255,0.06)",
        }}>
          {/* ── Relief: diagonal shine streak ── */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 35%, transparent 65%, rgba(255,255,255,0.04) 100%)", pointerEvents: "none" }} />
          {/* ── Relief: top-left radial glow ── */}
          <div style={{ position: "absolute", top: "-20%", left: "-15%", width: "80%", height: "70%", background: `radial-gradient(ellipse, ${pc}18, transparent 65%)`, pointerEvents: "none" }} />
          {/* ── Relief: bottom edge light ── */}
          <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 1, background: `linear-gradient(90deg, transparent, ${pc}35, transparent)`, pointerEvents: "none" }} />
          {/* ── Star dust texture ── */}
          <div style={{ position: "absolute", inset: 0, opacity: 0.1, pointerEvents: "none", backgroundImage: "radial-gradient(0.7px 0.7px at 18% 22%, #fff, transparent), radial-gradient(0.5px 0.5px at 55% 68%, #fff, transparent), radial-gradient(0.8px 0.8px at 78% 15%, #fff, transparent), radial-gradient(0.6px 0.6px at 40% 85%, #fff, transparent), radial-gradient(0.5px 0.5px at 85% 55%, #fff, transparent)" }} />
          {/* ── Top accent line ── */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent 10%, ${pc}70 50%, transparent 90%)`, pointerEvents: "none" }} />

          {/* Captain badge — top-left */}
          {(isCaptain || player.isCaptain) && (
            <div style={{ position: "absolute", top: 4, left: 4, zIndex: 15, width: 18, height: 18, borderRadius: "50%", background: "linear-gradient(135deg, #A78BFA, #7C3AED)", border: "1.5px solid rgba(196,181,253,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, color: "#fff", boxShadow: "0 0 8px rgba(139,92,246,0.6)" }}>C</div>
          )}
          {/* Injury / Suspension badge — top-left corner */}
          {(player.injured || player.suspended) && (
            <div style={{ position: "absolute", top: 5, left: 5, zIndex: 10, display: "flex", gap: 2 }}>
              {player.injured && (
                <svg width="14" height="14" viewBox="0 0 12 12" title="Blessé">
                  <rect width="12" height="12" rx="2" fill="#EF4444"/>
                  <rect x="5" y="2" width="2" height="8" rx="0.5" fill="#fff"/>
                  <rect x="2" y="5" width="8" height="2" rx="0.5" fill="#fff"/>
                </svg>
              )}
              {player.suspended && (
                <svg width="10" height="14" viewBox="0 0 8 12" title="Suspendu">
                  <rect x="0.5" y="0.5" width="7" height="11" rx="1.5" fill="#EF4444" stroke="rgba(0,0,0,0.25)" strokeWidth="0.5"/>
                </svg>
              )}
            </div>
          )}
          {/* Position badge */}
          <div style={{ background: `linear-gradient(135deg,${pc},${pc}CC)`, borderRadius: "3px", padding: "1px 6px", marginTop: "2px", fontSize: "7px", fontWeight: 800, color: "#fff", letterSpacing: "0.06em", position: "relative", zIndex: 1, boxShadow: `0 1px 4px ${pc}40` }}>{displayPos}</div>
          {/* Score : cercle vide (D-Score) → cercle plein (score réel) */}
          <div style={{ marginTop: "5px", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
            {hasPlayed ? (
              /* Cercle plein — score réel */
              <div style={{
                width: 42, height: 42, borderRadius: "50%",
                background: realColor,
                boxShadow: `0 0 14px ${realColor}99, 0 2px 8px rgba(0,0,0,0.5)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "'DM Mono',monospace", fontSize: 17, fontWeight: 900,
                color: "#fff",
                border: "2px solid rgba(255,255,255,0.3)",
                transition: "all 0.4s",
              }}>{realScore}</div>
            ) : (
              /* Cercle vide — D-Score projeté */
              <div style={{
                width: 42, height: 42, borderRadius: "50%",
                background: "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 700,
                color: isSilver(player.ds) ? "rgba(255,255,255,0.9)" : dsColor(player.ds),
                border: isSilver(player.ds) ? "1px dashed rgba(255,255,255,0.4)" : `1px dashed ${dsColor(player.ds)}80`,
                boxShadow: isSilver(player.ds) ? "0 0 8px rgba(200,200,232,0.3)" : `0 0 8px ${dsColor(player.ds)}40`,
                transition: "all 0.4s",
              }}>{player.ds}</div>
            )}
          </div>
          {/* Name */}
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#fff", marginTop: "4px", letterSpacing: "-0.01em", lineHeight: 1.1, position: "relative", zIndex: 1, textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>{player.name.split(" ").pop()}</div>
          {/* Club name */}
          <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.4)", fontWeight: 500, marginTop: "2px", position: "relative", zIndex: 1, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", padding: "0 4px" }}>{sn(player.club)}</div>
          {/* Club logo */}
          {logos[player.club] && <img src={`/data/logos/${logos[player.club]}`} alt="" style={{ width: 26, height: 26, objectFit: "contain", marginTop: "3px", position: "relative", zIndex: 1, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.4))" }} />}
          {/* Mini histogram at bottom */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 1 }}>
            <MiniHistogram scores={player.last_5} />
          </div>
        </div>
      </div>
      {/* Stars */}
      <div style={{ marginTop: "6px" }}><Stars n={conf} /></div>
      {/* Opponent badge — wrapper centre le pill, pill limité à 100% pour truncation */}
      <div style={{ marginTop: "4px", display: "flex", justifyContent: "center", width: "100%" }}>
        <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.5)", display: "inline-flex", alignItems: "center", gap: "3px", background: "rgba(0,0,0,0.5)", padding: "2px 6px", borderRadius: "4px", backdropFilter: "blur(4px)", maxWidth: "100%", overflow: "hidden" }}>
          <span style={{ fontSize: "10px", lineHeight: 1, flexShrink: 0 }}>{player.isHome ? "🏠" : "✈️"}</span>
          {logos[player.oppName] && <img src={`/data/logos/${logos[player.oppName]}`} alt="" style={{ width: 10, height: 10, objectFit: "contain", flexShrink: 0 }} />}
          <span className="bp-opp-name" style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{sn(player.oppName)}</span>
          {matchResult && (
            <>
              <span style={{ color: "rgba(255,255,255,0.25)", margin: "0 1px", flexShrink: 0 }}>·</span>
              <span style={{ fontWeight: 800, fontFamily: "'DM Mono',monospace", color: matchResultColor, fontSize: 9, flexShrink: 0, whiteSpace: "nowrap" }}>{matchResult}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailPanel({ player, logos = {}, allPicks = [], lang = "fr" }) {
  if (!player) return (
    <div style={{ textAlign: "center", padding: "30px 16px", color: "rgba(255,255,255,0.15)" }}>
      <div style={{ fontSize: 36, marginBottom: 6 }}>⚽</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{t(lang, "clickPlayer")}</div>
    </div>
  );

  const pc = PC[player.position];
  const dsc = dsColor(player.ds);
  const tags = getTags(player);
  // Find top 3 alternatives: same position, higher D-Score, different player
  const alternatives = allPicks
    .filter(a => a.position === player.position && a.name !== player.name && a.ds > player.ds)
    .sort((a, b) => b.ds - a.ds)
    .slice(0, 3);
  const v = genVerdict(player, alternatives, lang);
  const l2 = player.l2 || player.l5;  // pipeline value — matchs joués uniquement, pas de DNP=0
  const es = player.l5 > 0 ? Math.round((l2 - player.l5) / player.l5 * 100) : 0;
  const oppPpda = player.isHome ? (player.oppTeam.ppda_ext || 12) : (player.oppTeam.ppda_dom || 12);
  const oppXga = player.isHome ? (player.oppTeam.xga_ext || 1.5) : (player.oppTeam.xga_dom || 1.5);
  const oppXg = player.isHome ? (player.oppTeam.xg_ext || 1.3) : (player.oppTeam.xg_dom || 1.3);
  const style = oppPpda >= 15 ? "Bloc bas" : oppPpda >= 12 ? "Équilibré" : "Pressing";
  const defXga = player.playerTeam ? (player.isHome ? (player.playerTeam.xga_dom || 1.3) : (player.playerTeam.xga_ext || 1.5)) : 1.3;
  const csVal = csProb(defXga, oppXg, player.league);

  return (
    <div style={{ background: `linear-gradient(135deg,rgba(8,8,24,0.98),rgba(15,15,40,0.98))`, border: `1px solid ${pc}20`, borderRadius: "14px", padding: "16px", marginTop: "14px", backdropFilter: "blur(20px)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
      {/* Hero */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 14px", marginBottom: "14px", background: `linear-gradient(135deg,${pc}10,rgba(255,255,255,0.02))`, border: `1px solid ${pc}15`, borderRadius: "10px" }}>
        <div style={{ width: 62, height: 62, borderRadius: "50%", background: dsBg(player.ds), boxShadow: "0 4px 16px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "2px solid rgba(255,255,255,0.2)", flexShrink: 0 }}>
          <div style={{ fontFamily: "'DM Mono'", fontSize: "24px", fontWeight: 700, color: "#fff", lineHeight: 1 }}>{player.ds}</div>
          <div style={{ fontSize: "6px", fontWeight: 800, color: "rgba(255,255,255,0.7)", letterSpacing: "0.1em" }}>D-SCORE</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff" }}>{player.name}</div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>{logos[player.club] && <img src={`/data/logos/${logos[player.club]}`} alt="" style={{ width: 13, height: 13, objectFit: "contain" }} />}{player.club} · {player.archetype} · {player.isHome ? "🏠 DOM" : "✈️ EXT"} vs {logos[player.oppName] && <img src={`/data/logos/${logos[player.oppName]}`} alt="" style={{ width: 13, height: 13, objectFit: "contain" }} />}{player.oppName}</div>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {(() => { const pr = getAAProfile(player); return <span title={pr.desc} style={{ fontSize: "9px", fontWeight: 600, color: pr.color, background: `${pr.color}15`, border: `1px solid ${pr.color}25`, padding: "2px 6px", borderRadius: "3px" }}>{pr.emoji} {pr.label}</span>; })()}
            {(() => { const pr = getAAProfile(player); return pr.label === "Pivot" ? <span title="AA5 structurellement bas (~3) — dépend du décisif (but/passe D) pour >60pts" style={{ fontSize: "9px", fontWeight: 600, color: "#F59E0B", background: "#F59E0B15", border: "1px solid #F59E0B25", padding: "2px 6px", borderRadius: "3px" }}>⚠️ Anti-Meta</span> : null; })()}
            {tags.map(t => <span key={t} style={{ fontSize: "9px", fontWeight: 600, color: dsc, background: `${dsc}15`, border: `1px solid ${dsc}25`, padding: "2px 6px", borderRadius: "3px" }}>{t}</span>)}
          </div>
        </div>
      </div>

      {/* Verdict Deglingo */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ fontSize: "8px", fontWeight: 800, color: "rgba(255,255,255,0.25)", letterSpacing: "0.12em", marginBottom: "8px", textTransform: "uppercase" }}>{t(lang,"verdictDeglingo")}</div>
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "10px", borderLeft: `3px solid ${pc}60`, overflow: "hidden" }}>
          {[
            { icon: "📋", title: t(lang,"situationForme").replace("📋 ",""), text: v.situation, col: `${pc}90` },
            { icon: "🎯", title: t(lang,"analyseAdv").replace("🎯 ",""), text: v.adversaire, col: "#F87171" },
            { icon: player.position === "GK" ? "🧤" : "⚙", title: player.position === "GK" ? t(lang,"cleanSheetArrets").replace("🧤 ","") : t(lang,"styleAttendu").replace("⚙ ",""), text: v.style, col: "#FBBF24" },
            { icon: "✅", title: t(lang,"conclusionLabel").replace("✅ ",""), text: v.conclusion, col: "#4ADE80" },
          ].map((s, i) => (
            <div key={i} style={{ padding: "10px 12px", borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none", background: i === 3 ? "rgba(255,255,255,0.02)" : "transparent" }}>
              <div style={{ fontSize: "8px", fontWeight: 700, color: s.col, letterSpacing: "0.08em", marginBottom: "4px", textTransform: "uppercase" }}>{s.icon} {s.title}</div>
              <p style={{ fontSize: "12.5px", lineHeight: 1.65, color: i === 3 ? "#fff" : "rgba(255,255,255,0.8)", margin: 0, fontWeight: i === 3 ? 600 : 400 }}>{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Analyse du match */}
      <div style={{ marginBottom: "14px", padding: "12px", background: `linear-gradient(135deg,${pc}08,rgba(255,255,255,0.02))`, border: `1px solid ${pc}15`, borderRadius: "8px" }}>
        <div style={{ fontSize: "10px", color: `${pc}90`, fontWeight: 800, letterSpacing: "0.12em", marginBottom: "10px" }}>📊 CONTEXTE DU MATCH — {player.name.split(" ").pop().toUpperCase()} vs {player.oppName.toUpperCase()}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "8px" }}>
          {(player.position === "GK" ? [
            { l: `xG de ${player.oppName}`, desc: oppXg < 1.0 ? `${player.oppName} marque très peu → gros potentiel Clean Sheet` : oppXg < 1.3 ? `${player.oppName} est peu dangereux → CS jouable` : oppXg < 1.6 ? `${player.oppName} attaque correctement → CS 50/50` : `${player.oppName} est très offensif → CS compliqué`, v: oppXg.toFixed(2), c: oppXg < 1.2 ? "#4ADE80" : oppXg < 1.5 ? "#FCD34D" : "#F87171" },
            { l: "Probabilité Clean Sheet", desc: csVal >= 35 ? "CS probable → score passe de ~35 à ~60 (Decisive Score)" : csVal >= 22 ? "CS possible → si ça tient, le score explose" : "CS difficile — miser sur les arrêts pour compenser", v: `${csVal}%`, c: csVal >= 35 ? "#4ADE80" : csVal >= 22 ? "#FCD34D" : "#F87171" },
            { l: "Potentiel d'arrêts", desc: oppXg > 1.5 ? `${player.oppName} tire beaucoup → arrêts = AA élevé` : `${player.oppName} tire peu → moins d'arrêts mais CS probable`, v: oppXg > 1.5 ? "Élevé" : oppXg > 1.2 ? "Moyen" : "Faible", c: "#fff", sm: true },
            { l: `Forme de ${player.name.split(" ").pop()}`, desc: es > 10 ? "En pleine confiance, hausse nette" : es > 0 ? "Légère progression, bon signe" : es === 0 ? "Performances stables" : "En baisse — surveiller", v: `${es > 0 ? "+" : ""}${es}%`, c: es > 15 ? "#4ADE80" : es > 0 ? "#FCD34D" : "#F87171" },
          ] : player.position === "DEF" ? [
            { l: "Probabilité Clean Sheet", desc: csVal >= 35 ? `${player.oppName} est peu dangereux → CS très jouable (+10 pts)` : csVal >= 22 ? `CS possible si la défense tient face à ${player.oppName}` : `${player.oppName} est trop offensif → CS compliqué`, v: `${csVal}%`, c: csVal >= 35 ? "#4ADE80" : csVal >= 22 ? "#FCD34D" : "#F87171" },
            { l: `Défense de ${player.oppName}`, desc: oppXga < 1.2 ? `${player.oppName} attaque peu → gros potentiel CS` : `${player.oppName} est offensif → CS compliqué`, v: oppXga.toFixed(2) + " xGA", c: oppXga < 1.2 ? "#4ADE80" : oppXga < 1.5 ? "#FCD34D" : "#F87171" },
            { l: `Pressing de ${player.oppName}`, desc: oppPpda >= 15 ? `${player.oppName} défend bas → le joueur aura le ballon` : oppPpda >= 12 ? `${player.oppName} presse modérément → match classique` : `${player.oppName} presse très haut → duels et espaces`, v: oppPpda.toFixed(1), c: "#fff" },
            { l: `Forme de ${player.name.split(" ").pop()}`, desc: es > 10 ? "En pleine confiance, hausse nette" : es > 0 ? "Légère progression, bon signe" : es === 0 ? "Performances stables" : "En baisse — surveiller", v: `${es > 0 ? "+" : ""}${es}%`, c: es > 15 ? "#4ADE80" : es > 0 ? "#FCD34D" : "#F87171" },
          ] : player.position === "ATT" || (player.archetype || "").includes("Complet") ? (() => {
            const _ap = Math.max(0, player.aa_passing || 0), _ao = Math.max(0, player.aa_possession || 0), _at = Math.max(0, player.aa_attacking || 0);
            const _tot = _ap + _ao + _at + Math.max(0, player.aa_defending || 0) || 1;
            const _pCrea = Math.round((_ap + _ao) / _tot * 100), _pFin = Math.round(_at / _tot * 100);
            const _pPoss = Math.round(_ao / _tot * 100);
            const _ftp = player.final_third_passes_avg || 0;
            const _gpm = (player.goals || 0) / (player.appearances || 1);
            const _isPivot = _pPoss >= 40 && _ftp < 6 && _pFin >= 20;
            const _isDrib = !_isPivot && _ftp >= 9 && _gpm < 0.55 && _pFin >= 20;
            const _isCrea = !_isPivot && !_isDrib && _pCrea >= 60;
            const _isFin = !_isPivot && !_isDrib && _pFin >= 40;
            const _profil = _isPivot ? `🗼 Pivot` : _isDrib ? `🏃 Dribbleur` : _isCrea ? `Créateur ${_pCrea}%` : _isFin ? `Finisseur ${_pFin}%` : `Mixte`;
            // Style de jeu adverse
            const _styleLabel = oppPpda >= 15 ? "Bloc bas" : oppPpda < 12 ? "Pressing haut" : "Équilibré";
            // Impact du style par profil ATT
            const _blocImpact = oppPpda >= 15
              ? (_isCrea ? "Positif" : _isFin ? "Négatif" : "Neutre")
              : oppPpda < 12
              ? (_isDrib ? "Positif" : _isFin ? "Positif" : _isCrea ? "Positif" : "Neutre")
              : "Neutre";
            const _blocColor = _blocImpact === "Positif" ? "#4ADE80" : _blocImpact === "Négatif" ? "#F87171" : "#FCD34D";
            const cards = [
              { l: `Défense de ${player.oppName}`, desc: oppXga > 1.5 ? `${player.oppName} encaisse beaucoup → plein d'occasions` : oppXga > 1.25 ? `${player.oppName} a une défense moyenne → des occasions à saisir` : `${player.oppName} est solide → peu d'espaces`, v: oppXga.toFixed(2) + " xGA", c: oppXga > 1.5 ? "#4ADE80" : oppXga > 1.25 ? "#FCD34D" : "#F87171" },
              { l: `Profil AA de ${player.name.split(" ").pop()}`, desc: _isPivot ? `Pivot : ${_pPoss}% duels/poss, FTP ${_ftp.toFixed(0)} — vit dans la surface` : _isDrib ? `Dribbleur : ${Math.round(_ftp)} FTP/match, percute et crée` : _isCrea ? `Fait son AA en passes/possession (${_pCrea}%)` : _isFin ? `Fait son AA en tirs/dribbles (${_pFin}%)` : `Profil mixte : ${_pCrea}% créa / ${_pFin}% finition`, v: _profil, c: _isPivot ? "#F472B6" : _isDrib ? "#F59E0B" : "#A5B4FC", sm: true },
              { l: `${_styleLabel} vs son profil`, desc: oppPpda >= 15 ? (_isCrea ? `Possession dominante → passes décisives et récups AA qui montent` : _isFin ? `Défense compacte → peu d'espaces pour tirs/dribbles` : `Impact mixte — possession ↑ mais espaces ↓`) : oppPpda < 12 ? (_isDrib ? `JACKPOT : boulevards dans le dos, espaces pour percuter` : _isFin ? `Ligne haute → espaces dans le dos, situations dangereuses` : _isCrea ? `Ligne haute → il va se créer des situations de but en profondeur` : `Match ouvert → transitions et duels`) : `Match équilibré`, v: _blocImpact, c: _blocColor, sm: true },
              { l: `Forme de ${player.name.split(" ").pop()}`, desc: es > 10 ? "En pleine confiance, hausse nette" : es > 0 ? "Légère progression, bon signe" : es === 0 ? "Performances stables" : "En baisse — surveiller", v: `${es > 0 ? "+" : ""}${es}%`, c: es > 15 ? "#4ADE80" : es > 0 ? "#FCD34D" : "#F87171" },
            ];
            if (_isPivot) cards.push({ l: "⚠️ Alerte Meta", desc: `AA5 ~${Math.round(player.aa5)} — doit marquer ou passe D pour >60pts. Pick très risqué.`, v: "Anti-Meta", c: "#F59E0B", sm: true });
            return cards;
          })() : (() => {
            // MIL context cards with domination detection
            const _mTeamXg = player.playerTeam ? (player.playerTeam.xg_dom || 1.3) : 1.3;
            const _mOppXgExt = player.oppTeam ? (player.oppTeam.xg_ext || 1.3) : 1.3;
            const _mDomGap = _mTeamXg - _mOppXgExt;
            const _mIsDom = player.isHome && _mDomGap > 0.5;
            const _mDomBonus = _mIsDom ? Math.round(Math.min(10, (_mDomGap - 0.5) * 14 * Math.min(1.3, player.aa5 / 20))) : 0;
            const cards = [
              { l: `Défense de ${player.oppName}`, desc: oppXga > 1.5 ? `${player.oppName} encaisse beaucoup → plein d'occasions` : `${player.oppName} est solide → moins d'espaces`, v: oppXga.toFixed(2) + " xGA", c: oppXga > 1.6 ? "#4ADE80" : oppXga > 1.2 ? "#FCD34D" : "#F87171" },
              { l: `Pressing de ${player.oppName}`, desc: oppPpda >= 15 ? `Bloc bas → possession garantie, jackpot AA` : oppPpda >= 12 ? `${player.oppName} presse modérément → match classique` : `Pressing haut → match intense, duels et transitions`, v: oppPpda.toFixed(1), c: oppPpda >= 15 ? "#4ADE80" : "#FCD34D" },
            ];
            if (_mIsDom) {
              cards.push({ l: `🔥 Domination à domicile`, desc: `${player.playerTeam ? sn(player.playerTeam.name) : "Son équipe"} (${_mTeamXg.toFixed(2)} xG) vs ${player.oppName} (${_mOppXgExt.toFixed(2)} xG ext) — écart de ${_mDomGap.toFixed(2)} xG. Bonus D-Score : +${_mDomBonus} pts`, v: `+${_mDomBonus}`, c: "#4ADE80" });
            } else {
              cards.push({ l: `Impact pour le milieu`, desc: oppPpda >= 15 ? `Plus de ballon = plus de passes et récups AA` : oppPpda < 12 ? `Match intense = duels et actions AA` : `Match classique`, v: oppPpda >= 15 ? "Jackpot" : oppPpda < 12 ? "Intense" : "Standard", c: oppPpda >= 15 ? "#4ADE80" : "#FCD34D", sm: true });
            }
            cards.push({ l: `Forme de ${player.name.split(" ").pop()}`, desc: es > 10 ? "En pleine confiance, hausse nette" : es > 0 ? "Légère progression, bon signe" : es === 0 ? "Performances stables" : "En baisse — surveiller", v: `${es > 0 ? "+" : ""}${es}%`, c: es > 15 ? "#4ADE80" : es > 0 ? "#FCD34D" : "#F87171" });
            return cards;
          })()).map(item => (
            <div key={item.l} style={{ textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: "6px", padding: "8px 6px" }}>
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)", fontWeight: 700, marginBottom: "2px" }}>{item.l}</div>
              <div style={{ fontFamily: item.sm ? "inherit" : "'DM Mono',monospace", fontSize: item.sm ? "14px" : "22px", fontWeight: 700, color: item.c, margin: "4px 0" }}>{item.v}</div>
              <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.35)", lineHeight: 1.3, fontStyle: "italic" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
        {[
          { label: "L2", score: Math.round(l2), aa: null },
          { label: "L5", score: Math.round(player.l5), aa: Math.round(player.aa5) },
          { label: "MIN", score: player.min_15 ?? player.floor, aa: null },
        ].map(s => (
          <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "8px 6px", textAlign: "center" }}>
            <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "4px" }}>{s.label}</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: "16px", fontWeight: 700, color: "#fff" }}>{s.score}</div>
            {s.aa !== null && <div style={{ fontSize: "7px", color: "#60A5FA", marginTop: "2px" }}>AA {s.aa}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

const MODES = [
  { id: "so5", label: "SO5", desc: "Top 5 · 1 GK · 1 DEF · 1 MIL · 1 ATT · 1 Flex · Max 2/club" },
  { id: "so7", label: "SO7", desc: "Top 7 · 1 GK · 2 DEF · 2 MIL · 2 ATT · Max 2/club (+2% bonus)" },
  { id: "stack", label: "Stack", desc: "Meilleure équipe de 5 joueurs du même club" },
];

export default function RecoTab({ players, teams, fixtures, logos = {}, lang = "fr" }) {
  const [league, setLeague] = useState("L1");
  const [mode, setMode] = useState("so5");
  const [sel, setSel] = useState(null);
  const [stackIdx, setStackIdx] = useState(0);
  const [gambling, setGambling] = useState(false);

  const hasFixtures = !!fixtures?.player_fixtures;
  const matchdays = fixtures?.matchdays || {};

  // All scored players for this league (shared by all modes)
  const allScored = useMemo(() => {
    const lgPlayers = players.filter(p => p.league === league && p.l5 >= 35);
    const lgTeams = teams.filter(t => t.league === league);
    if (!lgTeams.length) return [];
    const pf = fixtures?.player_fixtures || {};
    const todayStr = new Date().toISOString().split("T")[0];
    const maxDateStr = new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0];
    return lgPlayers.map(p => {
      if (p.injured || p.suspended) return null;
      const tituMin = gambling ? 40 : 70;
      if (p.sorare_starter_pct != null && p.sorare_starter_pct < tituMin) return null;
      const fx = pf[p.slug] || pf[p.name];
      if (!fx || !fx.date || fx.date < todayStr || fx.date > maxDateStr) return null;
      const opp = lgTeams.find(t => t.name === fx.opp);
      if (!opp) return null;
      const pTeam = findTeam(lgTeams, p.club);
      const ds = dScoreMatch(p, opp, fx.isHome, pTeam);
      // matchId canonique : pTeam.name (normalisé via lgTeams) évite les mismatches "Toulouse" vs "Toulouse FC"
      const matchId = pTeam ? [pTeam.name, opp.name].sort().join("|") : null;
      return { ...p, ds, oppName: opp.name, oppTeam: opp, playerTeam: pTeam, isHome: fx.isHome, matchId, matchDate: fx.date };
    }).filter(Boolean).sort((a, b) => {
      // GK en dernier — optimiser les joueurs de champ d'abord
      if (a.position === "GK" && b.position !== "GK") return 1;
      if (b.position === "GK" && a.position !== "GK") return -1;
      return b.ds - a.ds;
    });
  }, [players, teams, league, fixtures, gambling]);

  // Top 3 stacks for Stack mode
  const top3Stacks = useMemo(() => {
    const byClub = {};
    for (const p of allScored) {
      if (!byClub[p.club]) byClub[p.club] = [];
      byClub[p.club].push(p);
    }
    const stacks = [];
    for (const [club, pls] of Object.entries(byClub)) {
      const result = [];
      const counts = { GK: 0, DEF: 0, MIL: 0, ATT: 0 };
      for (const p of pls) {
        if (counts[p.position] < 1) {
          result.push({ ...p, isFlex: false });
          counts[p.position]++;
        }
        if (result.length >= 4) break;
      }
      if (result.length < 4) continue;
      for (const p of pls) {
        if (result.find(r => r.name === p.name)) continue;
        if (p.position === "GK") continue;
        result.push({ ...p, isFlex: true });
        break;
      }
      if (result.length < 5) continue;
      const avg = Math.round(result.reduce((s, p) => s + p.ds, 0) / 5 * 10) / 10;
      stacks.push({ club, avg, players: result });
    }
    stacks.sort((a, b) => b.avg - a.avg);
    return stacks.slice(0, 3);
  }, [allScored]);

  // ── Freeze GW ──────────────────────────────────────────────────────────────
  const gwLockKey   = useMemo(() => getGwLockKey(), []);
  const isGwLocked  = !!gwLockKey;
  const bpKey       = gwLockKey ? `bp_${league}_${mode}_${gambling ? "gamble" : "normal"}_${gwLockKey}` : null;
  const frozenPicks = useMemo(() => (bpKey ? loadFrozen(bpKey) : null), [bpKey]);

  // Pick logic per mode
  const computedPicks = useMemo(() => {
    if (mode === "so5") {
      // Cross-match : même match mais équipes différentes (via matchId canonique)
      const wouldConflict = (p, existing) => {
        if (!p.matchId) return false;
        for (const x of existing) {
          if (x.matchId === p.matchId && x.club !== p.club) return true;
        }
        return false;
      };

      // ALGORITHME : top 3 outfield absolus (par ds) → 4e = force poste manquant → meilleur GK
      const outfield = allScored.filter(p => p.position !== "GK");
      const gkPool = allScored.filter(p => p.position === "GK");
      const tryPick4 = (maxClub) => {
        const res = []; const cc = {};
        for (const p of outfield) {
          if (res.length >= 4) break;
          if ((cc[p.club] || 0) >= maxClub) continue;
          if (wouldConflict(p, res)) continue;
          const remaining = 4 - res.length;
          const covered = new Set(res.map(x => x.position));
          const missing = ["DEF", "MIL", "ATT"].filter(pos => !covered.has(pos));
          if (remaining <= missing.length && !missing.includes(p.position)) continue;
          res.push(p); cc[p.club] = (cc[p.club] || 0) + 1;
        }
        return res;
      };
      let picks4 = tryPick4(2);
      if (picks4.length < 4) picks4 = tryPick4(3);
      if (picks4.length < 4) return [];
      // Assigner rôles : DEF/MIL/ATT obligatoires → FLEX = restant
      const usedSlugs = new Set();
      const sorted4 = [...picks4].sort((a, b) => (b.ds || 0) - (a.ds || 0));
      const result = [];
      for (const pos of ["DEF", "MIL", "ATT"]) {
        const p = sorted4.find(x => x.position === pos && !usedSlugs.has(x.slug));
        if (p) { result.push({ ...p, isFlex: false }); usedSlugs.add(p.slug); }
      }
      const flexP = picks4.find(p => !usedSlugs.has(p.slug));
      if (flexP) result.push({ ...flexP, isFlex: true });
      // GK : meilleur dispo (club max 2 parmi les picks outfield, pas de cross-match)
      const picks4ClubCount = picks4.reduce((acc, p) => { acc[p.club] = (acc[p.club] || 0) + 1; return acc; }, {});
      const gk = gkPool.find(p => (picks4ClubCount[p.club] || 0) < 2 && !wouldConflict(p, picks4));
      if (gk) result.push({ ...gk, isFlex: false });
      // Mark captain (highest ds, non-GK preferred)
      const capIdx = result.reduce((best, p, i) =>
        (p.position !== "GK" || result[best].position === "GK") && (p.ds || 0) > (result[best].ds || 0) ? i : best, 0);
      result[capIdx] = { ...result[capIdx], isCaptain: true };
      return result;
    }
    if (mode === "so7") {
      const result = [];
      const quota = { GK: 1, DEF: 2, MIL: 2, ATT: 2 };
      const counts = { GK: 0, DEF: 0, MIL: 0, ATT: 0 };
      const clubCounts = {};
      for (const p of allScored) {
        const cc = clubCounts[p.club] || 0;
        if (counts[p.position] < quota[p.position] && cc < 2) {
          result.push(p);
          counts[p.position]++;
          clubCounts[p.club] = cc + 1;
        }
        if (result.length >= 7) break;
      }
      // Mark captain
      const capIdx7 = result.reduce((best, p, i) =>
        (p.position !== "GK" || result[best].position === "GK") && (p.ds || 0) > (result[best].ds || 0) ? i : best, 0);
      if (result[capIdx7]) result[capIdx7] = { ...result[capIdx7], isCaptain: true };
      return result;
    }
    if (mode === "stack") {
      const res = top3Stacks[stackIdx]?.players || [];
      const capIdx = res.reduce((best, p, i) =>
        (p.position !== "GK" || res[best].position === "GK") && (p.ds || 0) > (res[best].ds || 0) ? i : best, 0);
      if (res[capIdx]) { const r = [...res]; r[capIdx] = { ...r[capIdx], isCaptain: true }; return r; }
      return res;
    }
    return [];
  }, [allScored, mode, top3Stacks, stackIdx]);

  // Save to localStorage when GW is locked and not yet frozen
  useEffect(() => {
    if (isGwLocked && bpKey && !frozenPicks && computedPicks.length > 0) {
      saveFrozen(bpKey, computedPicks);
    }
  }, [isGwLocked, bpKey, frozenPicks, computedPicks]);

  // Valider les picks gelés : si un joueur n'a plus de match valide (fixtures MAJ), recalculer
  const validatedFrozen = useMemo(() => {
    if (!frozenPicks) return null;
    const validSlugs = new Set(allScored.map(p => p.slug));
    const isStale = frozenPicks.some(p => p.slug && !validSlugs.has(p.slug));
    return isStale ? null : frozenPicks;
  }, [frozenPicks, allScored]);

  // Picks finaux : figés si GW démarrée (et valides), sinon live
  const picks = validatedFrozen || computedPicks;

  const lg = LG_META[league];
  const flex = (mode === "so5" || mode === "stack") ? picks.filter(p => p.isFlex) : [];
  const gk = picks.filter(p => p.position === "GK" && !p.isFlex);
  const def = picks.filter(p => p.position === "DEF" && !p.isFlex);
  const mil = picks.filter(p => p.position === "MIL" && !p.isFlex);
  const att = picks.filter(p => p.position === "ATT" && !p.isFlex);

  const selPlayer = sel ? (() => {
    if (sel.startsWith("STACK")) {
      const idx = parseInt(sel.replace("STACK", ""));
      return picks[idx] || null;
    }
    const pos = sel.replace(/\d/g, "");
    const idx = parseInt(sel.replace(/\D/g, ""));
    const arr = pos === "FLEX" ? flex : pos === "GK" ? gk : pos === "DEF" ? def : pos === "MIL" ? mil : att;
    return arr[idx] || null;
  })() : null;

  const modeInfo = MODES.find(m => m.id === mode);
  const stackClub = mode === "stack" && picks.length > 0 ? picks[0].club : null;

  // Score total équipe : tous ×1.1 (+10%) + capitaine ×1.5 (soit ×1.6 total pour cap)
  const teamTotalDs = picks.length > 0 ? (() => {
    const scores = picks.map(p => p.ds || 0);
    const sum = scores.reduce((a, b) => a + b, 0);
    const maxDs = Math.max(...scores);
    return Math.round(sum * 1.1 + maxDs * 0.5);
  })() : null;

  // Score réel : remplace ds par last_so5_score pour joueurs ayant joué cette GW
  // Référence : matchDate du joueur (évite les faux positifs de coupes/UCL entre deux GW)
  const hasRealData = picks.some(p => p.matchDate && p.last_so5_date && p.last_so5_date >= p.matchDate && p.last_so5_score != null);
  const teamRealDs = hasRealData && picks.length > 0 ? (() => {
    const getRealScore = p => {
      const played = p.matchDate && p.last_so5_date && p.last_so5_date >= p.matchDate && p.last_so5_score != null;
      return played ? p.last_so5_score : (p.ds || 0);
    };
    const scores = picks.map(getRealScore);
    const sum = scores.reduce((a, b) => a + b, 0);
    const maxScore = Math.max(...scores);
    return Math.round(sum * 1.1 + maxScore * 0.5);
  })() : null;

  return (
    <div style={{ padding: "0 10px 40px", maxWidth: 480, margin: "0 auto" }}>
      <style>{`
        @keyframes starPulse { 0%,100%{opacity:1;filter:drop-shadow(0 0 4px #FBBF24)} 50%{opacity:0.7;filter:drop-shadow(0 0 8px #FFD700)} }
        @keyframes silverShine { 0%{background-position:200% center} 100%{background-position:-200% center} }
      `}</style>
      {/* League tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "14px" }}>
        {Object.entries(LG_META).map(([k, v]) => (
          <button key={k} onClick={() => { setLeague(k); setSel(null); setStackIdx(0); }} style={{
            flex: 1, padding: "7px 2px", borderRadius: "8px", border: "none", cursor: "pointer",
            background: league === k ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.015)",
            color: league === k ? "#fff" : "rgba(255,255,255,0.22)", fontSize: "11px",
            fontWeight: league === k ? 700 : 500, fontFamily: "Outfit",
            outline: league === k ? `1px solid ${v.accent}40` : "none", transition: "all 0.2s",
          }}>
            <img src={`https://flagcdn.com/w40/${v.flagCode}.png`} alt={v.flagCode} width={16} height={12} style={{ borderRadius: 2, objectFit: "cover" }} /><br /><span style={{ fontSize: "8px" }}>{v.name.length > 10 ? v.name.split(" ")[0] : v.name}</span>
          </button>
        ))}
      </div>

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: "3px", marginBottom: "10px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "3px", border: "1px solid rgba(255,255,255,0.06)" }}>
        {MODES.map(m => (
          <button key={m.id} onClick={() => { setMode(m.id); setSel(null); }} style={{
            flex: 1, padding: "8px 4px", borderRadius: "8px", border: "none", cursor: "pointer",
            background: mode === m.id ? "linear-gradient(135deg,rgba(99,102,241,0.2),rgba(168,85,247,0.2))" : "transparent",
            color: mode === m.id ? "#fff" : "rgba(255,255,255,0.35)", fontSize: "12px",
            fontWeight: mode === m.id ? 700 : 500, fontFamily: "Outfit",
            outline: mode === m.id ? "1px solid rgba(99,102,241,0.4)" : "none", transition: "all 0.2s",
          }}>
            {m.id === "stack" ? "🏟️" : "⚡"} {m.label}
          </button>
        ))}
      </div>

      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
          <div style={{ fontSize: "26px", fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(135deg,#fff 0%,#A5B4FC 40%,#C084FC 80%,#E879F9 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {mode === "stack" ? "STACK OF THE WEEK" : `BEST PICK ${mode.toUpperCase()}`}
          </div>
          {teamTotalDs != null && (
            hasRealData && teamRealDs != null ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 700,
                  color: "rgba(255,255,255,0.3)", textDecoration: "line-through",
                }}>⚡ {teamTotalDs}</span>
                <div style={{
                  background: "linear-gradient(135deg, #15803D, #16A34A)",
                  borderRadius: 10, padding: "3px 10px",
                  fontSize: 13, fontWeight: 900, color: "#fff",
                  fontFamily: "'DM Mono',monospace",
                  boxShadow: "0 0 12px rgba(74,222,128,0.4)",
                  letterSpacing: "0.03em",
                  border: "1px solid rgba(74,222,128,0.4)",
                }}>✓ {teamRealDs}</div>
              </div>
            ) : (
              <div style={{
                background: "linear-gradient(135deg, #7C3AED, #A855F7)",
                borderRadius: 10, padding: "3px 10px",
                fontSize: 13, fontWeight: 900, color: "#fff",
                fontFamily: "'DM Mono',monospace",
                boxShadow: "0 0 12px rgba(139,92,246,0.5)",
                letterSpacing: "0.03em",
                border: "1px solid rgba(196,181,253,0.3)",
              }}>⚡ {teamTotalDs}</div>
            )
          )}
        </div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.45)", marginTop: "2px" }}>
          <img src={`https://flagcdn.com/w40/${lg.flagCode}.png`} alt={lg.flagCode} width={14} height={10} style={{ verticalAlign: "middle", borderRadius: 2, objectFit: "cover", marginRight: 4 }} />{lg.name}{matchdays[league] ? ` · ${lang==="en"?"Matchday":"Journée"} ${matchdays[league]}` : ""}
          {stackClub ? ` · ${stackClub}` : ""}
        </div>
        {!hasFixtures && <div style={{ fontSize: "9px", color: "rgba(255,150,50,0.5)", marginTop: "4px" }}>⚠ {lang==="en"?"No schedule — simulated opponents":"Pas de calendrier — adversaires simulés"}</div>}
        <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.45)", marginTop: "5px" }}>
          {modeInfo.desc}
        </div>
        {/* Bonus explanation */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 5, padding: "3px 10px", background: "rgba(139,92,246,0.08)", borderRadius: 20, border: "1px solid rgba(139,92,246,0.2)" }}>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>⚡ {lang==="en"?"All players":"Tous les joueurs"}</span>
          <span style={{ fontSize: 9, fontWeight: 800, color: "#A78BFA", fontFamily: "'DM Mono',monospace" }}>+10%</span>
          <span style={{ width: 1, height: 10, background: "rgba(255,255,255,0.12)", display: "inline-block" }} />
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>C {lang==="en"?"Captain":"Capitaine"}</span>
          <span style={{ fontSize: 9, fontWeight: 800, color: "#C084FC", fontFamily: "'DM Mono',monospace" }}>+50%+10%</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: "3px" }}>
          <div style={{ fontSize: "9px", color: "#A5B4FC" }}>
            👇 {lang==="en"?"Click a card to see detailed player analysis":"Clique sur une carte pour voir l'analyse détaillée du joueur"}
          </div>
          <button onClick={() => { setGambling(g => !g); setSel(null); }} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 20,
            border: gambling ? "1px solid #F59E0B" : "1px solid rgba(255,255,255,0.1)",
            background: gambling ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.03)",
            cursor: "pointer", transition: "all 0.2s", flexShrink: 0,
          }}>
            <span style={{ fontSize: 11 }}>🎲</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: gambling ? "#F59E0B" : "rgba(255,255,255,0.3)", fontFamily: "Outfit", whiteSpace: "nowrap" }}>
              {gambling ? "≥40%" : "Gamble"}
            </span>
            <div style={{ width: 22, height: 12, borderRadius: 6, background: gambling ? "#F59E0B" : "rgba(255,255,255,0.1)", position: "relative", transition: "all 0.2s" }}>
              <div style={{ position: "absolute", top: 2, left: gambling ? 12 : 2, width: 8, height: 8, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
            </div>
          </button>
        </div>
      </div>

      {/* PITCH */}
      <div style={{
        background: "radial-gradient(ellipse at 50% 0%,rgba(20,90,45,0.5) 0%,transparent 55%),radial-gradient(ellipse at 50% 100%,rgba(20,90,45,0.5) 0%,transparent 55%),linear-gradient(180deg,#0E3F20 0%,#0B3018 25%,#0D3B1E 50%,#0B3018 75%,#0E3F20 100%)",
        borderRadius: "18px", padding: mode === "so7" ? "20px 6px 24px" : "14px 6px 18px", position: "relative", overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 12px 48px rgba(0,0,0,0.6)",
      }}>
        {/* Grid pattern */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.035, backgroundImage: "repeating-linear-gradient(90deg,transparent,transparent 10px,rgba(255,255,255,0.5) 10px,rgba(255,255,255,0.5) 11px)", pointerEvents: "none" }} />
        {/* Field border */}
        <div style={{ position: "absolute", left: "10px", right: "10px", bottom: "10px", top: "10px", borderBottom: "1px solid rgba(255,255,255,0.06)", borderLeft: "1px solid rgba(255,255,255,0.06)", borderRight: "1px solid rgba(255,255,255,0.06)", borderRadius: "0 0 12px 12px", pointerEvents: "none" }} />
        {/* Midline */}
        <div style={{ position: "absolute", top: "50%", left: "14px", right: "14px", height: "1px", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
        {/* Center circle */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 130, height: 130, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.05)", pointerEvents: "none" }} />
        {/* Watermark */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none", zIndex: 0 }}>
          <div style={{ fontWeight: 900, fontSize: "32px", letterSpacing: "0.1em", lineHeight: 1, color: "rgba(255,255,255,0.05)", textTransform: "uppercase" }}>{lg.name}</div>
          <div style={{ fontWeight: 900, fontSize: "18px", letterSpacing: "0.08em", lineHeight: 1.15, color: "rgba(255,255,255,0.06)", textTransform: "uppercase" }}>
            {mode === "stack" ? "STACK\nOF THE\nWEEK".split("\n").map((l,i) => <span key={i}>{l}<br/></span>) : <>DEGLINGO<br/>BEST PICK<br/>{mode.toUpperCase()}</>}
          </div>
        </div>
        {/* Penalty box bottom */}
        <div style={{ position: "absolute", bottom: "3%", left: "22%", right: "22%", height: "16%", borderTop: "1px solid rgba(255,255,255,0.05)", borderLeft: "1px solid rgba(255,255,255,0.05)", borderRight: "1px solid rgba(255,255,255,0.05)", borderRadius: "4px 4px 0 0", pointerEvents: "none" }} />

        {/* Formation */}
        {mode === "so7" ? (
          /* SO7: classic 1-2-2-2 formation */
          <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", gap: "18px", alignItems: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", gap: "80px" }}>
              {att.map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `ATT${i}`} onClick={() => setSel(sel === `ATT${i}` ? null : `ATT${i}`)} logos={logos} isCaptain={p.isCaptain} />)}
            </div>
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", padding: "0 25px" }}>
              {mil.map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `MIL${i}`} onClick={() => setSel(sel === `MIL${i}` ? null : `MIL${i}`)} logos={logos} isCaptain={p.isCaptain} />)}
            </div>
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", padding: "0 10px" }}>
              {def.map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `DEF${i}`} onClick={() => setSel(sel === `DEF${i}` ? null : `DEF${i}`)} logos={logos} isCaptain={p.isCaptain} />)}
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: "-150px" }}>
              {gk.map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `GK${i}`} onClick={() => setSel(sel === `GK${i}` ? null : `GK${i}`)} logos={logos} isCaptain={p.isCaptain} />)}
            </div>
          </div>
        ) : mode === "so5" ? (
          /* SO5: Sorare layout — top: ATT + EX, bottom: DEF + GK + MIL */
          <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", gap: "24px", alignItems: "center", padding: "10px 0" }}>
            <div style={{ display: "flex", justifyContent: "center", gap: "40px" }}>
              {att.map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `ATT${i}`} onClick={() => setSel(sel === `ATT${i}` ? null : `ATT${i}`)} logos={logos} isCaptain={p.isCaptain} />)}
              {flex.map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `FLEX${i}`} onClick={() => setSel(sel === `FLEX${i}` ? null : `FLEX${i}`)} logos={logos} badge="EX" isCaptain={p.isCaptain} />)}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: "20px", alignItems: "flex-start" }}>
              {def.map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `DEF${i}`} onClick={() => setSel(sel === `DEF${i}` ? null : `DEF${i}`)} logos={logos} isCaptain={p.isCaptain} />)}
              <div style={{ marginTop: "50px" }}>
                {gk.map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `GK${i}`} onClick={() => setSel(sel === `GK${i}` ? null : `GK${i}`)} logos={logos} isCaptain={p.isCaptain} />)}
              </div>
              {mil.slice(0, 1).map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `MIL${i}`} onClick={() => setSel(sel === `MIL${i}` ? null : `MIL${i}`)} logos={logos} isCaptain={p.isCaptain} />)}
            </div>
          </div>
        ) : (
          /* Stack: same layout as SO5 — ATT + EX top, DEF + GK↓ + MIL bottom */
          <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", gap: "24px", alignItems: "center", padding: "10px 0" }}>
            <div style={{ display: "flex", justifyContent: "center", gap: "40px" }}>
              {att.map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `ATT${i}`} onClick={() => setSel(sel === `ATT${i}` ? null : `ATT${i}`)} logos={logos} isCaptain={p.isCaptain} />)}
              {flex.map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `FLEX${i}`} onClick={() => setSel(sel === `FLEX${i}` ? null : `FLEX${i}`)} logos={logos} badge="EX" isCaptain={p.isCaptain} />)}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: "20px", alignItems: "flex-start" }}>
              {def.map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `DEF${i}`} onClick={() => setSel(sel === `DEF${i}` ? null : `DEF${i}`)} logos={logos} isCaptain={p.isCaptain} />)}
              <div style={{ marginTop: "50px" }}>
                {gk.map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `GK${i}`} onClick={() => setSel(sel === `GK${i}` ? null : `GK${i}`)} logos={logos} isCaptain={p.isCaptain} />)}
              </div>
              {mil.slice(0, 1).map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `MIL${i}`} onClick={() => setSel(sel === `MIL${i}` ? null : `MIL${i}`)} logos={logos} isCaptain={p.isCaptain} />)}
            </div>
          </div>
        )}
      </div>

      {/* Stack Podium — Top 3 */}
      {mode === "stack" && top3Stacks.length > 0 && (
        <div style={{ marginTop: "14px", background: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{ padding: "10px 14px 6px", fontSize: "9px", fontWeight: 800, color: "rgba(255,255,255,0.3)", letterSpacing: "0.12em", textTransform: "uppercase" }}>🏆 Top 3 Stack · <img src={`https://flagcdn.com/w40/${lg.flagCode}.png`} alt={lg.flagCode} width={12} height={9} style={{ verticalAlign: "middle", borderRadius: 1, objectFit: "cover", margin: "0 3px" }} />{lg.name}</div>
          {top3Stacks.map((s, i) => {
            const medal = ["🥇", "🥈", "🥉"][i];
            const isActive = i === stackIdx;
            return (
              <div key={s.club} onClick={() => { setStackIdx(i); setSel(null); }}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "10px 14px", cursor: "pointer", transition: "all 0.2s",
                  background: isActive ? "rgba(99,102,241,0.1)" : "transparent",
                  borderLeft: isActive ? "3px solid #6366F1" : "3px solid transparent",
                  borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none",
                }}>
                <span style={{ fontSize: "18px" }}>{medal}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: "0 0 auto" }}>
                  {logos[s.club] && <img src={`/data/logos/${logos[s.club]}`} alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />}
                  <span style={{ fontSize: "13px", fontWeight: 700, color: isActive ? "#fff" : "rgba(255,255,255,0.7)" }}>{sn(s.club)}</span>
                </div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: "14px", fontWeight: 700, color: dsColor(s.avg), marginLeft: "auto", flexShrink: 0 }}>{s.avg}</div>
                <div style={{ display: "flex", gap: "3px", flexShrink: 0 }}>
                  {s.players.map((p, j) => (
                    <div key={j} style={{
                      fontSize: "8px", fontWeight: 700, padding: "2px 4px", borderRadius: "3px",
                      background: `${PC[p.position]}20`, color: PC[p.position],
                      border: `1px solid ${PC[p.position]}30`,
                    }}>{p.ds}</div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail panel */}
      <DetailPanel player={selPlayer} logos={logos} allPicks={allScored} lang={lang} />

      {/* CTA */}
      <div style={{ marginTop: "12px", padding: "18px", textAlign: "center", background: "linear-gradient(135deg,rgba(34,197,94,0.05),rgba(99,102,241,0.05))", border: "1px solid rgba(34,197,94,0.12)", borderRadius: "12px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>🎯 Joue ce {mode === "stack" ? "Stack" : mode.toUpperCase()} sur Sorare</div>
        <a href="http://sorare.pxf.io/Deglingo" target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", padding: "10px 28px", borderRadius: "10px", background: "linear-gradient(135deg,#22C55E,#16A34A)", color: "#fff", fontSize: "13px", fontWeight: 700, textDecoration: "none", boxShadow: "0 4px 16px rgba(34,197,94,0.25)" }}>Créer mon compte →</a>
      </div>
    </div>
  );
}
