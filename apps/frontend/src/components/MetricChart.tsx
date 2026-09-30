import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface MetricPoint {
  timestamp: number;
  value: number;
}

interface MetricChartProps {
  label: string;
  points: MetricPoint[];
  formatValue: (value: number) => string;
  max?: number;
  /** Например "доступно: 2.1 GB из 3.8 GB" — показывается под заголовком. */
  sub?: string;
}

const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 120;
const PADDING_Y = 8;

// Один график = одна серия одного цвета (--color-accent) — раздел 6 CLAUDE.md:
// один акцентный цвет на весь интерфейс. Заголовок называет серию, поэтому легенда
// не нужна (она появляется только у графиков с двумя и более сериями).
export default function MetricChart({ label, points, formatValue, max, sub }: MetricChartProps) {
  const { t, i18n } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const timeFormatter = useMemo(() => new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' }), [i18n.language]);

  const scale = useMemo(() => {
    if (points.length === 0) {
      return null;
    }
    const minTs = points[0].timestamp;
    const maxTs = points[points.length - 1].timestamp;
    const tsSpan = Math.max(1, maxTs - minTs);
    const valueMax = max ?? Math.max(1, ...points.map((p) => p.value)) * 1.1;

    const x = (ts: number) => ((ts - minTs) / tsSpan) * VIEW_WIDTH;
    const y = (value: number) =>
      VIEW_HEIGHT - PADDING_Y - (Math.min(value, valueMax) / valueMax) * (VIEW_HEIGHT - PADDING_Y * 2);

    return { minTs, maxTs, x, y };
  }, [points, max]);

  if (!scale || points.length === 0) {
    return (
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
        <p className="text-sm text-muted">{t('metrics.noData')}</p>
      </div>
    );
  }

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scale.x(p.timestamp)} ${scale.y(p.value)}`).join(' ');
  const areaPath = `${linePath} L ${scale.x(points[points.length - 1].timestamp)} ${VIEW_HEIGHT} L ${scale.x(points[0].timestamp)} ${VIEW_HEIGHT} Z`;
  const current = points[points.length - 1];
  const hovered = hoverIndex != null ? points[hoverIndex] : null;
  const shown = hovered ?? current;

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || !scale) return;
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const targetTs = scale.minTs + ratio * (scale.maxTs - scale.minTs);
    let nearest = 0;
    let nearestDelta = Infinity;
    points.forEach((p, i) => {
      const delta = Math.abs(p.timestamp - targetTs);
      if (delta < nearestDelta) {
        nearestDelta = delta;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
        <span className="font-mono text-sm text-primary">{formatValue(shown.value)}</span>
      </div>
      {sub && <div className="mb-1 font-mono text-xs text-muted">{sub}</div>}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-24 w-full"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <path d={areaPath} fill="var(--color-accent-soft)" stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hoverIndex != null && (
          <>
            <line
              x1={scale.x(shown.timestamp)}
              x2={scale.x(shown.timestamp)}
              y1={0}
              y2={VIEW_HEIGHT}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            <circle cx={scale.x(shown.timestamp)} cy={scale.y(shown.value)} r={5} fill="var(--color-surface)" />
            <circle cx={scale.x(shown.timestamp)} cy={scale.y(shown.value)} r={3} fill="var(--color-accent)" />
          </>
        )}
      </svg>
      <div className="flex justify-between font-mono text-xs text-muted">
        <span>{timeFormatter.format(new Date(scale.minTs))}</span>
        <span>{hovered ? timeFormatter.format(new Date(hovered.timestamp)) : t('metrics.now')}</span>
      </div>
    </div>
  );
}
