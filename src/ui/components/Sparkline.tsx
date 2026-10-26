import type { HistorySample } from '@/core/state/types';

interface Series {
  id: string;
  color: string;
  highlight: boolean;
  alive: boolean;
}

interface SparklineProps {
  samples: HistorySample[];
  series: Series[];
  width?: number;
  height?: number;
}

/**
 * Campaign graph: land share of every country over the whole war. Pure SVG, no
 * chart library — a couple of polylines stay cheap even with 180 points.
 */
export function Sparkline({ samples, series, width = 300, height = 110 }: SparklineProps) {
  if (samples.length < 2 || series.length === 0) {
    return <p className="tiny muted">График появится, когда кампания продлится дольше.</p>;
  }
  const padX = 4;
  const padY = 8;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const count = samples.length;

  const point = (index: number, share: number): string => {
    const x = padX + (index / (count - 1)) * innerW;
    const y = padY + (1 - Math.min(1, Math.max(0, share))) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label="Доля земли по государствам"
    >
      <rect x={0} y={0} width={width} height={height} rx={6} fill="rgba(120,170,220,0.07)" />
      {[0.25, 0.5, 0.75].map((line) => (
        <line
          key={line}
          x1={padX}
          x2={width - padX}
          y1={padY + line * innerH}
          y2={padY + line * innerH}
          stroke="rgba(146,186,224,0.16)"
          strokeWidth={1}
        />
      ))}
      {series.map((entry) => {
        const index = series.findIndex((candidate) => candidate.id === entry.id);
        const points = samples
          .map((sample, sampleIndex) => point(sampleIndex, sample.share[index] ?? 0))
          .join(' ');
        return (
          <polyline
            key={entry.id}
            points={points}
            fill="none"
            stroke={entry.color}
            strokeWidth={entry.highlight ? 2.4 : 1.4}
            strokeOpacity={entry.alive ? 0.95 : 0.45}
            strokeDasharray={entry.alive ? undefined : '4 3'}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
