import { dsColor } from "../utils/colors";

export default function MiniGraph({ scores, width = 180, height = 65 }) {
  if (!scores || scores.length === 0) return null;
  const sc = [...scores].reverse(); // oldest to newest (left = oldest, right = most recent)
  const pad = 4;
  const topPad = 14; // space for value labels above bars
  const barGap = 4;
  const n = sc.length;
  const barW = Math.min(24, (width - pad * 2 - barGap * (n - 1)) / n);
  const totalW = n * barW + (n - 1) * barGap;
  const startX = (width - totalW) / 2;
  const maxH = height - topPad - pad;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {sc.map((v, i) => {
        const barH = Math.max(2, (v / 100) * maxH);
        const x = startX + i * (barW + barGap);
        const y = height - pad - barH;
        return (
          <g key={i}>
            <rect
              x={x} y={y} width={barW} height={barH}
              rx={3} ry={3}
              fill={dsColor(v)}
              opacity={0.85}
            />
            <text
              x={x + barW / 2} y={y - 3}
              textAnchor="middle" fill="rgba(255,255,255,0.6)"
              fontSize="9" fontWeight="600" fontFamily="DM Mono"
            >{Math.round(v)}</text>
          </g>
        );
      })}
    </svg>
  );
}
