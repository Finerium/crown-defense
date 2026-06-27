'use client';
import { useEffect, useRef, useState } from 'react';
import type { ChartLabel, DemoScenario, FeedItem, FeedKind, Segment, SegmentState } from '../../lib/data';
import { type Lang, t, tf } from '../../lib/i18n';
import { Btn, Glyph, Kpi, Panel, Sev } from '../ui';

/**
 * Command Overview — ported 1:1 from the design (crown-defense-design/screen-overview.jsx). The design's
 * AreaChart is NOT exported from ui.tsx (it lives only in the legacy screens.tsx), so it is inlined here,
 * i18n-aware (aria-label + DETECTED marker). Topbar / nav / brand / demo-banner are owned by page.tsx.
 */

/* area chart with detection marker — viewBox-scaled (inlined; design default 210, Overview uses 216) */
function AreaChart({
  data,
  detectIndex,
  labels,
  detectAt,
  lang,
}: {
  data: number[];
  detectIndex: number;
  labels: ChartLabel[];
  detectAt: string;
  lang: Lang;
}) {
  const W = 760;
  const H = 230;
  const padL = 34;
  const padR = 12;
  const padT = 16;
  const padB = 24;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const px = (i: number) => padL + (i / (data.length - 1)) * iw;
  const py = (v: number) => padT + ih - (Math.min(v, 100) / 100) * ih;
  const line = data.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const area = `${padL},${padT + ih} ${line} ${padL + iw},${padT + ih}`;
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: 'block', height: 216 }}
      role="img"
      aria-label={t('a11y_threat_chart', lang)}
    >
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={padL} x2={W - padR} y1={py(g)} y2={py(g)} stroke="var(--line-soft)" strokeWidth="1" />
          <text
            x={padL - 7}
            y={py(g) + 3}
            textAnchor="end"
            fontSize="9"
            fill="var(--t3)"
            fontFamily="var(--f-mono)"
          >
            {g}
          </text>
        </g>
      ))}
      {labels.map((lb) => (
        <text
          key={lb.i}
          x={px(lb.i)}
          y={H - 7}
          textAnchor="middle"
          fontSize="9"
          fill="var(--t3)"
          fontFamily="var(--f-mono)"
        >
          {lb.t}
        </text>
      ))}
      <polygon points={area} fill="var(--acc-soft)" />
      <polyline points={line} fill="none" stroke="var(--acc)" strokeWidth="1.8" strokeLinejoin="round" />
      <g>
        <line
          x1={px(detectIndex)}
          x2={px(detectIndex)}
          y1={padT - 2}
          y2={padT + ih}
          stroke="var(--crit)"
          strokeWidth="1.2"
          strokeDasharray="3 3"
        />
        <circle cx={px(detectIndex)} cy={py(data[detectIndex] ?? 0)} r="3.5" fill="var(--crit)" />
        <text
          x={px(detectIndex) - 6}
          y={padT + 6}
          textAnchor="end"
          fontSize="9"
          fill="var(--crit)"
          fontFamily="var(--f-mono)"
          letterSpacing="0.08em"
        >
          {t('chart_detected', lang)} {detectAt}
        </text>
      </g>
    </svg>
  );
}

function FeedGlyph({ kind }: { kind: FeedKind }) {
  if (kind === 'detect') return <Glyph k="tri" size={9} color="var(--crit)" />;
  if (kind === 'contain') return <Glyph k="check" size={9} color="var(--acc)" />;
  if (kind === 'scan') return <Glyph k="arc" size={9} color="var(--low)" />;
  if (kind === 'intel') return <Glyph k="diamond" size={9} color="var(--low)" />;
  return <Glyph k="square" size={8} color="var(--t3)" />;
}

// demo scenario time 03:19:30 UTC at mount, ticking — only drives injected-feed timestamps
const DEMO_BASE = Date.UTC(2026, 5, 12, 3, 19, 30);
type FeedRow = FeedItem & { fresh?: boolean };

