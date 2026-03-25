export default function MiniGraph({ scores, width = 120, height = 40 }) {
  if (!scores || scores.length === 0) return null;
  const sc = [...scores].reverse(); // oldest to newest
  const max = Math.max(...sc, 80);
  const min = Math.min(...sc, 20);
  const range = max - min || 1;
  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const pts = sc.map((v, i) => ({
    x: pad + (i / Math.max(sc.length - 1, 1)) * w,
    y: pad + h - ((v - min) / range) * h,
    v,
  }));

  const line = pts.map(p => `${p.x},${p.y}`).join(" ");

  const col = v => v >= 70 ? "#4ADE80" : v >= 55 ? "#A3E635" : v >= 40 ? "#FBBF24" : "#EF4444";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={line} fill="none" stroke="rgba(99,102,241,0.4)" strokeWidth="1.5" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill={col(p.v)} />
          <text x={p.x} y={p.y - 6} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="7" fontFamily="DM Mono">{p.v}</text>
        </g>
      ))}
    </svg>
  );
}
