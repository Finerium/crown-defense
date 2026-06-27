'use client';
import { useMemo, useState } from 'react';
import type { DemoScenario } from '../lib/data';
import { type Lang, t } from '../lib/i18n';
import { Btn, Chip, Glyph, Kpi, Panel, RiskCell, SearchBox, Sev, StatusPill } from './ui';

/* ---------------- shared charts ---------------- */
function AreaChart({
  data,
  detectIndex,
  labels,
}: { data: number[]; detectIndex: number; labels: { i: number; t: string }[] }) {
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
      style={{ display: 'block', height: 210 }}
      role="img"
      aria-label="Threat activity, events per minute"
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
        <circle cx={px(detectIndex)} cy={py(data[detectIndex] as number)} r="3.5" fill="var(--crit)" />
        <text
          x={px(detectIndex) - 6}
          y={padT + 6}
          textAnchor="end"
          fontSize="9"
          fill="var(--crit)"
          fontFamily="var(--f-mono)"
          letterSpacing="0.08em"
        >
          DETECTED 03:14:07
        </text>
      </g>
    </svg>
  );
}

function BlastGraph({ blast }: { blast: DemoScenario['incident']['blast'] }) {
  const W = 520;
  const H = 300;
  // simple deterministic layout: compromised center-left, others fanned out
  const pos: Record<string, { x: number; y: number }> = {};
  blast.nodes.forEach((n, i) => {
    if (n.status === 'COMPROMISED') pos[n.host_id] = { x: 110, y: H / 2 };
    else
      pos[n.host_id] = {
        x: 300 + (i % 2) * 150,
        y: 50 + ((i - 1) * (H - 100)) / Math.max(1, blast.nodes.length - 1),
      };
  });
  const color = (s: string) =>
    s === 'COMPROMISED'
      ? 'var(--crit)'
      : s === 'CONTAINED'
        ? 'var(--high)'
        : s === 'SCANNING'
          ? 'var(--med)'
          : 'var(--ok)';
  const glyphFor: Record<string, string> = { COMPROMISED: '▲', CONTAINED: '■', SCANNING: '◔', SAFE: '✓' };
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: 'block', height: 290 }}
      role="img"
      aria-label="Blast-radius map: compromised, contained and safe hosts with lateral-movement edges"
    >
      {blast.edges.map((e, i) => {
        const a = pos[e.from_host];
        const b = pos[e.to_host];
        if (!a || !b) return null;
        return (
          <g key={i}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={e.status === 'BLOCKED' ? 'var(--ok)' : 'var(--crit)'}
              strokeWidth="1.6"
              strokeDasharray={e.status === 'BLOCKED' ? '4 4' : undefined}
              opacity={0.8}
            />
            <text
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2 - 4}
              textAnchor="middle"
              fontSize="8.5"
              fill="var(--t3)"
              fontFamily="var(--f-mono)"
            >
              {e.reachable_service} {e.status === 'BLOCKED' ? '⊘' : '→'}
            </text>
          </g>
        );
      })}
      {blast.nodes.map((n) => {
        const p = pos[n.host_id];
        if (!p) return null;
        return (
          <g key={n.host_id}>
            <circle cx={p.x} cy={p.y} r="20" fill="var(--bg2)" stroke={color(n.status)} strokeWidth="2" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="13" fill={color(n.status)}>
              {glyphFor[n.status]}
            </text>
            <text
              x={p.x}
              y={p.y + 34}
              textAnchor="middle"
              fontSize="9"
              fill="var(--t2)"
              fontFamily="var(--f-mono)"
            >
              {n.host_id}
            </text>
            <text x={p.x} y={p.y + 45} textAnchor="middle" fontSize="8" fill="var(--t3)">
              {n.status}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const DIALS: { id: string; key: 'dial_monitor' | 'dial_alert' | 'dial_human' | 'dial_auto' }[] = [
  { id: 'MONITOR_ONLY', key: 'dial_monitor' },
  { id: 'ALERT_RECOMMEND', key: 'dial_alert' },
  { id: 'HUMAN_GATED', key: 'dial_human' },
  { id: 'FULL_AUTO', key: 'dial_auto' },
];

export function DialControl({
  value,
  onChange,
  lang,
}: { value: string; onChange: (v: string) => void; lang: Lang }) {
  return (
    <div>
      <div className="k-label" style={{ marginBottom: 8 }}>
        {t('dial', lang)}
      </div>
      <div
        role="radiogroup"
        aria-label={t('dial', lang)}
        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
      >
        {DIALS.map((d, i) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={value === d.id}
            onClick={() => onChange(d.id)}
            className={`btn ${value === d.id ? 'primary' : ''} sm`}
            style={{ justifyContent: 'space-between' }}
          >
            <span>
              <Glyph k={value === d.id ? 'check' : 'ring'} size={9} /> {t(d.key, lang)}
            </span>
            <span className="mono" style={{ fontSize: 9, opacity: 0.6 }}>
              {i}
            </span>
          </button>
        ))}
      </div>
      <div className="k-sub" style={{ marginTop: 8 }}>
        {value === 'MONITOR_ONLY'
          ? '✓ shipped + pilot default'
          : '⚠ destructive actions gated by the action matrix'}
      </div>
    </div>
  );
}

/* ---------------- screens ---------------- */
export function Overview({
  s,
  lang,
  dial,
  setDial,
}: { s: DemoScenario; lang: Lang; dial: string; setDial: (v: string) => void }) {
  return (
    <div className="ov-grid">
      <div className="kpi-row">
        <Kpi label={t('kpi_active_threats', lang)} value={1} live alert sub={s.incident.family} />
        <Kpi
          label={t('kpi_hosts_protected', lang)}
          value={s.fleet.protected.toLocaleString()}
          sub={`/ ${s.fleet.total_hosts.toLocaleString()}`}
        />
        <Kpi label={t('kpi_auto_contain', lang)} value={3} sub="ISOLATE · LOCK · KILL" />
        <Kpi
          label={t('kpi_mttr', lang)}
          value="2.1"
          unit="s"
          sub={`${t('files_lost', lang)}: ${s.incident.files_lost}`}
        />
      </div>
      <Panel title={t('threat_activity', lang)} sub="events/min" className="ov-chart">
        <AreaChart data={s.threat.series} detectIndex={s.threat.detectIndex} labels={s.threat.labels} />
      </Panel>
      <Panel title={t('action_feed', lang)} className="ov-feed" bodyClass="scroll">
        <ul className="feed">
          {s.actionFeed.map((a, i) => (
            <li key={i} className="feed-row">
              <span className="mono feed-t">{a.at}</span>
              <span
                className={`badge ${a.action_type === 'ISOLATE_HOST' || a.action_type === 'KILL_PROCESS' ? 'bd-crit' : 'bd-acc'}`}
              >
                <Glyph k={a.outcome === 'EXECUTED' ? 'check' : 'diamond'} size={8} />
                {a.action_type}
              </span>
              <span className="feed-detail">
                {a.host_id ?? '—'} · {a.detail}
              </span>
              <span className="mono" style={{ fontSize: 9, color: 'var(--t3)' }}>
                {a.autonomy_mode}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title={t('dial', lang)} className="ov-dial">
        <DialControl value={dial} onChange={setDial} lang={lang} />
      </Panel>
    </div>
  );
}

export function Incident({
  s,
  lang,
  report,
  onGenerate,
  generating,
}: { s: DemoScenario; lang: Lang; report: ReportState | null; onGenerate: () => void; generating: boolean }) {
  return (
    <div className="inc-grid">
      <Panel
        title={`${t('blast_radius', lang)} — ${s.incident.incident_id}`}
        sub={`${s.incident.family} · ${Math.round(s.incident.confidence * 100)}%`}
        right={<Sev level={s.incident.severity} />}
        className="a-graph"
      >
        <BlastGraph blast={s.incident.blast} />
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '4px 10px 10px', fontSize: 11 }}>
          {s.incident.signals.map((sig) => (
            <span key={sig.signal_type} style={{ color: sig.fired ? 'var(--t1)' : 'var(--t3)' }}>
              <Glyph k={sig.fired ? 'check' : 'x'} size={8} color={sig.fired ? 'var(--ok)' : 'var(--t3)'} />{' '}
              {sig.signal_type}
            </span>
          ))}
        </div>
      </Panel>

      <Panel title={t('incident_timeline', lang)} className="a-tl" bodyClass="scroll">
        <ol className="timeline">
          {s.incident.timeline.map((e, i) => (
            <li key={i} className="tl-item">
              <span className="tl-phase">{e.phase}</span>
              <span className="mono tl-at">{e.at.slice(11, 19)}</span>
              <p className="tl-desc">{e.description}</p>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel
        title={t('recovery_plan', lang)}
        sub="LLM · advisory"
        className="a-plan"
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
            <p style={{ color: 'var(--t2)', fontSize: 12 }}>
              On-contained-incident, the on-prem LLM generates a faithfulness-gated, playbook-cited recovery
              plan.
            </p>
            <Btn kind="primary" onClick={onGenerate} disabled={generating}>
              {generating ? t('generating', lang) : t('generate_report', lang)}
            </Btn>
          </div>
        ) : report.routed_to_human ? (
          <div className="bd-crit" style={{ padding: 10, borderRadius: 6 }}>
            <Glyph k="diamond" size={9} /> {t('routed_human', lang)} — {report.faithfulness?.score}
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--t2)', fontSize: 12, marginTop: 0 }}>{report.report?.summary}</p>
            <ol className="plan">
              {report.plan?.steps.map((st) => (
                <li key={st.order} className="plan-step">
                  <span className="badge bd-acc">
                    <Glyph k="square" size={7} />
                    {st.priority}
                  </span>
                  <div>
                    <div className="plan-action">{st.action}</div>
                    <div className="plan-cite mono">cite: {st.playbook_ref}</div>
                  </div>
                  <Btn sm kind="primary">
                    {t('approve', lang)}
                  </Btn>
                </li>
              ))}
            </ol>
            <div className="mono" style={{ fontSize: 9, color: 'var(--t3)', marginTop: 8 }}>
              model {report.model_id} · {report.live ? 'LIVE' : 'fallback'} · advisory only (never emits an
              action)
            </div>
          </div>
        )}
      </Panel>

      <Panel title={t('affected_hosts', lang)} className="a-table" bodyClass="scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Host</th>
              <th>Status</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {s.hosts
              .filter((h) => s.incident.affected_host_ids.includes(h.host_id))
              .map((h) => (
                <tr key={h.host_id}>
                  <td className="mono">{h.hostname}</td>
                  <td>
                    <StatusPill status={h.status} />
                  </td>
                  <td>{h.role}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

const PAGE = 12;
export function Fleet({ s, lang }: { s: DemoScenario; lang: Lang }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [drawer, setDrawer] = useState<string | null>(null);
  const filtered = useMemo(
    () =>
      s.hosts.filter(
        (h) =>
          (!filter || h.status === filter) &&
          (!q || `${h.hostname} ${h.ip} ${h.role} ${h.segment}`.toLowerCase().includes(q.toLowerCase()))
      ),
    [s.hosts, q, filter]
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const rows = filtered.slice(cur * PAGE, cur * PAGE + PAGE); // BOUNDED: never render the full fleet at once
  const drawerHost = s.hosts.find((h) => h.host_id === drawer);
  return (
    <div>
      <div className="fleet-bar">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(0);
          }}
          placeholder={t('search_hosts', lang)}
          width={260}
          label={t('search_hosts', lang)}
        />
        {['COMPROMISED', 'CONTAINED', 'SCANNING', 'PROTECTED'].map((f) => (
          <Chip
            key={f}
            on={filter === f}
            onClick={() => {
              setFilter(filter === f ? null : f);
              setPage(0);
            }}
            n={s.hosts.filter((h) => h.status === f).length}
          >
            {f}
          </Chip>
        ))}
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t3)' }}>
          FleetState: {s.fleet.total_hosts.toLocaleString()} hosts · {s.fleet.online_agents.toLocaleString()}{' '}
          online (aggregate, bounded)
        </span>
      </div>
      <Panel title={`${t('nav_fleet', lang)}`} sub={`${filtered.length} match · page ${cur + 1}/${pages}`}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Host</th>
              <th>IP</th>
              <th>Segment</th>
              <th>Role</th>
              <th>Status</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.host_id} onClick={() => setDrawer(h.host_id)} style={{ cursor: 'pointer' }}>
                <td className="mono">{h.hostname}</td>
                <td className="mono">{h.ip}</td>
                <td>{h.segment}</td>
                <td>{h.role}</td>
                <td>
                  <StatusPill status={h.status} />
                </td>
                <td>
                  <RiskCell v={h.risk} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pager">
          <Btn sm onClick={() => setPage(Math.max(0, cur - 1))} disabled={cur === 0}>
            Prev
          </Btn>
          <span className="mono" style={{ fontSize: 11 }}>
            {cur + 1} / {pages}
          </span>
          <Btn sm onClick={() => setPage(Math.min(pages - 1, cur + 1))} disabled={cur >= pages - 1}>
            Next
          </Btn>
        </div>
      </Panel>
      {drawerHost ? (
        <div className="drawer" role="dialog" aria-label={`Host ${drawerHost.hostname}`}>
          <div className="drawer-h">
            <b className="disp">{drawerHost.hostname}</b>
            <Btn sm onClick={() => setDrawer(null)}>
              <Glyph k="x" size={9} />
            </Btn>
          </div>
          <dl className="kv">
            <dt>Host ID</dt>
            <dd className="mono">{drawerHost.host_id}</dd>
            <dt>OS</dt>
            <dd>{drawerHost.os}</dd>
            <dt>IP</dt>
            <dd className="mono">{drawerHost.ip}</dd>
            <dt>Status</dt>
            <dd>
              <StatusPill status={drawerHost.status} />
            </dd>
            <dt>Criticality</dt>
            <dd>{drawerHost.criticality}</dd>
            <dt>Risk</dt>
            <dd>
              <RiskCell v={drawerHost.risk} />
            </dd>
            <dt>Last seen</dt>
            <dd className="mono">{drawerHost.last_seen}</dd>
          </dl>
        </div>
      ) : null}
    </div>
  );
}

export function System({ s, lang }: { s: DemoScenario; lang: Lang }) {
  return (
    <div className="sys-grid">
      <Panel title={t('system_health', lang)} right={<StatusPill status={s.health.overall} />}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Component</th>
              <th>Status</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {s.health.components.map((c) => (
              <tr key={c.name}>
                <td className="mono">{c.name}</td>
                <td>
                  <StatusPill status={c.status} />
                </td>
                <td style={{ color: 'var(--t2)' }}>{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="k-sub" style={{ marginTop: 10 }}>
          effective_autonomy: <b>{s.health.effective_autonomy}</b> — reflects the fail-safe override (drops
          toward MONITOR if a dependency is impaired).
        </div>
      </Panel>
      <Panel title={t('agent_coverage', lang)}>
        <div className="kpi-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <Kpi label="Enrolled" value={s.health.agent_coverage.enrolled.toLocaleString()} />
          <Kpi label="Online" value={s.health.agent_coverage.online.toLocaleString()} />
          <Kpi
            label="Offline"
            value={s.health.agent_coverage.offline}
            alert={s.health.agent_coverage.offline > 0}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="k-label">{t('decision_audit', lang)}</div>
          <ul className="feed" style={{ marginTop: 8 }}>
            {s.actionFeed.map((a, i) => (
              <li key={i} className="feed-row">
                <span className="mono feed-t">{a.at}</span>
                <span className="feed-detail">
                  {a.action_type} · {a.host_id ?? '—'} · {a.outcome}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  );
}

export function Approvals({ s, lang }: { s: DemoScenario; lang: Lang }) {
  const [state, setState] = useState<Record<string, 'pending' | 'approved' | 'overridden'>>({});
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Panel title={t('approval_queue', lang)} sub="HUMAN_GATED — dual control">
        {s.approvals.length === 0 ? <p style={{ color: 'var(--t2)' }}>No pending approvals.</p> : null}
        {s.approvals.map((a) => {
          const st = state[a.action_id] ?? 'pending';
          return (
            <div key={a.action_id} className="approval">
              <div className="approval-h">
                <span className="badge bd-high">
                  <Glyph k="diamond" size={8} />
                  {a.action_type}
                </span>
                <span className="mono">{a.host_id}</span>
                <Sev level="HIGH" />
                <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t3)' }}>
                  time-box → {a.rollback_deadline.slice(11, 19)} UTC
                </span>
              </div>
              <p className="approval-just">{a.justification}</p>
              <div className="approval-meta mono">
                signals: {a.signals} · confidence: {a.confidence} · mode: {a.autonomy_mode}
              </div>
              <div className="approval-note">{t('second_approver', lang)}</div>
              <div className="approval-actions">
                {st === 'pending' ? (
                  <>
                    <Btn
                      kind="primary"
                      sm
                      onClick={() => setState((p) => ({ ...p, [a.action_id]: 'approved' }))}
                    >
                      <Glyph k="check" size={8} /> {t('approve', lang)} (approver #2)
                    </Btn>
                    <Btn sm onClick={() => setState((p) => ({ ...p, [a.action_id]: 'overridden' }))}>
                      <Glyph k="x" size={8} /> {t('override', lang)}
                    </Btn>
                  </>
                ) : (
                  <>
                    <span className={`badge ${st === 'approved' ? 'bd-ok' : 'bd-low'}`}>
                      <Glyph k={st === 'approved' ? 'check' : 'x'} size={8} />
                      {st.toUpperCase()}
                    </span>
                    {st === 'approved' ? (
                      <Btn sm onClick={() => setState((p) => ({ ...p, [a.action_id]: 'pending' }))}>
                        <Glyph k="ring" size={8} /> {t('revert', lang)}
                      </Btn>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

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
