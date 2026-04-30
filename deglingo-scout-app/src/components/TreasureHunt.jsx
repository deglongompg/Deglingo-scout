import { useState, useEffect } from "react";

// ═══ Chasse au Trésor — Bruno Fernandes Limited 1/1000 ═══
// 5 énigmes (1 par onglet) + code final à tweeter
//
// Anti-spoilers minimal : les réponses sont en clair dans le code (réseau Twitter,
// Damien fait le tirage parmi tous les RT, le code n'est qu'un proof-of-engagement).
// Les comparaisons sont case-insensitive et trim.

const ENIGMAS = [
  {
    id: 1,
    icon: "🔍",
    tab: "Database",
    title: "Le surnom du Maestro",
    intro: "Bruno Fernandes est un GOAT, mais le sais-tu vraiment ?",
    question: "Cherche 'Bruno Fernandes' dans la Database. Quel est le 2ème mot de son archétype ?",
    hint: "Indice : Database → barre de recherche → trouve sa ligne → colonne Archétype.",
    answer: "GOAT",
    fragmentLabel: "Surnom",
  },
  {
    id: 2,
    icon: "⚙️",
    tab: "Sorare Pro",
    title: "L'empire du Cyan",
    intro: "Bruno joue en Premier League, mais l'énigme l'envoie en MLS...",
    question: "Sur Sorare Pro, sélectionne la ligue MLS. Combien de clubs composent la Conférence Est ?",
    hint: "Indice : descends jusqu'au classement officiel sous le calendrier de la GW.",
    answer: "15",
    fragmentLabel: "Clubs Est",
  },
  {
    id: 3,
    icon: "✨",
    tab: "Sorare Stellar",
    title: "Le carré et l'éclair",
    intro: "Stellar a son propre format. Combien de cartes pour faire briller ton équipe ?",
    question: "Va dans Sorare Stellar. Combien de slots de joueurs compose une équipe Stellar Standard (en incluant FLEX et le gardien) ?",
    hint: "Indice : pas besoin de te connecter. Regarde le pitch vide à l'arrivée.",
    answer: "5",
    fragmentLabel: "Slots",
  },
  {
    id: 4,
    icon: "📋",
    tab: "Mes Teams",
    title: "Le trésor suprême",
    intro: "Mes Teams révèle le palier ultime que tu peux atteindre dans Stellar...",
    question: "Va dans Mes Teams. Quel est le palier MAX en dollars de la jauge Skyrocket Stellar ? (juste le nombre, sans $ ni espace)",
    hint: "Indice : tout en haut de la jauge dorée (l'éclair). Si tu n'as aucune team, sauvegarde-en une dans Stellar d'abord.",
    answer: "1000",
    altAnswers: ["1 000", "1.000"],
    fragmentLabel: "Palier",
  },
  {
    id: 5,
    icon: "🥊",
    tab: "Fight",
    title: "Le verdict du Maestro",
    intro: "Le maestro descend dans l'arène. Mais qui mérite de l'affronter ?",
    question: "Va dans Fight. À gauche, place Bruno Fernandes (Manchester United). À droite, place le prodige catalan de 18 ans qui rêve de prendre sa couronne. Si tu choisis le bon adversaire, un secret apparaîtra dans le verdict.",
    hint: "Indice : son nom rime avec 'Carnaval' — et il marque depuis l'âge où d'autres lacent encore leurs crampons. FC Barcelona, n°10 du futur.",
    answer: "61",
    fragmentLabel: "Verdict",
  },
];

const FINAL_CODE = "GOAT-15-5-1000-61";
const STORAGE_KEY = "deglingo_treasure_v1";

const norm = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, "");
const checkAnswer = (input, enigma) => {
  const ni = norm(input);
  if (ni === norm(enigma.answer)) return true;
  if (enigma.altAnswers && enigma.altAnswers.some(a => norm(a) === ni)) return true;
  return false;
};

