'use client';
import { useMemo, useState } from 'react';
import { type DemoHost, type DemoScenario, PRODUCT_NAME } from '../../lib/data';
import { type Lang, t, tf } from '../../lib/i18n';
import { Btn, Chip, Glyph, Panel, RiskCell, SearchBox, StatusPill } from '../ui';

// BOUNDED: never render the whole fleet at once (CLAUDE.md invariant #5 — bounded resource).
const PAGE = 12;
const STATUSES = ['all', 'compromised', 'contained', 'isolated', 'scanning', 'protected'] as const;
const AFFECTED = ['compromised', 'contained', 'isolated'];

function HostDrawer({
  host,
  s,
  lang,
  onClose,
}: { host: DemoHost; s: DemoScenario; lang: Lang; onClose: () => void }) {
  const [queued, setQueued] = useState<Record<string, boolean>>({});
  const affected = AFFECTED.includes(host.status);
  // ponytail: per-host agent-event history has no contract/data field — presentational demo content
  // derived from status + incident/policy data, mirroring the design's hardcoded drawer log.
  const events = affected
    ? [
        { t: '03:14:0x', e: `${PRODUCT_NAME} containment action executed` },
        { t: '03:13:xx', e: `Linked to ${s.incident.id} (${s.incident.family})` },
        { t: '02:00:00', e: 'VaultSync snapshot verified immutable' },
      ]
    : [
        {
          t: '03:15:02',
          e:
            host.status === 'scanning'
              ? `IOC sweep in progress — ${s.incident.id}`
              : 'Telemetry heartbeat nominal',
        },
        { t: '02:00:00', e: 'VaultSync snapshot verified immutable' },
        { t: '01:30:12', e: `Egress policy ${s.policyVersion} applied` },
      ];
  const act = (k: string) => setQueued((p) => ({ ...p, [k]: true }));
  return (
    <>
      {/* Backdrop is a real, labelled button so click-outside-to-close is keyboard-operable (WCAG 2.1.1). */}
      <button
        type="button"
        className="drawer-veil"
        aria-label={t('close', lang)}
        onClick={onClose}
        style={{ border: 'none', cursor: 'pointer' }}
      />
      <aside className="drawer" role="dialog" aria-label={tf('drawer_host', lang, { name: host.name })}>
        <div className="drawer-h">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="mono" style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)' }}>
              {host.name}
            </span>
            <StatusPill status={host.status} />
            <button
              type="button"
              className="icon-btn"
              style={{ marginLeft: 'auto' }}
              onClick={onClose}
              aria-label={t('close', lang)}
            >
              <Glyph k="x" size={10} />
            </button>
          </div>
          <div
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 6, letterSpacing: '0.05em' }}
          >
            {host.ip} · {host.seg.toUpperCase()} · AGENT v{host.ver}
          </div>
        </div>
        <div className="drawer-b">
          <div className="kv">
            <span className="k">{t('kv_os', lang)}</span>
            <span className="v">{host.os}</span>
            <span className="k">{t('col_segment', lang)}</span>
            <span className="v">{host.seg}</span>
            <span className="k">{t('col_ip_address', lang)}</span>
            <span className="v mono">{host.ip}</span>
            <span className="k">{t('col_agent', lang)}</span>
            <span className="v mono">
              v{host.ver} · POLICY {s.policyVersion}
            </span>
            <span className="k">{t('kv_last_seen', lang)}</span>
            <span className="v mono">{host.seen}</span>
            <span className="k">{t('kv_risk_score', lang)}</span>
            <span className="v">
              <RiskCell v={host.risk} />
            </span>
          </div>

          <div
            className="mono"
            style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--t3)', margin: '20px 0 8px' }}
          >
            {t('recent_agent_events', lang)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {events.map((ev) => (
              <div key={ev.t + ev.e} style={{ display: 'grid', gridTemplateColumns: '62px 1fr', gap: 10 }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--t3)', paddingTop: 1 }}>
                  {ev.t}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--t2)' }}>{ev.e}</span>
              </div>
            ))}
          </div>

          <div
            className="mono"
            style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--t3)', margin: '20px 0 8px' }}
          >
            {t('actions_label', lang)}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {affected ? (
              <Btn sm onClick={() => act('release')} disabled={queued.release}>
                {queued.release ? `✓ ${t('release_queued', lang)}` : t('release_isolation', lang)}
              </Btn>
            ) : (
              <Btn kind="danger" sm onClick={() => act('isolate')} disabled={queued.isolate}>
                {queued.isolate ? `✓ ${t('isolation_queued', lang)}` : t('isolate_host', lang)}
              </Btn>
            )}
            <Btn sm onClick={() => act('scan')} disabled={queued.scan}>
              {queued.scan ? `✓ ${t('scan_queued', lang)}` : t('run_ioc_scan', lang)}
            </Btn>
          </div>
          {affected ? (
            <div
              className="mono"
              style={{
                fontSize: 10,
                color: 'var(--t3)',
                marginTop: 14,
                lineHeight: 1.7,
                letterSpacing: '0.03em',
              }}
            >
              {t('linked_incident', lang)}: {s.incident.id}
              <br />
              {t('release_requires_signoff', lang)}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}

export function Fleet({ s, lang }: { s: DemoScenario; lang: Lang }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [seg, setSeg] = useState('all');
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<DemoHost | null>(null);

  const segs = useMemo(() => ['all', ...new Set(s.fleet.map((h) => h.seg))], [s.fleet]);
  const filtered = useMemo(
    () =>
      s.fleet
        .filter(
          (h) =>
            (f === 'all' || h.status === f) &&
            (seg === 'all' || h.seg === seg) &&
            (q === '' || h.name.includes(q.toLowerCase()) || h.ip.includes(q))
        )
        .sort((a, b) => b.risk - a.risk),
    [s.fleet, q, f, seg]
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const rows = filtered.slice(cur * PAGE, cur * PAGE + PAGE); // BOUNDED slice
  const reset = () => setPage(0);

  return (
    <div data-screen-label="Fleet & Hosts">
      <div className="screen-title">
        <h1>{t('nav_fleet', lang)}</h1>
        <span className="sub">
          {tf('fleet_subtitle', lang, {
            enrolled: s.agents.enrolled.toLocaleString(),
            online: s.agents.online.toLocaleString(),
          })}
        </span>
      </div>
      <Panel
        title={t('host_inventory', lang)}
        right={
          <>
            <div className="chips">
              {STATUSES.map((st) => (
                <Chip
                  key={st}
                  on={f === st}
                  onClick={() => {
                    setF(st);
                    reset();
                  }}
                  n={st === 'all' ? s.fleet.length : s.fleet.filter((h) => h.status === st).length}
                >
                  {st === 'all' ? t('filter_all', lang) : st.toUpperCase()}
                </Chip>
              ))}
            </div>
            <select
              value={seg}
              onChange={(e) => {
                setSeg(e.target.value);
                reset();
              }}
              aria-label={t('aria_segment_filter', lang)}
              className="mono"
              style={{
                background: 'var(--bg2)',
                border: '1px solid var(--line)',
                color: 'var(--t1)',
                borderRadius: 6,
                padding: '5px 8px',
                fontSize: 10.5,
                letterSpacing: '0.05em',
              }}
            >
              {segs.map((sg) => (
                <option key={sg} value={sg}>
                  {sg === 'all' ? t('all_segments', lang) : sg.toUpperCase()}
                </option>
              ))}
            </select>
            <SearchBox
              value={q}
              onChange={(v) => {
                setQ(v);
                reset();
              }}
              placeholder={t('search_host_ip', lang)}
              width={180}
              label={t('search_hosts', lang)}
            />
          </>
        }
        bodyClass="flush"
      >
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl dense">
            <thead>
              <tr>
                <th>{t('col_host', lang)}</th>
                <th>{t('col_ip_address', lang)}</th>
                <th>{t('col_segment', lang)}</th>
                <th>{t('kv_os', lang)}</th>
                <th>{t('col_agent', lang)}</th>
                <th>{t('col_risk', lang)}</th>
                <th>{t('kv_last_seen', lang)}</th>
                <th>{t('col_status', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                // biome-ignore lint/a11y/useSemanticElements: a clickable table row has no semantic HTML equivalent; role=button + tabIndex + onKeyDown make it keyboard-operable (WCAG 2.1.1)
                <tr
                  key={h.name}
                  role="button"
                  tabIndex={0}
                  aria-label={tf('drawer_host', lang, { name: h.name })}
                  className={sel?.name === h.name ? 'sel' : ''}
                  onClick={() => setSel(h)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSel(h);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="mono host">{h.name}</td>
                  <td className="mono">{h.ip}</td>
                  <td>{h.seg}</td>
                  <td>{h.os}</td>
                  <td className="mono">v{h.ver}</td>
                  <td>
                    <RiskCell v={h.risk} />
                  </td>
                  <td
                    className="mono"
                    style={{ color: h.seen.startsWith('ISOLATED') ? 'var(--med)' : undefined }}
                  >
                    {h.seen}
                  </td>
                  <td>
                    <StatusPill status={h.status} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-note">{t('no_hosts_match', lang)}</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="tbl-foot">
          <span>
            {tf('fleet_showing', lang, { n: rows.length, total: s.agents.enrolled.toLocaleString() })}
          </span>
          {pages > 1 ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Btn sm onClick={() => setPage(Math.max(0, cur - 1))} disabled={cur === 0}>
                {t('btn_prev', lang)}
              </Btn>
              <span className="mono">
                {cur + 1} / {pages}
              </span>
              <Btn sm onClick={() => setPage(Math.min(pages - 1, cur + 1))} disabled={cur >= pages - 1}>
                {t('btn_next', lang)}
              </Btn>
            </span>
          ) : null}
          <span>
            {tf('fleet_offline_note', lang, {
              offline: s.agents.offline,
              unenrolled: s.agents.unenrolledDetected,
            })}
          </span>
        </div>
      </Panel>
      {sel ? <HostDrawer host={sel} s={s} lang={lang} onClose={() => setSel(null)} /> : null}
    </div>
  );
}
