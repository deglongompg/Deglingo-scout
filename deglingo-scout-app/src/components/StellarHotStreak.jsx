import { useState, useEffect } from "react";

/**
 * StellarHotStreak — Tracker des 6 paliers Hot Streak Sorare Stellar.
 *
 * Sync via cache Apollo Sorare (script clipboard) faute d'avoir trouve la query GraphQL.
 * Reverse-engineering du 25/04/2026 a revele :
 * - Type Sorare : ThresholdPickerTask (6 paliers par chapter)
 * - Champs: aasmState (CLAIMED|READY|ASSIGNED), target, maxLineupsCount,
 *   pendingLineupsCount, remainingLineupsCount, rewardConfigs
 * - Filtre tasks(sport: FOOTBALL, periodicity: NO_PERIODIC) probable mais non confirme
 *
 * Cf. memoire `feedback_sorare_oauth_sacred.md` + `session_2026_04_25_evening_handoff.md`.
 */

// 6 paliers fixes pour la saison Stellar (rewards types depuis cache Sorare)
const DEFAULT_PALIERS = [
  { target: 280, aasmState: "ASSIGNED", maxLineupsCount: 4, pendingLineupsCount: 0, remainingLineupsCount: 4, rewardType: "shards", rewardLabel: "Essence" },
  { target: 320, aasmState: "ASSIGNED", maxLineupsCount: 4, pendingLineupsCount: 0, remainingLineupsCount: 4, rewardType: "shards", rewardLabel: "Essence" },
  { target: 360, aasmState: "ASSIGNED", maxLineupsCount: 4, pendingLineupsCount: 0, remainingLineupsCount: 4, rewardType: "gems",   rewardLabel: "10 gems" },
  { target: 400, aasmState: "ASSIGNED", maxLineupsCount: 4, pendingLineupsCount: 0, remainingLineupsCount: 4, rewardType: "gems",   rewardLabel: "30 gems" },
  { target: 440, aasmState: "ASSIGNED", maxLineupsCount: 4, pendingLineupsCount: 0, remainingLineupsCount: 4, rewardType: "usd",    rewardLabel: "100 $" },
  { target: 480, aasmState: "ASSIGNED", maxLineupsCount: 4, pendingLineupsCount: 0, remainingLineupsCount: 4, rewardType: "usd",    rewardLabel: "1 000 $" },
];

const STATE_META = {
  CLAIMED:  { icon: "✓",  color: "#22C55E", label: "Validé"     },
  READY:    { icon: "🔥", color: "#F59E0B", label: "En cours"   },
  ASSIGNED: { icon: "🔒", color: "#6B7280", label: "Verrouillé" },
};

const REWARD_ICON = { shards: "✨", gems: "💎", usd: "💵" };

const SYNC_SNIPPET = `(()=>{
  // Re-find Apollo client si pas en cache
  if (!window._cache) {
    let client = window.__APOLLO_CLIENT__;
    if (!client) {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const k = Object.keys(el).find(k => k.startsWith('__reactFiber'));
        if (!k) continue;
        let f = el[k];
        while (f) {
          const p = f.memoizedProps || f.stateNode?.props;
          if (p?.client?.cache?.extract) { client = p.client; break; }
          f = f.return;
          if (!f) break;
        }
        if (client) break;
      }
    }
    if (!client) { console.error('Apollo introuvable'); return; }
    window._client = client;
    window._cache = client.cache.extract();
  }
  const pickers = Object.entries(window._cache)
    .filter(([k,v]) => v?.__typename === 'ThresholdPickerTask')
    .map(([k,v]) => v)
    .sort((a,b) => a.target - b.target);
  const data = pickers.map(v => ({
    target: v.target,
    aasmState: v.aasmState,
    maxLineupsCount: v.maxLineupsCount,
    pendingLineupsCount: v.pendingLineupsCount,
    remainingLineupsCount: v.remainingLineupsCount,
    rewardType: v.rewardConfigs?.[0]?.__ref?.match(/^(\\w+)/)?.[1] === 'CardShardRewardConfig' ? 'shards'
              : v.rewardConfigs?.[0]?.__ref?.match(/^(\\w+)/)?.[1] === 'InGameCurrencyRewardConfig' ? 'gems'
              : v.rewardConfigs?.[0]?.__ref?.match(/^(\\w+)/)?.[1] === 'MonetaryRewardConfig' ? 'usd'
              : 'unknown',
  }));
  const json = JSON.stringify({ ts: Date.now(), paliers: data });
  navigator.clipboard.writeText(json).then(() => {
    console.log('✅ Hot Streak data copiee dans le clipboard ('+pickers.length+' paliers).');
    console.log('Retourne sur Scout et clique "Coller" dans le tracker Hot Streak.');
  });
})();`;

