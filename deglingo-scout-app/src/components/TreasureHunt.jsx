import { useState, useEffect } from "react";

// ═══ Chasse au Trésor — Bruno Fernandes Limited 1/1000 ═══
// 5 énigmes (1 par onglet) + code final à tweeter
//
// Anti-spoilers minimal : les réponses sont en clair dans le code (réseau Twitter,
// Damien fait le tirage parmi tous les RT, le code n'est qu'un proof-of-engagement).
// Les comparaisons sont case-insensitive et trim.

const ENIGMAS = [
  {
    id: 1, icon: "🔍",
    tab: { fr: "Database", en: "Database" },
    title: { fr: "Le titre du roi", en: "The king's title" },
    intro: {
      fr: "Le Maestro porte un sceau qui ne se donne qu'aux légendes. Qui sont ses pairs dans la Database ?",
      en: "The Maestro bears a seal granted only to legends. Who are his peers in the Database?",
    },
    question: {
      fr: "Le porteur du #8 d'Old Trafford partage un même titre avec une poignée d'élus dans la base. Ce mot final, qui consacre les immortels du football, est ta réponse.",
      en: "The bearer of #8 at Old Trafford shares one and the same title with a handful of elite players in the Database. That final word, the one given to football immortals, is your answer.",
    },
    hint: {
      fr: "Indice : tape le nom du Maestro dans la barre de recherche Database. La colonne Archétype affiche son rang. Il y a deux mots : prends le second.",
      en: "Hint: type the Maestro's name in the Database search bar. The Archetype column shows his rank. Two words — take the last one.",
    },
    answer: "GOAT",
  },
  {
    id: 2, icon: "🛡",
    tab: { fr: "Database", en: "Database" },
    title: { fr: "Le rempart belge", en: "The Belgian wall" },
    intro: {
      fr: "Dans la toute première ligue couverte par Sorare, un jeune mur se dresse...",
      en: "In the very first league ever covered by Sorare, a young wall rises...",
    },
    question: {
      fr: "Dans la première ligue qui apparut sur Sorare au lancement, fouille parmi les U23. Quel est le nom de famille du jeune Belge qui dégage le plus de ballons par match (le roi du Clr) ? Attention : le tout premier au classement n'est pas belge — il faut le suivant.",
      en: "In the very first league Sorare ever covered at launch, dig through the U23s. What is the surname of the young Belgian player who clears the most balls per match (the King of Clr)? Careful: the very first in the ranking is not Belgian — you'll need the next one.",
    },
    hint: {
      fr: "Indice : la première ligue Sorare = la Jupiler Pro League belge (JPL). Database → filtre JPL + U23 → ouvre les Stats AA (toutes) → trie par 'Clr' (Dégagements/match). Le premier est Serbe, le second est Belge — c'est lui ta réponse. 5 lettres.",
      en: "Hint: the first Sorare league = the Belgian Jupiler Pro League (JPL). Database → filter JPL + U23 → open all AA Stats → sort by 'Clr' (Clearances/match). The first one is Serbian, the second is Belgian — that's your answer. 5 letters.",
    },
    answer: "Smets",
    altAnswers: ["smets", "SMETS", "Matte Smets", "matte smets"],
  },
  {
    id: 3, icon: "✨",
    tab: { fr: "Sorare Stellar", en: "Sorare Stellar" },
    title: { fr: "Le pacte de l'étoile", en: "The pact of the star" },
    intro: {
      fr: "Stellar te demande un pacte précis. Combien de pierres pour bâtir le temple ?",
      en: "Stellar asks for a precise pact. How many stones to build the temple?",
    },
    question: {
      fr: "L'étoile filante n'attend que tes choix. Sur le pré stellaire, compte tous les emplacements vides où poser une carte — du gardien jusqu'au joker.",
      en: "The shooting star awaits your picks. On the Stellar pitch, count every empty slot where a card may rest — from keeper to joker.",
    },
    hint: {
      fr: "Indice : ouvre Sorare Stellar. Tu vois un pitch vide avec des emplacements (GK, DEF, MIL, ATT, FLEX). Compte-les.",
      en: "Hint: open Sorare Stellar. You see an empty pitch with slots (GK, DEF, MIL, ATT, FLEX). Count them.",
    },
    answer: "5",
  },
  {
    id: 4, icon: "📋",
    tab: { fr: "Mes Teams", en: "My Teams" },
    title: { fr: "L'éclair suprême", en: "The supreme bolt" },
    intro: {
      fr: "L'éclair stellaire culmine vers un trésor. Trouve son sommet en billets verts.",
      en: "The Stellar bolt soars to a treasure. Find its peak in green bills.",
    },
    question: {
      fr: "La fusée Stellar a un palier ultime, le plus haut, brillant en lettres dorées. Un nombre précieux suivi de trois zéros. Donne-le entier, sans symbole, sans espace.",
      en: "The Stellar rocket has an ultimate tier, the highest one, glowing in golden letters. A precious number followed by three zeros. Give it whole — no symbol, no space.",
    },
    hint: {
      fr: "Indice : Mes Teams → sauvegarde au moins une équipe Stellar (sinon la jauge n'apparaît pas) → tout en haut de la jauge dorée tu lis le palier max.",
      en: "Hint: My Teams → save at least one Stellar team (else the gauge stays hidden) → at the very top of the golden gauge you'll read the max tier.",
    },
    answer: "1000",
    altAnswers: ["1 000", "1.000"],
  },
  {
    id: 5, icon: "🥊",
    tab: { fr: "Fight", en: "Fight" },
    title: { fr: "Le duel des couronnes", en: "Duel of the crowns" },
    intro: {
      fr: "Le Maestro descend dans l'arène. Qui ose défier sa couronne ? Trouve-le, et un secret se dévoilera...",
      en: "The Maestro steps into the arena. Who dares to challenge his crown? Find him — and a secret shall reveal itself...",
    },
    question: {
      fr: "Sur Fight, oppose le Maestro à son rival le plus jeune et le plus brillant — un prodige catalan de 18 ans qui n'a peur de rien et qui rêve de prendre la couronne. Si le bon duel est lancé, un trésor doré apparaît dans le verdict.",
      en: "In Fight, pit the Maestro against his youngest, brightest rival — an 18-year-old Catalan prodigy who fears no one and dreams of stealing the crown. If the right duel is launched, a golden treasure appears in the verdict.",
    },
    hint: {
      fr: "Indice : son prénom commence par L, son nom rime avec 'Carnaval'. FC Barcelona, futur n°10. Lance le Fight Bruno Fernandes (Man Utd) vs lui, un fragment doré apparaîtra dans le résultat.",
      en: "Hint: his first name starts with L, his last rhymes with 'Carnaval'. FC Barcelona, future #10. Launch Fight Bruno Fernandes (Man Utd) vs him — a golden fragment appears in the verdict.",
    },
    answer: "61",
  },
  {
    id: 6, icon: "⚡",
    tab: { fr: "Easter Egg", en: "Easter Egg" },
    title: { fr: "L'éclair caché", en: "The hidden lightning" },
    intro: {
      fr: "Quelque part sur le site, un éclair doré scintille discrètement. Trouve-le — il garde le numéro du Maestro.",
      en: "Somewhere on the site, a golden bolt gleams discreetly. Find it — it holds the Maestro's number.",
    },
    question: {
      fr: "Un éclair doré (⚡) clignote très, très subtilement quelque part dans l'application. Pas dans la landing — il faut entrer dans l'app. Quand tu cliqueras dessus, il te dévoilera un nombre. Quel est-il ?",
      en: "A golden lightning (⚡) twinkles very, very subtly somewhere in the application. Not on the landing — you must enter the app. Click it, and it will reveal a number. What is it?",
    },
    hint: {
      fr: "Indice : descends, descends... tout en bas. Le pied de la maison cache un secret. Et si rien ne brille, attends quelques secondes — l'éclair ne se montre que par éclats.",
      en: "Hint: scroll down, down... to the very bottom. The foot of the house hides a secret. And if nothing shines, wait a few seconds — the bolt only flashes in bursts.",
    },
    answer: "8",
  },
];

