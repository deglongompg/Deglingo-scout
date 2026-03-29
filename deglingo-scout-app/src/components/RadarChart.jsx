const AA_MAX = { aa_defending: 20, aa_passing: 30, aa_possession: 20, aa_attacking: 15 };

export default function RadarChart({ player, size = 200, maxValues }) {
  const axes = [
    { label: "DEF", key: "aa_defending", color: "#3B82F6" },
    { label: "PASS", key: "aa_passing", color: "#8B5CF6" },
    { label: "POSS", key: "aa_possession", color: "#06B6D4" },
    { label: "ATT", key: "aa_attacking", color: "#EF4444" },
  ];

  const cx = size / 2, cy = size / 2, r = size * 0.32;
  const angleStep = (2 * Math.PI) / axes.length;
  const startAngle = -Math.PI / 2;

  const points = axes.map((a, i) => {
    const val = Math.max(0, player[a.key] || 0);
    const ratio = Math.min(val / AA_MAX[a.key], 1);
    const angle = startAngle + i * angleStep;
    return {
      x: cx + r * ratio * Math.cos(angle),
      y: cy + r * ratio * Math.sin(angle),
      lx: cx + (r + 16) * Math.cos(angle),
      ly: cy + (r + 16) * Math.sin(angle),
      label: a.label,
      val: val.toFixed(1),
      color: a.color,
    };
  });

  const poly = points.map(p => `${p.x},${p.y}`).join(" ");

  const gridLines = [0.25, 0.5, 0.75, 1].map(s => {
    const pts = axes.map((_, i) => {
      const angle = startAngle + i * angleStep;
      return `${cx + r * s * Math.cos(angle)},${cy + r * s * Math.sin(angle)}`;
    }).join(" ");
    return <polygon key={s} points={pts} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
      {gridLines}
      {axes.map((_, i) => {
        const angle = startAngle + i * angleStep;
        return <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
      })}
      <polygon points={poly} fill="rgba(99,102,241,0.25)" stroke="#6366F1" strokeWidth="2" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill={p.color} />
          <text x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle" fill={p.color} fontSize="12" fontWeight="600" fontFamily="Outfit">{p.label}</text>
          <text x={p.lx} y={p.ly + 14} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="10" fontFamily="DM Mono">{p.val}</text>
        </g>
      ))}
    </svg>
  );
}