export default function StellarHotStreak({ lang = "fr", themeAccent = "#A78BFA" }) {
  const [paliers, setPaliers] = useState(() => {
    try {
      const saved = localStorage.getItem("stellar_hot_streak");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.paliers?.length === 6) return parsed.paliers;
      }
    } catch {}
    return DEFAULT_PALIERS;
  });
  const [lastSync, setLastSync] = useState(() => {
    try { return JSON.parse(localStorage.getItem("stellar_hot_streak"))?.ts || 0; } catch { return 0; }
  });
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [pasteError, setPasteError] = useState("");

  useEffect(() => {
    try { localStorage.setItem("stellar_hot_streak", JSON.stringify({ ts: lastSync, paliers })); } catch {}
  }, [paliers, lastSync]);

  const validatedCount = paliers.filter(p => p.aasmState === "CLAIMED").length;
  const currentPalierIdx = paliers.findIndex(p => p.aasmState === "READY");
  const totalAttemptsLeft = paliers.reduce((sum, p) => sum + (p.aasmState === "ASSIGNED" ? p.maxLineupsCount : p.aasmState === "READY" ? p.remainingLineupsCount : 0), 0);

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(SYNC_SNIPPET);
      setPasteError("📋 Snippet copié ! Va sur sorare.com/fr/football/series/play, F12, console, colle (Ctrl+V), Entrée.");
    } catch {
      setPasteError("❌ Clipboard bloqué — copie le snippet à la main");
    }
  };

  const tryPaste = async () => {
    setPasteError("");
    let text = pasteValue.trim();
    if (!text) {
      try { text = await navigator.clipboard.readText(); } catch {}
    }
    if (!text) { setPasteError("Colle d'abord les données dans le textarea ou autorise le clipboard"); return; }
    try {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed?.paliers) ? parsed.paliers : Array.isArray(parsed) ? parsed : null;
      if (!arr || arr.length !== 6) { setPasteError(`❌ JSON doit contenir 6 paliers (reçu: ${arr?.length || 0})`); return; }
      const merged = arr.map((p, i) => ({ ...DEFAULT_PALIERS[i], ...p }));
      setPaliers(merged);
      setLastSync(parsed?.ts || Date.now());
      setPasteValue("");
      setShowSyncModal(false);
      setPasteError("");
    } catch (e) {
      setPasteError("❌ JSON invalide : " + e.message);
    }
  };

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 12, padding: "10px 12px", border: "1px solid rgba(196,181,253,0.25)", boxShadow: "0 0 18px rgba(196,181,253,0.15), inset 0 0 24px rgba(196,181,253,0.04)" }}>
      <img src="/stellar-bg.png" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none", zIndex: 0 }} />
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(8,4,25,0.7), rgba(8,4,25,0.55) 50%, rgba(8,4,25,0.7))", pointerEvents: "none", zIndex: 1 }} />

      <div style={{ position: "relative", zIndex: 2 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>🔥</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, color: "#fff", letterSpacing: "0.1em", textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}>HOT STREAK</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>
                {validatedCount}/6 validés · {totalAttemptsLeft} équipes restantes
              </div>
            </div>
          </div>
          <button onClick={() => setShowSyncModal(v => !v)}
            style={{ background: `${themeAccent}25`, border: `1px solid ${themeAccent}55`, borderRadius: 6, padding: "4px 10px", color: themeAccent, fontSize: 10, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
            {lastSync ? "Re-sync" : "Sync Sorare"}
          </button>
        </div>

        {/* 6 paliers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
          {paliers.map((p, i) => {
            const meta = STATE_META[p.aasmState] || STATE_META.ASSIGNED;
            const isActive = p.aasmState === "READY";
            const attemptsUsed = p.maxLineupsCount - p.remainingLineupsCount;
            return (
              <div key={i} style={{
                position: "relative",
                background: isActive ? `${meta.color}20` : `${meta.color}10`,
                border: `1px solid ${meta.color}${isActive ? "80" : "40"}`,
                borderRadius: 8,
                padding: "6px 4px",
                textAlign: "center",
                opacity: p.aasmState === "ASSIGNED" ? 0.55 : 1,
                boxShadow: isActive ? `0 0 12px ${meta.color}60` : "none",
                animation: isActive ? "pulse 2s ease-in-out infinite" : "none",
              }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Mono',monospace" }}>P{i+1}</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: meta.color, fontFamily: "'DM Mono',monospace" }}>{p.target}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", marginTop: 1, whiteSpace: "nowrap" }}>
                  {REWARD_ICON[p.rewardType] || "•"} {p.rewardLabel}
                </div>
                <div style={{ fontSize: 8, color: meta.color, fontWeight: 700, marginTop: 2 }}>
                  {p.aasmState === "CLAIMED" ? `✓ ${meta.label}` : isActive ? `🔥 ${attemptsUsed}/${p.maxLineupsCount}` : `🔒 ${p.maxLineupsCount} essais`}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sync modal */}
        {showSyncModal && (
          <div style={{ marginTop: 10, padding: 10, background: "rgba(0,0,0,0.5)", borderRadius: 8, border: `1px solid ${themeAccent}40` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Synchroniser depuis Sorare</div>
            <ol style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", paddingLeft: 16, margin: "0 0 8px", lineHeight: 1.5 }}>
              <li>Clique "Copier le code"</li>
              <li>Va sur <a href="https://sorare.com/fr/football/series/play" target="_blank" rel="noopener noreferrer" style={{ color: themeAccent }}>sorare.com/fr/football/series/play</a></li>
              <li>F12 → console → colle (Ctrl+V) → Entrée</li>
              <li>Reviens ici, clique "Coller depuis presse-papier"</li>
            </ol>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <button onClick={copySnippet}
                style={{ background: `${themeAccent}30`, border: `1px solid ${themeAccent}80`, borderRadius: 6, padding: "5px 10px", color: "#fff", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>
                📋 Copier le code
              </button>
              <button onClick={tryPaste}
                style={{ background: "#22C55E30", border: "1px solid #22C55E80", borderRadius: 6, padding: "5px 10px", color: "#fff", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>
                📥 Coller depuis presse-papier
              </button>
              <button onClick={() => setShowSyncModal(false)}
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "5px 10px", color: "rgba(255,255,255,0.6)", fontSize: 10, cursor: "pointer" }}>
                Fermer
              </button>
            </div>
            <textarea
              value={pasteValue}
              onChange={e => setPasteValue(e.target.value)}
              placeholder="...ou colle le JSON ici manuellement"
              style={{ width: "100%", minHeight: 50, fontSize: 10, fontFamily: "monospace", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#fff", padding: 6, resize: "vertical" }}
            />
            {pasteError && (
              <div style={{ fontSize: 10, color: pasteError.startsWith("📋") ? "#22C55E" : "#F87171", marginTop: 6 }}>{pasteError}</div>
            )}
            {lastSync > 0 && (
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                Dernière sync : {new Date(lastSync).toLocaleString("fr-FR")}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 12px rgba(245,158,11,0.4); }
          50%      { box-shadow: 0 0 20px rgba(245,158,11,0.7), 0 0 4px rgba(245,158,11,0.9); }
        }
      `}</style>
    </div>
  );
}