const T = {
  fr: {
    eyebrow: "🎁 GIVEAWAY",
    title: "La Chasse au Maestro",
    subtitle: <>Résous les 6 énigmes cachées sur le site pour découvrir le <b style={{ color: "#FBBF24" }}>Code Bruno</b>.<br/>Tweete-le en RT pour gagner la carte <b style={{ color: "#FBBF24" }}>Bruno Fernandes Limited #61</b> 🐐</>,
    progress: "énigmes résolues",
    enigmaPrefix: "ÉNIGME",
    placeholder: "Ta réponse…",
    validate: "Valider",
    showHint: "💡 Voir un indice",
    hideHint: "Cacher l'indice",
    doneEyebrow: "✅ CHASSE TERMINÉE",
    doneTitle: "Voici le Code Bruno 🐐",
    tweetBtn: "𝕏 Tweeter le Code Bruno",
    tweetFooter: <>Le tirage au sort aura lieu parmi les RT du Tweet de lancement.<br/>Bonne chance ! 🎁</>,
    reset: "Recommencer la chasse",
    closeAria: "Fermer",
    tweetText: (code) => `J'ai trouvé le Code Bruno : ${code}\n\n🐐 Bruno Fernandes Limited #61 à gagner avec @DeglingoMPG sur @Sorare\n\nRT pour participer ! 🎁\n\nLance la chasse → deglingosorare.com\n\n#ChasseDeglingo`,
    launchEyebrow: "📢 Lance la chasse",
    launchText: "Tweete pour annoncer que tu participes — fais découvrir le site à tes followers !",
    launchBtn: "𝕏 Tweeter le lancement",
    gateEyebrow: "🔐 PORTE DU MAESTRO",
    gateTitle: "Annonce ta quête",
    gateText: "Le Maestro n'ouvre ses portes qu'à ceux qui annoncent leur quête au monde. Tweete ton lancement pour débloquer les 6 énigmes.",
    gateBtn: "Tweeter et débloquer la chasse",
    gateFooter: "(le tweet ouvre dans un nouvel onglet — la chasse se débloquera dès que tu auras lancé l'envoi)",
    relaunch: "Re-tweeter le lancement",
  },
  en: {
    eyebrow: "🎁 GIVEAWAY",
    title: "The Maestro Hunt",
    subtitle: <>Solve the 6 riddles hidden across the site to uncover the <b style={{ color: "#FBBF24" }}>Bruno Code</b>.<br/>Tweet it as RT to win the <b style={{ color: "#FBBF24" }}>Bruno Fernandes Limited #61</b> card 🐐</>,
    progress: "riddles solved",
    enigmaPrefix: "RIDDLE",
    placeholder: "Your answer…",
    validate: "Submit",
    showHint: "💡 Show a hint",
    hideHint: "Hide hint",
    doneEyebrow: "✅ HUNT COMPLETE",
    doneTitle: "Here is the Bruno Code 🐐",
    tweetBtn: "𝕏 Tweet the Bruno Code",
    tweetFooter: <>The draw will happen among the RTs of the launch tweet.<br/>Good luck! 🎁</>,
    reset: "Restart the hunt",
    closeAria: "Close",
    tweetText: (code) => `I just cracked the Bruno Code: ${code}\n\n🐐 Bruno Fernandes Limited #61 up for grabs with @DeglingoMPG on @Sorare\n\nRT to enter the giveaway! 🎁\n\nStart the hunt → deglingosorare.com\n\n#ChasseDeglingo`,
    launchEyebrow: "📢 Start the hunt",
    launchText: "Tweet that you're joining — make your followers discover the site!",
    launchBtn: "𝕏 Tweet the launch",
    gateEyebrow: "🔐 THE MAESTRO'S GATE",
    gateTitle: "Announce your quest",
    gateText: "The Maestro only opens his gate to those who declare their quest to the world. Tweet your launch to unlock the 6 riddles.",
    gateBtn: "Tweet and unlock the hunt",
    gateFooter: "(the tweet opens in a new tab — the hunt unlocks as soon as you trigger the share)",
    relaunch: "Re-tweet the launch",
  },
};