function ActionFeed({ s, lang }: { s: DemoScenario; lang: Lang }) {
  // seed = static s.feed (deterministic for SSR); queued items appended client-side only (no hydration drift)
  const [items, setItems] = useState<FeedRow[]>(s.feed);
  const qRef = useRef(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => {
      if (qRef.current >= s.feedQueue.length) {
        clearInterval(id);
        return;
      }
      const next = s.feedQueue[qRef.current++];
      if (!next) {
        clearInterval(id);
        return;
      }
      const d = new Date(DEMO_BASE + (Date.now() - t0));
      const p = (x: number) => String(x).padStart(2, '0');
      const clock = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
      setItems((prev) => [{ ...next, t: clock, fresh: true }, ...prev].slice(0, 14));
    }, 7000);
    return () => clearInterval(id);
  }, [s.feedQueue]);

  return (
    <Panel
      title={t('autonomous_actions', lang)}
      sub={t('live_live', lang)}
      right={<Glyph k="circle" size={7} color="var(--acc)" className="pulse-dot" />}
      bodyClass="flush"
      style={{ height: '100%' }}
    >
      <div className="feed" style={{ maxHeight: 642 }}>
        {items.map((f, i) => (
          <div className={`feed-item${f.fresh && i === 0 ? ' new' : ''}`} key={(f.t ?? '') + f.text}>
            <div className="feed-glyph">
              <FeedGlyph kind={f.kind} />
            </div>
            <div>
              <div className="feed-text">
                {f.text}
                {f.host ? (
                  <span>
                    {' '}
                    <span className="fhost">{f.host}</span>
                  </span>
                ) : null}
              </div>
              <div className="feed-meta">
                <span>{f.t} UTC</span>
                <span>{f.meta}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// segment-state visual map (glyph + label keep a11y: never color alone)
const SEG_MAP: Record<
  SegmentState,
  { color: string; key: 'seg_nominal' | 'seg_watch' | 'seg_contained'; glyph: 'check' | 'ring' | 'square' }
> = {
  ok: { color: 'var(--ok)', key: 'seg_nominal', glyph: 'check' },
  watch: { color: 'var(--med)', key: 'seg_watch', glyph: 'ring' },
  contained: { color: 'var(--high)', key: 'seg_contained', glyph: 'square' },
};

function SegmentStrip({ segments, lang }: { segments: Segment[]; lang: Lang }) {
  return (
    <div className="seg-strip">
      {segments.map((seg) => {
        const m = SEG_MAP[seg.state];
        return (
          <div className="seg-cell" key={seg.name}>
            <div className="s-name">
              <Glyph k={m.glyph} size={8} color={m.color} />
              {seg.name}
            </div>
            <div className="s-meta">
              {seg.hosts} {t('hosts_unit', lang).toUpperCase()} ·{' '}
              <span style={{ color: m.color }}>{t(m.key, lang).toUpperCase()}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IncidentCard({ s, lang, onOpen }: { s: DemoScenario; lang: Lang; onOpen: () => void }) {
  const I = s.incident;
  return (
    <Panel
      title={t('active_incident', lang)}
      sub={tf('n_open', lang, { n: s.kpis.activeThreats }).toUpperCase()}
      right={<Sev level={I.sev} />}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 18, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span
              className="mono"
              style={{ fontSize: 16, fontWeight: 600, color: 'var(--t1)', letterSpacing: '0.02em' }}
            >
              {I.id}
            </span>
            <span className="disp" style={{ fontSize: 13, fontWeight: 600 }}>
              {I.family}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--t3)' }}>{I.classify}</span>
          </div>
          <div
            className="kv"
            style={{ marginTop: 14, gridTemplateColumns: '118px 1fr 118px 1fr', gap: '7px 12px' }}
          >
            <span className="k">{t('f_patient_zero', lang)}</span>
            <span className="v mono">{I.patientZero}</span>
            <span className="k">{t('f_detected', lang)}</span>
            <span className="v mono">{I.detectedAt}</span>
            <span className="k">{t('f_vector', lang)}</span>
            <span className="v" style={{ fontSize: 11.5 }}>
              {I.vector}
            </span>
            <span className="k">{t('f_detect_latency', lang)}</span>
            <span className="v mono">{I.detectLatency}</span>
            <span className="k">{t('f_files_encrypted', lang)}</span>
            <span className="v mono">{I.filesEncrypted.toLocaleString()}</span>
            <span className="k">{t('label_confidence', lang)}</span>
            <span className="v mono">{(I.confidence * 100).toFixed(0)}%</span>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="mono" style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--t3)' }}>
                {t('containment', lang).toUpperCase()}
              </span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--acc)' }}>
                {I.containment}%
              </span>
            </div>
            <div className="progress">
              <div className="fill" style={{ width: `${I.containment}%` }} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
          <span className="badge bd-acc">
            <Glyph k="check" size={8} />
            {I.status}
          </span>
          <span
            className="mono"
            style={{
              fontSize: 10.5,
              color: 'var(--t3)',
              textAlign: 'right',
              lineHeight: 1.6,
              whiteSpace: 'nowrap',
            }}
          >
            {tf('hosts_affected_n', lang, { n: I.hostsAffected }).toUpperCase()}
            <br />
            {tf('hosts_isolated_spreading', lang, { iso: I.hostsIsolated, spr: 0 }).toUpperCase()}
          </span>
          <Btn kind="primary" onClick={onOpen}>
            {t('open_incident', lang)}
          </Btn>
        </div>
      </div>
    </Panel>
  );
}

export function Overview({ s, lang, onOpen }: { s: DemoScenario; lang: Lang; onOpen: () => void }) {
  const K = s.kpis;
  const I = s.incident;
  return (
    <div data-screen-label="Command Overview">
      <div className="screen-title">
        <h1>{t('ov_title', lang)}</h1>
        <span className="sub">
          {s.org.toUpperCase()} · SOC-A · {t('all_segments', lang).toUpperCase()}
        </span>
      </div>
      <div className="kpi-row">
        <Kpi
          label={t('kpi_active_threats', lang)}
          value={K.activeThreats}
          alert
          live
          sub={
            <span>
              {I.family} ·{' '}
              <span style={{ color: 'var(--acc)' }}>
                {t('containment', lang).toUpperCase()} {I.containment}%
              </span>
            </span>
          }
        />
        <Kpi
          label={t('kpi_hosts_protected', lang)}
          value={K.hostsProtected.toLocaleString()}
          sub={tf('kpi_hosts_sub', lang, {
            enrolled: K.enrolled.toLocaleString(),
            pct: s.agents.coveragePct,
          }).toUpperCase()}
        />
        <Kpi
          label={t('kpi_auto_contain_today', lang)}
          value={K.containmentsToday}
          sub={tf('kpi_contain_sub', lang, { at: K.lastContainmentAt, n: K.escalations }).toUpperCase()}
        />
        <Kpi
          label={t('kpi_mttr', lang)}
          value={K.mttr}
          unit={K.mttrUnit}
          sub={
            <span>
              <span className="pos">▾ {K.mttrDeltaPct}%</span> {t('vs_baseline', lang).toUpperCase()}
            </span>
          }
        />
      </div>
      <div className="ov-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Panel
            title={t('threat_activity', lang)}
            sub={t('threat_sub', lang).toUpperCase()}
            right={<span className="badge bd-mut">{t('all_segments', lang).toUpperCase()}</span>}
          >
            <AreaChart
              data={s.activity}
              detectIndex={s.detectIndex}
              labels={s.activityLabels}
              detectAt={I.detectedAt.slice(0, 8)}
              lang={lang}
            />
          </Panel>
          <IncidentCard s={s} lang={lang} onOpen={onOpen} />
          <SegmentStrip segments={s.segments} lang={lang} />
        </div>
        <ActionFeed s={s} lang={lang} />
      </div>
    </div>
  );
}