export default function TreasureHunt({ open, onClose }) {
  // Progression : nombre d'énigmes résolues (0 → 5)
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
  const [currentIdx, setCurrentIdx] = useState(0);
  const [errorShake, setErrorShake] = useState(null);
  const [showHint, setShowHint] = useState({});

  // Auto-scroll sur l'énigme courante quand elle change
  useEffect(() => {
    if (!open) return;
    const el = document.getElementById(`enigma-${currentIdx}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentIdx, open]);

  // Persiste le progress dans localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ solved, inputs }));
    } catch {}
  }, [solved, inputs]);

  if (!open) return null;

  const setInput = (id, val) => setInputs(prev => ({ ...prev, [id]: val }));

  const submit = (idx) => {
    const enigma = ENIGMAS[idx];
    const input = inputs[enigma.id] || "";
    if (checkAnswer(input, enigma)) {
      if (idx + 1 > solved) setSolved(idx + 1);
      // Auto-avance vers la suivante
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
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  const allDone = solved >= ENIGMAS.length;

  const tweetText = encodeURIComponent(
    `J'ai trouvé le Code Bruno : ${FINAL_CODE}\n\n` +
    `🐐 Bruno Fernandes Limited 1/1000 à gagner sur @DeglingoFoot\n\n` +
    `RT pour participer ! 🎁\n\n` +
    `Lance la chasse → deglingosorare.com\n\n` +
    `#ChasseDeglingo`
  );
  const tweetUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(2,1,15,0.92)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "20px 16px", overflow: "auto",
        animation: "treasureFadeIn 0.3s ease-out",
      }}
    >
      <style>{`
        @keyframes treasureFadeIn { 0%{opacity:0} 100%{opacity:1} }
        @keyframes treasureSlideUp { 0%{opacity:0;transform:translateY(20px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes treasureShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }
        @keyframes treasureGoldShine {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes treasurePulse {
          0%,100% { box-shadow: 0 0 20px rgba(251,191,36,0.4), 0 0 60px rgba(251,191,36,0.2); }
          50%     { box-shadow: 0 0 40px rgba(251,191,36,0.7), 0 0 100px rgba(251,191,36,0.4); }
        }
        .treasure-modal {
          width: 100%; max-width: 720px;
          background: linear-gradient(180deg, rgba(20,8,50,0.98), rgba(8,3,28,0.98));
          border: 1px solid rgba(251,191,36,0.3);
          border-radius: 18px;
          padding: 24px 22px 30px;
          animation: treasureSlideUp 0.4s cubic-bezier(.2,.7,.3,1) both;
          box-shadow: 0 20px 80px rgba(0,0,0,0.7), 0 0 40px rgba(251,191,36,0.15);
          color: #fff; font-family: Outfit, sans-serif;
          position: relative;
        }
        .treasure-close {
          position: absolute; top: 12px; right: 14px;
          width: 32px; height: 32px; border-radius: 8px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.7); font-size: 16px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .treasure-close:hover { background: rgba(239,68,68,0.2); color: #fff; border-color: rgba(239,68,68,0.5); }
        .treasure-title-gradient {
          background: linear-gradient(90deg,#FBBF24,#F59E0B,#FCD34D,#FBBF24);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: treasureGoldShine 3s linear infinite;
        }
        .enigma-card {
          border-radius: 14px; padding: 16px 18px; margin-bottom: 12px;
          transition: all 0.3s ease;
          position: relative;
        }
        .enigma-card.locked {
          background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.08);
          opacity: 0.4;
        }
        .enigma-card.active {
          background: linear-gradient(135deg, rgba(251,191,36,0.08), rgba(251,191,36,0.03));
          border: 1px solid rgba(251,191,36,0.4);
          box-shadow: 0 0 24px rgba(251,191,36,0.18), inset 0 1px 0 rgba(255,255,255,0.06);
        }
        .enigma-card.solved {
          background: linear-gradient(135deg, rgba(74,222,128,0.08), rgba(74,222,128,0.02));
          border: 1px solid rgba(74,222,128,0.35);
        }
        .enigma-card.shake { animation: treasureShake 0.4s; }
        .treasure-input {
          flex: 1; padding: 9px 14px; border-radius: 9px;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(0,0,0,0.4); color: #fff;
          font-family: 'DM Mono', monospace; font-size: 14px; font-weight: 700;
          letter-spacing: 0.04em; outline: none;
          transition: all 0.15s;
        }
        .treasure-input:focus { border-color: #FBBF24; box-shadow: 0 0 0 2px rgba(251,191,36,0.2); }
        .treasure-btn-validate {
          padding: 9px 18px; border-radius: 9px; border: none;
          background: linear-gradient(135deg, #FBBF24, #F59E0B);
          color: #1a0f00; font-weight: 900; font-size: 13px; cursor: pointer;
          box-shadow: 0 0 16px rgba(251,191,36,0.4);
          transition: all 0.15s;
        }
        .treasure-btn-validate:hover { transform: translateY(-1px); box-shadow: 0 0 24px rgba(251,191,36,0.6); }
        .treasure-fragment {
          display: inline-block; padding: 6px 14px; border-radius: 8px;
          background: linear-gradient(135deg, rgba(74,222,128,0.18), rgba(74,222,128,0.08));
          border: 1px solid rgba(74,222,128,0.4);
          color: #4ADE80; font-family: 'DM Mono', monospace;
          font-weight: 900; font-size: 14px; letter-spacing: 0.05em;
        }
        .treasure-final-code {
          padding: 14px 18px; border-radius: 12px;
          background: linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.05));
          border: 1px solid rgba(251,191,36,0.5);
          font-family: 'DM Mono', monospace; font-size: 22px; font-weight: 900;
          letter-spacing: 0.12em; color: #FBBF24;
          text-align: center;
          animation: treasurePulse 2s ease-in-out infinite;
        }
        .treasure-tweet-btn {
          width: 100%; padding: 14px 20px; border-radius: 12px; border: none;
          background: linear-gradient(135deg, #1DA1F2, #0d8bd9);
          color: #fff; font-weight: 900; font-size: 15px; cursor: pointer;
          letter-spacing: 0.04em; box-shadow: 0 0 20px rgba(29,161,242,0.4);
          transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;
          text-decoration: none;
        }
        .treasure-tweet-btn:hover { transform: translateY(-1px); box-shadow: 0 0 30px rgba(29,161,242,0.7); }
        .treasure-progress-dot { width: 10px; height: 10px; border-radius: 50%; transition: all 0.3s; }
        .treasure-progress-dot.done { background: #4ADE80; box-shadow: 0 0 8px rgba(74,222,128,0.6); }
        .treasure-progress-dot.current { background: #FBBF24; box-shadow: 0 0 10px rgba(251,191,36,0.8); }
        .treasure-progress-dot.todo { background: rgba(255,255,255,0.15); }
      `}</style>

      <div className="treasure-modal" onClick={e => e.stopPropagation()}>
        <button className="treasure-close" onClick={onClose} aria-label="Fermer">✕</button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(251,191,36,0.7)", letterSpacing: "0.18em", marginBottom: 6 }}>
            🎁 GIVEAWAY
          </div>
          <div className="treasure-title-gradient" style={{ fontSize: 28, fontWeight: 900, letterSpacing: "0.02em", marginBottom: 8 }}>
            La Chasse au Maestro
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.5, maxWidth: 540, margin: "0 auto" }}>
            Résous les 5 énigmes cachées dans les onglets pour découvrir le <b style={{ color: "#FBBF24" }}>Code Bruno</b>.
            <br/>Tweete-le en RT pour gagner la carte <b style={{ color: "#FBBF24" }}>Bruno Fernandes Limited 1/1000</b> 🐐
          </div>

          {/* Progress dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14 }}>
            {ENIGMAS.map((_, i) => (
              <div key={i} className={`treasure-progress-dot ${i < solved ? "done" : i === currentIdx ? "current" : "todo"}`} />
            ))}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 8, fontFamily: "'DM Mono',monospace" }}>
            {solved}/{ENIGMAS.length} énigmes résolues
          </div>
        </div>

        {/* Enigmas */}
        {ENIGMAS.map((eg, i) => {
          const isSolved = i < solved;
          const isCurrent = i === currentIdx && !isSolved;
          const isLocked = !isSolved && !isCurrent;
          const cardClass = `enigma-card ${isSolved ? "solved" : isCurrent ? "active" : "locked"} ${errorShake === i ? "shake" : ""}`;

          return (
            <div key={eg.id} id={`enigma-${i}`} className={cardClass}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 22, opacity: isLocked ? 0.4 : 1 }}>{isLocked ? "🔒" : eg.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: isSolved ? "#4ADE80" : isCurrent ? "#FBBF24" : "rgba(255,255,255,0.4)", letterSpacing: "0.12em", marginBottom: 2 }}>
                    ÉNIGME {eg.id} · {eg.tab.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: isLocked ? "rgba(255,255,255,0.4)" : "#fff" }}>
                    {eg.title}
                  </div>
                </div>
                {isSolved && (
                  <span className="treasure-fragment">{eg.answer}</span>
                )}
              </div>

              {!isLocked && (
                <>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 8, fontStyle: "italic" }}>
                    {eg.intro}
                  </div>
                  <div style={{ fontSize: 13, color: "#fff", marginBottom: 12, lineHeight: 1.5 }}>
                    {eg.question}
                  </div>
                  {!isSolved && (
                    <>
                      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <input
                          className="treasure-input"
                          placeholder="Ta réponse…"
                          value={inputs[eg.id] || ""}
                          onChange={e => setInput(eg.id, e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") submit(i); }}
                          autoFocus={isCurrent}
                        />
                        <button className="treasure-btn-validate" onClick={() => submit(i)}>
                          Valider
                        </button>
                      </div>
                      <button
                        onClick={() => setShowHint(h => ({ ...h, [eg.id]: !h[eg.id] }))}
                        style={{
                          background: "transparent", border: "none", color: "rgba(255,255,255,0.4)",
                          fontSize: 11, cursor: "pointer", textDecoration: "underline", padding: 0,
                          fontFamily: "Outfit",
                        }}
                      >
                        {showHint[eg.id] ? "Cacher l'indice" : "💡 Voir un indice"}
                      </button>
                      {showHint[eg.id] && (
                        <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.55)", fontStyle: "italic", padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6, borderLeft: "2px solid #FBBF24" }}>
                          {eg.hint}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* Final code section */}
        {allDone && (
          <div style={{ marginTop: 24, padding: "18px 16px", borderRadius: 14, background: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(74,222,128,0.06))", border: "1px solid rgba(251,191,36,0.4)" }}>
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#4ADE80", letterSpacing: "0.16em", marginBottom: 4 }}>
                ✅ CHASSE TERMINÉE
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginBottom: 12 }}>
                Voici le Code Bruno 🐐
              </div>
              <div className="treasure-final-code">{FINAL_CODE}</div>
            </div>
            <a href={tweetUrl} target="_blank" rel="noopener noreferrer" className="treasure-tweet-btn">
              𝕏 Tweeter le Code Bruno
            </a>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textAlign: "center", marginTop: 10, lineHeight: 1.4 }}>
              Le tirage au sort aura lieu parmi les RT du Tweet de lancement.
              <br/>Bonne chance ! 🎁
            </div>
          </div>
        )}

        {/* Reset link en bas */}
        {solved > 0 && !allDone && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button
              onClick={reset}
              style={{
                background: "transparent", border: "none", color: "rgba(255,255,255,0.3)",
                fontSize: 10, cursor: "pointer", textDecoration: "underline", padding: 0,
                fontFamily: "Outfit",
              }}
            >
              Recommencer la chasse
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