const FINAL_CODE = "GOAT-SMETS-5-1000-61-8";
const STORAGE_KEY = "deglingo_treasure_v2";

const LAUNCH_TWEET = {
  fr: `🎁 Je me lance dans la Chasse au Trésor @DeglingoMPG 🐐\n\nUne carte Bruno Fernandes Limited #61 @Sorare attend son scout dans l'ombre...\n\n⚡ Viens vite rejoindre l'aventure avant que le trésor ne soit trouvé.\n\ndeglingosorare.com\n\n#ChasseDeglingo`,
  en: `🎁 I'm entering the Treasure Hunt by @DeglingoMPG 🐐\n\nA Bruno Fernandes Limited #61 @Sorare card waits for its scout in the shadows...\n\n⚡ Hurry — join the adventure before the treasure is found.\n\ndeglingosorare.com\n\n#ChasseDeglingo`,
};

const norm = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, "");
const checkAnswer = (input, enigma) => {
  const ni = norm(input);
  if (ni === norm(enigma.answer)) return true;
  if (enigma.altAnswers && enigma.altAnswers.some(a => norm(a) === ni)) return true;
  return false;
};

export default function TreasureHunt({ open, onClose, lang: langProp = "fr" }) {
  const [lang, setLang] = useState(langProp);
  useEffect(() => { setLang(langProp); }, [langProp]);
  const tr = T[lang] || T.fr;

  const [solved, setSolved] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw).solved || 0;
    } catch {}
    return 0;
  });
  const [inputs, setInputs] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw).inputs || {};
    } catch {}
    return {};
  });
  // Gate viral : les enigmes ne s'ouvrent qu'apres tweet de lancement
  const [launched, setLaunched] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return !!JSON.parse(raw).launched;
    } catch {}
    return false;
  });
  const [currentIdx, setCurrentIdx] = useState(0);
  const [errorShake, setErrorShake] = useState(null);
  const [showHint, setShowHint] = useState(false);

  // Synchronise currentIdx avec la 1ere enigme non resolue a l'ouverture
  useEffect(() => {
    if (open && solved < ENIGMAS.length) setCurrentIdx(solved);
  }, [open]);

  // Persiste le progress dans localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ solved, inputs, launched }));
    } catch {}
  }, [solved, inputs, launched]);

  if (!open) return null;

  const setInput = (id, val) => setInputs(prev => ({ ...prev, [id]: val }));

  const submit = (idx) => {
    const enigma = ENIGMAS[idx];
    const input = inputs[enigma.id] || "";
    if (checkAnswer(input, enigma)) {
      if (idx + 1 > solved) setSolved(idx + 1);
      setShowHint(false);
      if (idx < ENIGMAS.length - 1) setCurrentIdx(idx + 1);
    } else {
      setErrorShake(idx);
      setTimeout(() => setErrorShake(null), 600);
    }
  };

  const reset = () => {
    setSolved(0);
    setInputs({});
    setCurrentIdx(0);
    setShowHint(false);
    setLaunched(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  const triggerLaunch = () => {
    // Mark as launched + open Twitter
    setLaunched(true);
    try {
      window.open(launchTweetUrl, "_blank", "noopener,noreferrer");
    } catch {}
  };

  const allDone = solved >= ENIGMAS.length;
  const activeIdx = allDone ? -1 : Math.min(currentIdx, solved);

  const tweetText = encodeURIComponent(tr.tweetText(FINAL_CODE));
  const tweetUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;
  const launchTweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(LAUNCH_TWEET[lang] || LAUNCH_TWEET.fr)}`;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(2,1,15,0.94)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 14, animation: "treasureFadeIn 0.3s ease-out",
      }}
    >
      <style>{`
        @keyframes treasureFadeIn { 0%{opacity:0} 100%{opacity:1} }
        @keyframes treasureSlideUp { 0%{opacity:0;transform:translateY(20px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes treasureShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }
        @keyframes treasureGoldShine { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        @keyframes treasurePulse {
          0%,100% { box-shadow: 0 0 18px rgba(251,191,36,0.4), 0 0 50px rgba(251,191,36,0.2); }
          50%     { box-shadow: 0 0 32px rgba(251,191,36,0.7), 0 0 80px rgba(251,191,36,0.4); }
        }
        .treasure-modal {
          width: 100%; max-width: 720px; max-height: calc(100vh - 28px);
          display: flex; flex-direction: column;
          background: linear-gradient(180deg, rgba(20,8,50,0.98), rgba(8,3,28,0.98));
          border: 1px solid rgba(251,191,36,0.3);
          border-radius: 16px;
          padding: 14px 18px 16px;
          animation: treasureSlideUp 0.4s cubic-bezier(.2,.7,.3,1) both;
          box-shadow: 0 20px 60px rgba(0,0,0,0.7), 0 0 30px rgba(251,191,36,0.15);
          color: #fff; font-family: Outfit, sans-serif;
          position: relative;
        }
        .treasure-close {
          width: 26px; height: 26px; border-radius: 7px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.7); font-size: 13px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s; flex-shrink: 0;
        }
        .treasure-close:hover { background: rgba(239,68,68,0.2); color: #fff; border-color: rgba(239,68,68,0.5); }
        .treasure-lang-toggle {
          height: 26px; padding: 0 8px; border-radius: 7px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.65); font-size: 10px; font-weight: 800; cursor: pointer;
          letter-spacing: 1px; flex-shrink: 0;
          font-family: Outfit;
        }
        .treasure-lang-toggle:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .treasure-title-gradient {
          background: linear-gradient(90deg,#FBBF24,#F59E0B,#FCD34D,#FBBF24);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: treasureGoldShine 3s linear infinite;
        }
        .enigma-row {
          border-radius: 10px; padding: 8px 12px; margin-bottom: 6px;
          transition: all 0.25s ease; position: relative;
          display: flex; align-items: center; gap: 10px;
        }
        .enigma-row.locked { background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.08); opacity: 0.5; }
        .enigma-row.solved { background: linear-gradient(135deg, rgba(74,222,128,0.08), rgba(74,222,128,0.02)); border: 1px solid rgba(74,222,128,0.35); }
        .enigma-card-active {
          border-radius: 12px; padding: 12px 14px; margin-bottom: 6px;
          background: linear-gradient(135deg, rgba(251,191,36,0.10), rgba(251,191,36,0.03));
          border: 1px solid rgba(251,191,36,0.45);
          box-shadow: 0 0 22px rgba(251,191,36,0.18), inset 0 1px 0 rgba(255,255,255,0.06);
          transition: all 0.25s ease; position: relative;
        }
        .enigma-card-active.shake { animation: treasureShake 0.4s; }
        .treasure-input {
          flex: 1; padding: 8px 12px; border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(0,0,0,0.4); color: #fff;
          font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 700;
          letter-spacing: 0.04em; outline: none; transition: all 0.15s;
        }
        .treasure-input:focus { border-color: #FBBF24; box-shadow: 0 0 0 2px rgba(251,191,36,0.2); }
        .treasure-btn-validate {
          padding: 8px 16px; border-radius: 8px; border: none;
          background: linear-gradient(135deg, #FBBF24, #F59E0B);
          color: #1a0f00; font-weight: 900; font-size: 12px; cursor: pointer;
          box-shadow: 0 0 14px rgba(251,191,36,0.4); transition: all 0.15s;
          font-family: Outfit;
        }
        .treasure-btn-validate:hover { transform: translateY(-1px); box-shadow: 0 0 22px rgba(251,191,36,0.6); }
        .treasure-fragment {
          display: inline-block; padding: 4px 10px; border-radius: 6px;
          background: linear-gradient(135deg, rgba(74,222,128,0.18), rgba(74,222,128,0.08));
          border: 1px solid rgba(74,222,128,0.4);
          color: #4ADE80; font-family: 'DM Mono', monospace;
          font-weight: 900; font-size: 12px; letter-spacing: 0.05em;
        }
        .treasure-final-code {
          padding: 10px 16px; border-radius: 10px;
          background: linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.05));
          border: 1px solid rgba(251,191,36,0.5);
          font-family: 'DM Mono', monospace; font-size: 20px; font-weight: 900;
          letter-spacing: 0.12em; color: #FBBF24; text-align: center;
          animation: treasurePulse 2s ease-in-out infinite;
        }
        .treasure-tweet-btn {
          width: 100%; padding: 11px 18px; border-radius: 10px; border: none;
          background: linear-gradient(135deg, #1DA1F2, #0d8bd9);
          color: #fff; font-weight: 900; font-size: 13px; cursor: pointer;
          letter-spacing: 0.04em; box-shadow: 0 0 18px rgba(29,161,242,0.4);
          transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;
          text-decoration: none; font-family: Outfit;
        }
        .treasure-tweet-btn:hover { transform: translateY(-1px); box-shadow: 0 0 28px rgba(29,161,242,0.7); }
        .treasure-progress-dot { width: 8px; height: 8px; border-radius: 50%; transition: all 0.3s; }
        .treasure-progress-dot.done { background: #4ADE80; box-shadow: 0 0 8px rgba(74,222,128,0.6); }
        .treasure-progress-dot.current { background: #FBBF24; box-shadow: 0 0 10px rgba(251,191,36,0.8); }
        .treasure-progress-dot.todo { background: rgba(255,255,255,0.15); }
        .treasure-scroll {
          flex: 1; min-height: 0; overflow-y: auto;
          margin: 0 -4px; padding: 0 4px;
        }
        .treasure-scroll::-webkit-scrollbar { width: 4px; }
        .treasure-scroll::-webkit-scrollbar-thumb { background: rgba(251,191,36,0.3); border-radius: 4px; }
      `}</style>

      <div className="treasure-modal" onClick={e => e.stopPropagation()}>
        {/* Header compact */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(251,191,36,0.7)", letterSpacing: "0.18em", marginBottom: 2 }}>
              {tr.eyebrow}
            </div>
            <div className="treasure-title-gradient" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.02em", lineHeight: 1.1 }}>
              {tr.title}
            </div>
          </div>
          {/* Progress dots inline */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {ENIGMAS.map((_, i) => (
              <div key={i} className={`treasure-progress-dot ${i < solved ? "done" : i === activeIdx ? "current" : "todo"}`} />
            ))}
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Mono',monospace", marginLeft: 4 }}>
              {solved}/{ENIGMAS.length}
            </span>
          </div>
          <button
            className="treasure-lang-toggle"
            onClick={() => setLang(l => l === "fr" ? "en" : "fr")}
            title="FR / EN"
          >
            {lang === "fr" ? "EN" : "FR"}
          </button>
          <button className="treasure-close" onClick={onClose} aria-label={tr.closeAria}>✕</button>
        </div>

        {/* Sous-titre court */}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.45, marginBottom: 8 }}>
          {tr.subtitle}
        </div>

        {/* ═══ GATE — PORTE DU MAESTRO : faut tweeter pour debloquer ═══ */}
        {!launched && (
          <div className="treasure-scroll" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              width: "100%", padding: "26px 22px",
              borderRadius: 16,
              background: "linear-gradient(135deg, rgba(29,161,242,0.12) 0%, rgba(167,139,250,0.08) 50%, rgba(29,161,242,0.12) 100%)",
              border: "1px solid rgba(29,161,242,0.45)",
              boxShadow: "0 0 30px rgba(29,161,242,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
              textAlign: "center", position: "relative", overflow: "hidden",
            }}>
              {/* Halo en fond */}
              <span aria-hidden style={{
                position: "absolute", top: "-40%", left: "50%", transform: "translateX(-50%)",
                width: 320, height: 320, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(29,161,242,0.25), transparent 60%)",
                pointerEvents: "none", filter: "blur(8px)",
              }} />
              <div style={{ position: "relative", zIndex: 2 }}>
                <div style={{ fontSize: 36, marginBottom: 6 }}>🔐</div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#1DA1F2", letterSpacing: "0.2em", marginBottom: 8 }}>
                  {tr.gateEyebrow}
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 900, marginBottom: 10, letterSpacing: "0.02em",
                  background: "linear-gradient(90deg,#A7F3D0,#FFFFFF,#A7F3D0,#6EE7B7)",
                  backgroundSize: "200% 100%",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                  animation: "treasureCtaShineText 4s linear infinite",
                }}>
                  {tr.gateTitle}
                </div>
                <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)", lineHeight: 1.5, marginBottom: 18, maxWidth: 460, margin: "0 auto 18px" }}>
                  {tr.gateText}
                </div>
                <button
                  onClick={triggerLaunch}
                  style={{
                    padding: "13px 28px", borderRadius: 999, border: "none",
                    background: "linear-gradient(135deg, #1DA1F2 0%, #0d8bd9 50%, #1DA1F2 100%)",
                    backgroundSize: "200% 100%",
                    color: "#fff", fontWeight: 900, fontSize: 14, letterSpacing: "0.05em",
                    cursor: "pointer", fontFamily: "Outfit",
                    boxShadow: "0 0 26px rgba(29,161,242,0.55), 0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25)",
                    display: "inline-flex", alignItems: "center", gap: 10,
                    transition: "transform 0.2s, box-shadow 0.2s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px) scale(1.03)"; e.currentTarget.style.boxShadow = "0 0 40px rgba(29,161,242,0.85), 0 6px 18px rgba(0,0,0,0.4)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0) scale(1)"; e.currentTarget.style.boxShadow = "0 0 26px rgba(29,161,242,0.55), 0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25)"; }}
                >
                  <span style={{ fontSize: 18 }}>𝕏</span>
                  <span>{tr.gateBtn}</span>
                </button>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 14, fontStyle: "italic" }}>
                  {tr.gateFooter}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Enigmas — accordion : active en grand, locked/solved en mini-row (visible APRES gate) */}
        {launched && (
        <div className="treasure-scroll">
          {ENIGMAS.map((eg, i) => {
            const isSolved = i < solved;
            const isActive = i === activeIdx && !isSolved;
            const isLocked = !isSolved && !isActive;
            const tab = eg.tab[lang] || eg.tab.fr;
            const title = eg.title[lang] || eg.title.fr;
            const intro = eg.intro[lang] || eg.intro.fr;
            const question = eg.question[lang] || eg.question.fr;
            const hint = eg.hint[lang] || eg.hint.fr;

            // Mode mini-row pour locked + solved
            if (!isActive) {
              return (
                <div key={eg.id} className={`enigma-row ${isSolved ? "solved" : "locked"}`}>
                  <span style={{ fontSize: 16, opacity: isLocked ? 0.5 : 1, flexShrink: 0 }}>
                    {isLocked ? "🔒" : eg.icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 8, fontWeight: 800, color: isSolved ? "#4ADE80" : "rgba(255,255,255,0.4)", letterSpacing: "0.12em", flexShrink: 0 }}>
                      {tr.enigmaPrefix} {eg.id} · {tab.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: isLocked ? "rgba(255,255,255,0.4)" : "#fff", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {title}
                    </span>
                  </div>
                  {isSolved && <span className="treasure-fragment">{eg.answer}</span>}
                </div>
              );
            }

            // Mode actif (énigme en cours)
            return (
              <div key={eg.id} className={`enigma-card-active ${errorShake === i ? "shake" : ""}`}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 18 }}>{eg.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "#FBBF24", letterSpacing: "0.12em" }}>
                      {tr.enigmaPrefix} {eg.id} · {tab.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: "#fff", lineHeight: 1.2 }}>
                      {title}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 6, fontStyle: "italic", lineHeight: 1.4 }}>
                  {intro}
                </div>
                <div style={{ fontSize: 12.5, color: "#fff", marginBottom: 8, lineHeight: 1.5 }}>
                  {question}
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input
                    className="treasure-input"
                    placeholder={tr.placeholder}
                    value={inputs[eg.id] || ""}
                    onChange={e => setInput(eg.id, e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") submit(i); }}
                    autoFocus
                  />
                  <button className="treasure-btn-validate" onClick={() => submit(i)}>
                    {tr.validate}
                  </button>
                </div>
                <button
                  onClick={() => setShowHint(s => !s)}
                  style={{
                    background: "transparent", border: "none", color: "rgba(255,255,255,0.45)",
                    fontSize: 10, cursor: "pointer", textDecoration: "underline", padding: 0,
                    fontFamily: "Outfit",
                  }}
                >
                  {showHint ? tr.hideHint : tr.showHint}
                </button>
                {showHint && (
                  <div style={{ marginTop: 5, fontSize: 10.5, color: "rgba(255,255,255,0.55)", fontStyle: "italic", padding: "5px 9px", background: "rgba(255,255,255,0.03)", borderRadius: 6, borderLeft: "2px solid #FBBF24", lineHeight: 1.4 }}>
                    {hint}
                  </div>
                )}
              </div>
            );
          })}

          {/* Final code section — visible quand allDone */}
          {allDone && (
            <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 12, background: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(74,222,128,0.06))", border: "1px solid rgba(251,191,36,0.4)" }}>
              <div style={{ textAlign: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#4ADE80", letterSpacing: "0.16em", marginBottom: 3 }}>
                  {tr.doneEyebrow}
                </div>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#fff", marginBottom: 8 }}>
                  {tr.doneTitle}
                </div>
                <div className="treasure-final-code">{FINAL_CODE}</div>
              </div>
              <a href={tweetUrl} target="_blank" rel="noopener noreferrer" className="treasure-tweet-btn">
                {tr.tweetBtn}
              </a>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textAlign: "center", marginTop: 7, lineHeight: 1.4 }}>
                {tr.tweetFooter}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Reset link */}
        {solved > 0 && !allDone && (
          <div style={{ textAlign: "center", marginTop: 6 }}>
            <button
              onClick={reset}
              style={{
                background: "transparent", border: "none", color: "rgba(255,255,255,0.3)",
                fontSize: 10, cursor: "pointer", textDecoration: "underline", padding: 0,
                fontFamily: "Outfit",
              }}
            >
              {tr.reset}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
