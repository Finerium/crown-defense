'use client';
import type { ReactNode } from 'react';

/**
 * UI primitives ported from the Claude Design handoff (talos-ui.jsx) — the visual truth. ACCESSIBILITY:
 * severity and status are NEVER conveyed by color alone — every badge is a distinct GLYPH + a text LABEL
 * (AC-A11Y). Tokens come from talos.css.
 */

type GlyphKind = 'circle' | 'ring' | 'tri' | 'diamond' | 'square' | 'check' | 'x' | 'arc';

export function Glyph({
  k,
  size = 9,
  color = 'currentColor',
  className = '',
}: { k: GlyphKind; size?: number; color?: string; className?: string }) {
  const s = size;
  const h = s / 2;
  let body: ReactNode = null;
  if (k === 'circle') body = <circle cx={h} cy={h} r={h} fill={color} />;
  if (k === 'ring') body = <circle cx={h} cy={h} r={h - 1} fill="none" stroke={color} strokeWidth="1.6" />;
  if (k === 'tri') body = <polygon points={`${h},0.5 ${s - 0.5},${s - 0.5} 0.5,${s - 0.5}`} fill={color} />;
  if (k === 'diamond') body = <polygon points={`${h},0 ${s},${h} ${h},${s} 0,${h}`} fill={color} />;
  if (k === 'square') body = <rect x="0.5" y="0.5" width={s - 1} height={s - 1} fill={color} />;
  if (k === 'check')
    body = (
      <polyline
        points={`1,${h + 1} ${h - 0.5},${s - 1.5} ${s - 1},1.5`}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  if (k === 'x')
    body = (
      <g stroke={color} strokeWidth="1.8" strokeLinecap="round">
        <line x1="1.5" y1="1.5" x2={s - 1.5} y2={s - 1.5} />
        <line x1={s - 1.5} y1="1.5" x2="1.5" y2={s - 1.5} />
      </g>
    );
  if (k === 'arc')
    body = (
      <circle
        cx={h}
        cy={h}
        r={h - 1}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeDasharray={`${(s - 2) * 2.2} ${(s - 2) * 1.2}`}
        strokeLinecap="round"
      />
    );
  return (
    <svg className={className} width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
      {body}
    </svg>
  );
}

const SEV_DEF: Record<string, { label: string; cls: string; glyph: GlyphKind }> = {
  CRITICAL: { label: 'CRITICAL', cls: 'bd-crit', glyph: 'tri' },
  HIGH: { label: 'HIGH', cls: 'bd-high', glyph: 'diamond' },
  MEDIUM: { label: 'MEDIUM', cls: 'bd-med', glyph: 'square' },
  LOW: { label: 'LOW', cls: 'bd-low', glyph: 'circle' },
};
export function Sev({ level }: { level: string }) {
  const d = SEV_DEF[level.toUpperCase()] ?? SEV_DEF.LOW;
  return (
    <span className={`badge ${d.cls}`}>
      <Glyph k={d.glyph} size={8} />
      {d.label}
    </span>
  );
}

const STATUS_DEF: Record<string, { label: string; cls: string; glyph: GlyphKind; spin?: boolean }> = {
  COMPROMISED: { label: 'COMPROMISED', cls: 'bd-crit', glyph: 'tri' },
  CONTAINED: { label: 'CONTAINED', cls: 'bd-high', glyph: 'square' },
  ISOLATED: { label: 'ISOLATED', cls: 'bd-med', glyph: 'ring' },
  SCANNING: { label: 'SCANNING', cls: 'bd-low', glyph: 'arc', spin: true },
  PROTECTED: { label: 'PROTECTED', cls: 'bd-ok', glyph: 'check' },
  SAFE: { label: 'SAFE', cls: 'bd-ok', glyph: 'check' },
  DEGRADED: { label: 'DEGRADED', cls: 'bd-med', glyph: 'diamond' },
  ONLINE: { label: 'ONLINE', cls: 'bd-ok', glyph: 'circle' },
  OFFLINE: { label: 'OFFLINE', cls: 'bd-low', glyph: 'ring' },
  HEALTHY: { label: 'HEALTHY', cls: 'bd-ok', glyph: 'check' },
  UNHEALTHY: { label: 'UNHEALTHY', cls: 'bd-crit', glyph: 'x' },
};
export function StatusPill({ status }: { status: string }) {
  const d = STATUS_DEF[status.toUpperCase()] ?? STATUS_DEF.PROTECTED;
  return (
    <span className={`badge ${d.cls}`}>
      <Glyph k={d.glyph} size={8} className={d.spin ? 'spin' : ''} />
      {d.label}
    </span>
  );
}

export function Panel({
  title,
  sub,
  right,
  children,
  className = '',
  bodyClass = '',
  style,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={`panel ${className}`} style={style}>
      {title ? (
        <header className="panel-h">
          <span className="p-title">{title}</span>
          {sub ? <span className="p-sub">{sub}</span> : null}
          {right ? <span className="p-right">{right}</span> : null}
        </header>
      ) : null}
      <div className={`panel-b ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function Kpi({
  label,
  value,
  unit,
  sub,
  alert,
  live,
}: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; alert?: boolean; live?: boolean }) {
  return (
    <div className={`panel kpi${alert ? ' alert' : ''}`}>
      <div className="k-label">
        {live ? <Glyph k="circle" size={6} color="var(--crit)" className="pulse-dot" /> : null}
        {label}
      </div>
      <div className="k-value">
        {value}
        {unit ? <span className="unit">{unit}</span> : null}
      </div>
      {sub ? <div className="k-sub">{sub}</div> : null}
    </div>
  );
}

export function Spark({
  data,
  w = 84,
  h = 26,
  color = 'var(--acc)',
}: { data: number[]; w?: number; h?: number; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (w - 2) + 1;
      const y = h - 2 - ((v - min) / (max - min || 1)) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Btn({
  kind = '',
  sm,
  children,
  onClick,
  disabled,
  title,
  ariaLabel,
}: {
  kind?: string;
  sm?: boolean;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      className={`btn ${kind} ${sm ? 'sm' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  width,
  label,
}: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number; label: string }) {
  return (
    <label className="search" style={width ? { minWidth: width } : undefined}>
      <Glyph k="ring" size={10} color="var(--t3)" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        aria-label={label}
      />
    </label>
  );
}

export function Chip({
  on,
  onClick,
  children,
  n,
}: { on?: boolean; onClick?: () => void; children: ReactNode; n?: number }) {
  return (
    <button type="button" className={`chip${on ? ' on' : ''}`} onClick={onClick} aria-pressed={on}>
      {children}
      {n != null ? <span className="n">{n}</span> : null}
    </button>
  );
}

export function RiskCell({ v }: { v: number }) {
  const color = v >= 80 ? 'var(--crit)' : v >= 50 ? 'var(--high)' : v >= 25 ? 'var(--med)' : 'var(--ok)';
  return (
    <span className="riskbar">
      <span className="track">
        <span className="fill" style={{ width: `${v}%`, background: color }} />
      </span>
      <span className="mono" style={{ fontSize: 11, color: 'var(--t2)' }}>
        {v}
      </span>
    </span>
  );
}
