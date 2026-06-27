'use client';
import { useEffect, useState } from 'react';
import {
  type DemoScenario,
  type HostStatus,
  PRODUCT_NAME,
  type PlanStatus,
  type PlanStep,
  type SevLevel,
} from '../../lib/data';
import { type Lang, t, tf } from '../../lib/i18n';
import { Btn, Chip, Glyph, Panel, RiskCell, SearchBox, Sev, StatusPill } from '../ui';

/**
 * Incident Detail — ported 1:1 from the design (crown-defense-design/screen-incident.jsx) against the frozen
 * demo-data shape, with the genuinely-live LLM recovery panel grafted in (server-side /api/analyze) plus a
 * compact HUMAN_GATED dual-control queue. The design's "TALOS" autonomous-action badge renders as PRODUCT_NAME
 * (the codename is never user-facing); the engine host token surfaces as data via ev.host (ENGINE_ID).
 */

/** Live incident report from /api/analyze. The LLM layer emits advisory output only (C7) — never an action. */
export interface ReportState {
  live: boolean;
  status: string;
  routed_to_human: boolean;
  model_id: string;
  faithfulness: { score: number; passed: boolean } | null;
  report: { summary: string } | null;
  plan: {
    steps: { order: number; action: string; rationale: string; playbook_ref: string; priority: string }[];
  } | null;
}

/* Clock anchored to the demo's frozen UTC moment (mirrors the page chrome clock); SSR-safe static seed. */
function useDemoClock() {
  const [c, setC] = useState('03:19:30');
  useEffect(() => {
    const base = Date.UTC(2026, 5, 12, 3, 19, 30);
    const t0 = Date.now();
    const id = setInterval(() => {
      const d = new Date(base + (Date.now() - t0));
      const p = (x: number) => String(x).padStart(2, '0');
      setC(`${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return c;
}

const SEV_BAR: Record<SevLevel, { w: string; h: number; v: string }> = {
  critical: { w: '100%', h: 6, v: 'var(--crit)' },
  high: { w: '70%', h: 5, v: 'var(--high)' },
  medium: { w: '46%', h: 4, v: 'var(--med)' },
  low: { w: '28%', h: 3, v: 'var(--low)' },
  talos: { w: '100%', h: 5, v: 'var(--acc)' },
};

function HeaderStat({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div>
      <div
        className="mono"
        style={{
          fontSize: 9,
          letterSpacing: '0.12em',
          color: 'var(--t3)',
          marginBottom: 3,
          whiteSpace: 'nowrap',
        }}
      >
        {k}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: accent ? 'var(--acc)' : 'var(--t1)',
          whiteSpace: 'nowrap',
        }}
      >
        {String(v).replace(/ /g, ' ')}
      </div>
    </div>
  );
}

function IncidentHeader({ s, lang }: { s: DemoScenario; lang: Lang }) {
  const I = s.incident;
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 18px', flexWrap: 'wrap' }}>
        <Sev level={I.sev} />
        <span className="mono" style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)' }}>
          {I.id}
        </span>
        <span className="disp" style={{ fontSize: 13, fontWeight: 600 }}>
          {I.family} <span style={{ color: 'var(--t3)', fontWeight: 400 }}>· {I.classify}</span>
        </span>
        <span className="badge bd-acc">
          <Glyph k="check" size={8} />
          {I.status}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 22 }}>
          <HeaderStat k={t('chart_detected', lang)} v={I.detectedAt} />
          <HeaderStat k={t('hdr_latency', lang)} v={I.detectLatency} accent />
          <HeaderStat k={t('hdr_confidence', lang)} v={`${(I.confidence * 100).toFixed(0)}%`} />
          <div style={{ minWidth: 150 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="mono" style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--t3)' }}>
                {t('hdr_containment', lang)}
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--acc)' }}>
                {I.containment}%
              </span>
            </div>
            <div className="progress" style={{ height: 5 }}>
              <div className="fill" style={{ width: `${I.containment}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttackTimeline({ s, lang }: { s: DemoScenario; lang: Lang }) {
  return (
    <Panel
      title={t('attack_timeline', lang)}
      sub={t('mitre_phases', lang)}
      bodyClass="flush"
      className="a-tl"
      style={{ minHeight: 0 }}
    >
      <div className="tl" style={{ maxHeight: 932 }}>
        {s.phases.map((ph) => (
          <div key={ph.name}>
            <div className={`tl-phase${ph.talos ? ' talos' : ''}`}>
              <span className="ph-name">{ph.name}</span>
              <span className="ph-tac">{ph.tactic}</span>
            </div>
            {ph.events.map((ev) => {
              const b = SEV_BAR[ev.sev];
              return (
                <div className="tl-ev" key={ev.t}>
                  <div className="tl-time">{ev.t}</div>
                  <div className="tl-body">
                    <div className="tl-bar" style={{ width: b.w, height: b.h, background: b.v }} />
                    <div className="tl-title">{ev.title}</div>
                    <div className="tl-meta">
                      {ev.sev === 'talos' ? (
                        <span className="badge bd-acc">
                          <Glyph k="check" size={8} />
                          {PRODUCT_NAME}
                        </span>
                      ) : (
                        <Sev level={ev.sev} />
                      )}
                      <span className="mhost">{ev.host}</span>
                      {ev.conf != null ? (
                        <span className="mconf">
                          {t('conf', lang)} {ev.conf.toFixed(2)}
                        </span>
                      ) : null}
                    </div>
                    <div
                      style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4, fontFamily: 'var(--f-mono)' }}
                    >
                      {ev.detail}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------- blast radius ---------- */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
const NODE_STYLE: Record<HostStatus, { fill?: string; stroke?: string }> = {
  compromised: { fill: 'var(--crit)' },
  contained: { fill: 'var(--high)' },
  isolated: { fill: 'var(--med)' },
  scanning: { stroke: 'var(--low)' },
  protected: { stroke: 'var(--ok)' },
};
function NodeShape({ x, y, r, status }: { x: number; y: number; r: number; status: HostStatus }) {
  const inner = 'var(--bg0)';
  return (
    <g>
      {status === 'compromised' ? (
        <circle
          cx={x}
          cy={y}
          r={r + 6}
          fill="none"
          stroke="var(--crit)"
          strokeWidth="1.2"
          opacity="0.5"
          className="pulse-dot"
        />
      ) : null}
      {status === 'scanning' ? (
        <circle
          cx={x}
          cy={y}
          r={r}
          fill="var(--bg1)"
          stroke="var(--low)"
          strokeWidth="1.6"
          strokeDasharray="3.5 3"
        />
      ) : status === 'protected' ? (
        <circle cx={x} cy={y} r={r} fill="var(--bg1)" stroke="var(--ok)" strokeWidth="1.6" />
      ) : (
        <circle cx={x} cy={y} r={r} fill={NODE_STYLE[status].fill} />
      )}
      {status === 'compromised' ? (
        <polygon points={`${x},${y - 4.5} ${x + 4.5},${y + 3.5} ${x - 4.5},${y + 3.5}`} fill={inner} />
      ) : null}
      {status === 'contained' ? <rect x={x - 3.2} y={y - 3.2} width="6.4" height="6.4" fill={inner} /> : null}
      {status === 'isolated' ? (
        <circle cx={x} cy={y} r="3.4" fill="none" stroke={inner} strokeWidth="1.7" />
      ) : null}
      {status === 'scanning' ? <circle cx={x} cy={y} r="2.2" fill="var(--low)" /> : null}
      {status === 'protected' ? (
        <polyline
          points={`${x - 3},${y + 0.5} ${x - 0.8},${y + 2.8} ${x + 3.4},${y - 2.6}`}
          fill="none"
          stroke="var(--ok)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </g>
  );
}
function BlastRadius({ s, lang }: { s: DemoScenario; lang: Lang }) {
  const G = s.blast;
  const W = 640;
  const H = 470;
  const cx = 320;
  const cy = 238;
  const RINGS = [88, 168];
  const pos: Record<string, [number, number]> = { [G.center.name]: [cx, cy] };
  for (const n of G.nodes) {
    pos[n.name] = polar(cx, cy, RINGS[n.ring - 1], n.ang);
  }
  const edgeStyle: Record<string, { stroke: string; w: number; dash?: string }> = {
    lateral: { stroke: 'var(--crit)', w: 2 },
    blocked: { stroke: 'var(--high)', w: 1.6, dash: '4 3' },
    watch: { stroke: 'var(--line)', w: 1.2, dash: '2 4' },
  };
  // canonical status/edge tokens — rendered identically by StatusPill (untranslated), so kept canonical here.
  const legend: [HostStatus, string][] = [
    ['compromised', 'COMPROMISED'],
    ['contained', 'CONTAINED'],
    ['isolated', 'ISOLATED'],
    ['scanning', 'SCANNING'],
    ['protected', 'SAFE'],
  ];
  return (
    <Panel
      title={t('blast_radius', lang)}
      sub={tf('blast_sub', lang, { n: G.nodes.length })}
      bodyClass="flush"
      className="a-graph"
    >
      <div className="blast-wrap">
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: 'block', maxHeight: 470 }}
          role="img"
          aria-label={t('a11y_blast_map', lang)}
        >
          {RINGS.map((r, i) => (
            <g key={r}>
              <circle cx={cx} cy={cy} r={r} className="ring-line" strokeDasharray="2 5" />
              <text x={cx + 6} y={cy - r - 6} className="ring-tag">
                {t('hop', lang)} {i + 1}
              </text>
            </g>
          ))}
          {G.edges.map((e) => {
            const [x1, y1] = pos[e.from];
            const [x2, y2] = pos[e.to];
            const st = edgeStyle[e.kind];
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            return (
              <g key={e.from + e.to}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={st.stroke}
                  strokeWidth={st.w}
                  strokeDasharray={st.dash}
                />
                {e.kind === 'blocked' ? (
                  <g>
                    <circle cx={mx} cy={my} r="7" fill="var(--bg1)" stroke="var(--high)" strokeWidth="1" />
                    <g stroke="var(--high)" strokeWidth="1.6" strokeLinecap="round">
                      <line x1={mx - 2.6} y1={my - 2.6} x2={mx + 2.6} y2={my + 2.6} />
                      <line x1={mx + 2.6} y1={my - 2.6} x2={mx - 2.6} y2={my + 2.6} />
                    </g>
                  </g>
                ) : null}
              </g>
            );
          })}
          {G.nodes.map((n) => {
            const [x, y] = pos[n.name];
            return (
              <g key={n.name}>
                <NodeShape x={x} y={y} r={n.ring === 1 ? 11 : 9} status={n.status} />
                <text
                  x={x}
                  y={y + (n.ring === 1 ? 25 : 22)}
                  textAnchor="middle"
                  className={`node-label${n.status !== 'protected' ? ' hot' : ''}`}
                >
                  {n.name}
                </text>
              </g>
            );
          })}
          <g>
            <NodeShape x={cx} y={cy} r={14} status="compromised" />
            <text x={cx} y={cy - 26} textAnchor="middle" className="ring-tag" style={{ fill: 'var(--crit)' }}>
              {t('patient_zero', lang)}
            </text>
            <text x={cx} y={cy + 30} textAnchor="middle" className="node-label hot">
              {G.center.name}
            </text>
          </g>
        </svg>
        <div className="blast-legend">
          {legend.map(([st, lb]) => (
            <span className="lg" key={st}>
              <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                <NodeShape x={12} y={12} r={9} status={st} />
              </svg>
              {lb}
            </span>
          ))}
          <span className="lg">
            <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden="true">
              <line x1="0" y1="4" x2="16" y2="4" stroke="var(--crit)" strokeWidth="2" />
            </svg>
            LATERAL MOVE
          </span>
          <span className="lg">
            <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="16"
                y2="4"
                stroke="var(--high)"
                strokeWidth="1.6"
                strokeDasharray="3 2"
              />
            </svg>
            BLOCKED
          </span>
        </div>
      </div>
    </Panel>
  );
}

/* ---------- autonomous response plan (design interaction truth: approve -> queued, override -> held) ---------- */
type Step = PlanStep & { actedAt?: string };
function ResponsePlan({ s, lang, clock }: { s: DemoScenario; lang: Lang; clock: string }) {
  const [steps, setSteps] = useState<Step[]>(s.plan);
  const act = (n: number, status: PlanStatus) =>
    setSteps((prev) => prev.map((st) => (st.n === n ? { ...st, status, actedAt: clock } : st)));
  const glyphFor = (st: Step) =>
    st.status === 'done' ? (
      <Glyph k="check" size={9} color="var(--acc)" />
    ) : st.status === 'active' ? (
      <Glyph k="arc" size={9} color="var(--acc)" className="spin" />
    ) : st.status === 'queued' ? (
      <Glyph k="check" size={9} color="var(--acc)" />
    ) : st.status === 'held' ? (
      <Glyph k="x" size={9} color="var(--high)" />
    ) : (
      <span className="mono" style={{ fontSize: 10 }}>
        {st.n}
      </span>
    );
  const pending = s.plan.filter((p) => p.status === 'approval').length;
  return (
    <Panel
      title={t('plan_title', lang)}
      sub={tf('plan_sub', lang, { n: s.plan.length, p: pending })}
      bodyClass="flush"
      className="a-plan"
      style={{ minHeight: 0 }}
    >
      <div className="plan" style={{ maxHeight: 932 }}>
        {steps.map((st) => (
          <div className={`plan-step ${st.status}`} key={st.n}>
            <div className="plan-num">{glyphFor(st)}</div>
            <div>
              <div className="plan-title">{st.title}</div>
              <div className="plan-detail">{st.detail}</div>
              <div className="plan-foot">
                {st.status === 'done' ? (
                  <span className="plan-t" style={{ color: 'var(--acc)' }}>
                    {tf('plan_executed', lang, { t: st.t ?? '' })}
                  </span>
                ) : null}
                {st.status === 'active' ? (
                  <span className="plan-t" style={{ color: 'var(--acc)' }}>
                    {tf('plan_running', lang, { eta: st.eta ?? '' })}
                  </span>
                ) : null}
                {st.status === 'approval' ? (
                  <>
                    <span className="badge bd-med">
                      <Glyph k="ring" size={8} />
                      {t('awaiting_approval', lang)}
                    </span>
                    <Btn kind="primary" sm onClick={() => act(st.n, 'queued')}>
                      {t('approve', lang)}
                    </Btn>
                    <Btn sm onClick={() => act(st.n, 'held')}>
                      {t('override', lang)}
                    </Btn>
                  </>
                ) : null}
                {st.status === 'queued' ? (
                  <span className="plan-t" style={{ color: 'var(--acc)' }}>
                    {tf('plan_approved', lang, { at: st.actedAt ?? '' })}
                  </span>
                ) : null}
                {st.status === 'held' ? (
                  <span className="plan-t" style={{ color: 'var(--high)' }}>
                    {tf('plan_held', lang, { at: st.actedAt ?? '' })}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------- affected hosts ---------- */
function AffectedHosts({ s, lang }: { s: DemoScenario; lang: Lang }) {
  const rows = s.affected;
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | HostStatus>('all');
  const statuses: ('all' | HostStatus)[] = [
    'all',
    'compromised',
    'contained',
    'isolated',
    'scanning',
    'protected',
  ];
  const out = rows.filter(
    (r) =>
      (f === 'all' || r.status === f) && (q === '' || r.name.includes(q.toLowerCase()) || r.ip.includes(q))
  );
  return (
    <Panel
      title={t('affected_hosts', lang)}
      sub={tf('affected_sub', lang, { n: rows.length })}
      right={
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder={t('search_host_ip', lang)}
          width={170}
          label={t('search_hosts', lang)}
        />
      }
      bodyClass="flush"
    >
      <div className="tbl-toolbar">
        <div className="chips">
          {statuses.map((st) => (
            <Chip
              key={st}
              on={f === st}
              onClick={() => setF(st)}
              n={st === 'all' ? rows.length : rows.filter((r) => r.status === st).length}
            >
              {st === 'all' ? t('chip_all', lang) : st.toUpperCase()}
            </Chip>
          ))}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl dense">
          <thead>
            <tr>
              <th>{t('col_host', lang)}</th>
              <th>{t('col_ip_address', lang)}</th>
              <th>{t('col_segment', lang)}</th>
              <th>{t('col_status', lang)}</th>
              <th>{t('col_first_event', lang)}</th>
              <th>{t('col_last_action', lang)}</th>
              <th>{t('col_risk', lang)}</th>
              <th>{t('col_files_enc', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {out.map((r) => (
              <tr key={r.name}>
                <td className="mono host">{r.name}</td>
                <td className="mono">{r.ip}</td>
                <td>{r.seg}</td>
                <td>
                  <StatusPill status={r.status} />
                </td>
                <td className="mono">{r.first}</td>
                <td className="mono">{r.last}</td>
                <td>
                  <RiskCell v={r.risk} />
                </td>
                <td className="mono">{r.files ? r.files.toLocaleString() : '—'}</td>
              </tr>
            ))}
            {out.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-note">{t('no_hosts_match', lang)}</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ---------- live LLM recovery plan (genuinely-mine: server-side /api/analyze, faithfulness-gated, C7) ---------- */
function RecoveryLLM({
  lang,
  report,
  onGenerate,
  generating,
}: {
  lang: Lang;
  report: ReportState | null;
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <Panel
      title={t('recovery_plan', lang)}
      sub={t('llm_advisory', lang)}
      right={
        report?.faithfulness ? (
          <span
            className="mono"
            style={{ fontSize: 10, color: report.faithfulness.passed ? 'var(--ok)' : 'var(--crit)' }}
          >
            {t('faithfulness', lang)} {report.faithfulness.score}
          </span>
        ) : null
      }
    >
      {!report ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <p style={{ color: 'var(--t2)', fontSize: 12, margin: 0 }}>{t('recovery_plan_intro', lang)}</p>
          <div>
            <Btn kind="primary" onClick={onGenerate} disabled={generating}>
              {generating ? t('generating', lang) : t('generate_report', lang)}
            </Btn>
          </div>
        </div>
      ) : report.routed_to_human ? (
        <div
          style={{
            padding: 10,
            borderRadius: 6,
            background: 'var(--crit-soft)',
            color: 'var(--crit)',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Glyph k="diamond" size={9} /> {t('routed_human', lang)}
          {report.faithfulness ? ` — ${report.faithfulness.score}` : ''}
        </div>
      ) : (
        <div>
          <p style={{ color: 'var(--t2)', fontSize: 12, marginTop: 0 }}>{report.report?.summary}</p>
          <div className="plan" style={{ marginTop: 4 }}>
            {report.plan?.steps.map((st) => (
              <div
                key={st.order}
                className="plan-step"
                style={{ gridTemplateColumns: 'auto 1fr auto', alignItems: 'center' }}
              >
                <span className="badge bd-acc">
                  <Glyph k="square" size={7} />
                  {st.priority}
                </span>
                <div>
                  <div className="plan-title">{st.action}</div>
                  <div className="plan-detail mono">
                    {t('plan_cite', lang)}: {st.playbook_ref}
                  </div>
                </div>
                <Btn sm kind="primary">
                  {t('approve', lang)}
                </Btn>
              </div>
            ))}
          </div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--t3)', marginTop: 10 }}>
            {tf('model_line', lang, {
              model: report.model_id,
              live: report.live ? t('live_live', lang) : t('live_fallback', lang),
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ---------- compact HUMAN_GATED dual-control queue (genuinely-mine: a second distinct approver) ---------- */
function ApprovalQueue({ s, lang }: { s: DemoScenario; lang: Lang }) {
  const pending = s.plan.filter((p) => p.status === 'approval');
  const [acted, setActed] = useState<Record<number, 'approved' | 'overridden' | undefined>>({});
  return (
    <Panel title={t('approval_queue', lang)} sub={t('dual_control_sub', lang)} bodyClass="flush">
      {pending.length === 0 ? (
        <div className="empty-note">{t('no_pending_approvals', lang)}</div>
      ) : (
        pending.map((p) => {
          const a = acted[p.n];
          return (
            <div key={p.n} style={{ padding: '11px 16px', borderBottom: '1px solid var(--line-soft)' }}>
              <div className="plan-title">{p.title}</div>
              <div className="plan-detail">{p.detail}</div>
              <div className="plan-foot">
                {!a ? (
                  <>
                    <Btn
                      kind="primary"
                      sm
                      onClick={() => setActed((prev) => ({ ...prev, [p.n]: 'approved' }))}
                    >
                      {t('approve', lang)} {t('approver_two', lang)}
                    </Btn>
                    <Btn sm onClick={() => setActed((prev) => ({ ...prev, [p.n]: 'overridden' }))}>
                      {t('override', lang)}
                    </Btn>
                    <span
                      className="mono"
                      style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '0.04em' }}
                    >
                      {t('second_approver', lang)}
                    </span>
                  </>
                ) : a === 'approved' ? (
                  <>
                    <span className="badge bd-ok">
                      <Glyph k="check" size={8} />
                      {t('approved_short', lang)}
                    </span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--t3)' }}>
                      OPR-03 {t('approver_two', lang)}
                    </span>
                    <Btn sm onClick={() => setActed((prev) => ({ ...prev, [p.n]: undefined }))}>
                      {t('revert', lang)}
                    </Btn>
                  </>
                ) : (
                  <span className="badge bd-low">
                    <Glyph k="x" size={8} />
                    {t('overridden', lang)}
                  </span>
                )}
              </div>
            </div>
          );
        })
      )}
    </Panel>
  );
}

export function Incident({
  s,
  lang,
  report,
  onGenerate,
  generating,
}: {
  s: DemoScenario;
  lang: Lang;
  report: ReportState | null;
  onGenerate: () => void;
  generating: boolean;
}) {
  const clock = useDemoClock();
  return (
    <div data-screen-label="Incident Detail">
      <div className="screen-title">
        <h1>{t('incident_detail', lang)}</h1>
        <span className="sub">{t('incident_loop_sub', lang)}</span>
      </div>
      <IncidentHeader s={s} lang={lang} />
      <div className="inc-grid">
        <AttackTimeline s={s} lang={lang} />
        <BlastRadius s={s} lang={lang} />
        <ResponsePlan s={s} lang={lang} clock={clock} />
        <div className="a-table">
          <AffectedHosts s={s} lang={lang} />
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)',
          gap: 14,
          marginTop: 14,
          alignItems: 'start',
        }}
      >
        <RecoveryLLM lang={lang} report={report} onGenerate={onGenerate} generating={generating} />
        <ApprovalQueue s={s} lang={lang} />
      </div>
    </div>
  );
}
