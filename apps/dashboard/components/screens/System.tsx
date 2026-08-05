'use client';
import { Fragment, useEffect, useState } from 'react';
import { type DemoScenario, ENGINE_ID, PRODUCT_NAME } from '../../lib/data';
import { type Lang, t, tf } from '../../lib/i18n';
import { CatatanTerekam } from '../CatatanTerekam';
import { Glyph, Panel, StatusPill } from '../ui';

/* Detection-engine metric tile (ported from the design's StatTile; inline styles mirror the source). */
function StatTile({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div style={{ padding: '4px 0' }}>
      <div
        className="mono"
        style={{ fontSize: 9.5, letterSpacing: '0.12em', color: 'var(--t3)', marginBottom: 5 }}
      >
        {k}
      </div>
      <div className="mono" style={{ fontSize: 19, fontWeight: 500, color: 'var(--t1)' }}>
        {v}
      </div>
      {sub ? (
        <div className="mono" style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

/* The autonomy dial — 4 positions, MONITOR_ONLY is the shipped default. Lives on System (its natural home).
   Radios are real <button>s (keyboard-operable: Tab + Enter/Space) with role=radio + aria-checked; the
   localized label is the accessible name, the machine token is decorative (aria-hidden). */
const DIAL_POSITIONS: { id: string; key: 'dial_monitor' | 'dial_alert' | 'dial_human' | 'dial_auto' }[] = [
  { id: 'MONITOR_ONLY', key: 'dial_monitor' },
  { id: 'ALERT_RECOMMEND', key: 'dial_alert' },
  { id: 'HUMAN_GATED', key: 'dial_human' },
  { id: 'FULL_AUTO', key: 'dial_auto' },
];

/** mm:ss left on an elevated dial. Recomputed on a 1s tick so the number on screen is the real one. */
function sisaWaktu(tenggat: string): string | null {
  const ms = new Date(tenggat).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Dial({
  value,
  onChange,
  lang,
  tenggat,
  bawaan,
}: {
  value: string;
  onChange: (v: string) => void;
  lang: Lang;
  tenggat: string | null;
  bawaan: string;
}) {
  const [sisa, setSisa] = useState<string | null>(tenggat ? sisaWaktu(tenggat) : null);
  useEffect(() => {
    if (!tenggat) {
      setSisa(null);
      return;
    }
    setSisa(sisaWaktu(tenggat));
    const id = setInterval(() => setSisa(sisaWaktu(tenggat)), 1000);
    return () => clearInterval(id);
  }, [tenggat]);

  return (
    <>
      <div
        role="radiogroup"
        aria-label={t('dial', lang)}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        {DIAL_POSITIONS.map((d) => {
          const on = value === d.id;
          return (
            <button
              key={d.id}
              type="button"
              // biome-ignore lint/a11y/useSemanticElements: <input type=radio> cannot carry this layout (icon + label + machine token, full-width targets). role=radio + aria-checked inside a role=radiogroup is the correct ARIA mapping, every position is a real focusable button, and Enter/Space selects it (WCAG 2.1.1).
              role="radio"
              aria-checked={on}
              onClick={() => onChange(d.id)}
              className={`btn ${on ? 'primary' : ''}`}
              style={{ flex: '1 1 160px', justifyContent: 'flex-start' }}
            >
              <Glyph k={on ? 'check' : 'ring'} size={10} />
              <span>{t(d.key, lang)}</span>
              <span
                className="mono"
                aria-hidden="true"
                style={{ fontSize: 9.5, opacity: 0.6, letterSpacing: '0.03em', marginLeft: 'auto' }}
              >
                {d.id}
              </span>
            </button>
          );
        })}
      </div>
      {/* The lapse, said out loud. Silent expiry was the defect; the expiry itself is the safety property. */}
      {sisa ? (
        <div
          style={{
            marginTop: 14,
            borderLeft: '2px solid var(--med)',
            paddingLeft: 12,
            fontSize: 11.5,
            lineHeight: 1.6,
            color: 'var(--t2)',
          }}
        >
          <div className="mono" style={{ color: 'var(--med)', letterSpacing: '0.04em' }}>
            {tf('dial_tenggat', lang, { mode: bawaan, sisa })}
          </div>
          <div style={{ color: 'var(--t3)', marginTop: 4 }}>{t('dial_tenggat_ket', lang)}</div>
        </div>
      ) : (
        <div
          className="mono"
          style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 14, letterSpacing: '0.04em' }}
        >
          {t('dial_istirahat', lang)}
        </div>
      )}
      <div
        className="mono"
        style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 6, letterSpacing: '0.04em' }}
      >
        {t('dial_gated_note', lang)}
      </div>
      <div
        className="mono"
        style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 6, letterSpacing: '0.04em' }}
      >
        {tf('effective_autonomy_note', lang, { mode: value })}
      </div>
    </>
  );
}

// version-bar colors, indexed to s.agents.versions order (newest → older) — mirrors the design palette.
const VER_COLORS = ['var(--acc)', 'var(--low)', 'var(--med)'];

export function System({
  s,
  lang,
  dial,
  tenggat,
  bawaan,
  setDial,
}: {
  s: DemoScenario;
  lang: Lang;
  dial: string;
  setDial: (v: string) => void;
  tenggat: string | null;
  bawaan: string;
}) {
  const e = s.engine;
  const a = s.agents;
  return (
    <>
      <div className="screen-title">
        <h1>{t('system_health', lang)}</h1>
        <span className="sub">{tf('system_sub', lang, { product: PRODUCT_NAME })}</span>
      </div>
      {/* This screen carried no honesty label at all, while its audit table sits under the words "every
          action logged, immutable" and lists isolations that never happened. The real, verifiable chain
          is on Live and History; this one is part of the recorded fiction and now says so. */}
      <CatatanTerekam lang={lang} />
      <div className="sys-grid">
        {/* Detection Engine */}
        <Panel title={t('panel_detection_engine', lang)} sub={e.model} right={<StatusPill status="online" />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <StatTile k={t('stat_detect_p50', lang)} v={e.p50} sub={tf('stat_p95', lang, { v: e.p95 })} />
            <StatTile k={t('stat_coverage', lang)} v={e.coverage} sub={e.coverageSub} />
            <StatTile k={t('stat_false_pos', lang)} v={e.falsePos} sub={e.falsePosSub} />
            <StatTile k={t('stat_files_lost', lang)} v={e.filesLost} sub={e.filesLostSub} />
          </div>
          {/* Without this caption the four tiles above read as production telemetry. They are not. */}
          <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--t3)', marginTop: 12 }}>
            {t('engine_measured_note', lang)}
          </div>
          <div
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 14, letterSpacing: '0.04em' }}
          >
            {tf('engine_meta', lang, { updated: e.updated, ver: s.policyVersion })}
          </div>
        </Panel>

        {/* Agent Coverage */}
        <Panel
          title={t('agent_coverage', lang)}
          sub={tf('coverage_sub', lang, {
            online: a.online.toLocaleString(),
            enrolled: a.enrolled.toLocaleString(),
          })}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--t3)' }}>
              {t('fleet_coverage', lang)}
            </span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--acc)' }}>
              {a.coveragePct}%
            </span>
          </div>
          <div className="progress">
            <div className="fill" style={{ width: `${a.coveragePct}%` }} />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '70px 1fr 44px',
              gap: '8px 12px',
              marginTop: 16,
              alignItems: 'center',
            }}
          >
            {a.versions.map((ver, i) => (
              <Fragment key={ver.ver}>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--t2)' }}>
                  {ver.ver}
                </span>
                <span className="progress" style={{ height: 5 }}>
                  <span
                    className="fill"
                    style={{ width: `${ver.pct}%`, background: VER_COLORS[i] ?? 'var(--low)' }}
                  />
                </span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--t3)', textAlign: 'right' }}>
                  {ver.pct}%
                </span>
              </Fragment>
            ))}
          </div>
          <div
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 14, letterSpacing: '0.04em' }}
          >
            {tf('coverage_offline_note', lang, {
              offline: a.offline,
              down: a.poweredDown,
              pending: a.pendingEnroll,
            })}
          </div>
        </Panel>

        {/* Autonomy Dial — product control, governs the action matrix below. Full-width. */}
        <Panel title={t('dial', lang)} sub={t('dial_positions', lang)} style={{ gridColumn: '1 / -1' }}>
          <Dial value={dial} onChange={setDial} lang={lang} tenggat={tenggat} bawaan={bawaan} />
        </Panel>

        {/* Autonomy Policy */}
        <Panel
          title={t('panel_autonomy_policy', lang)}
          sub={tf('policy_sub', lang, { product: PRODUCT_NAME })}
          bodyClass="flush"
        >
          <table className="tbl">
            <tbody>
              {s.policy.map((p) => (
                <tr key={p.action}>
                  <td style={{ color: 'var(--t1)', fontWeight: 500 }}>{p.action}</td>
                  <td>
                    <span className={`badge ${p.mode === 'FULL AUTO' ? 'bd-acc' : 'bd-med'}`}>
                      <Glyph k={p.mode === 'FULL AUTO' ? 'check' : 'ring'} size={8} />
                      {p.mode}
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: 10.5, color: 'var(--t3)' }}>
                    {p.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        {/* Integrations */}
        <Panel
          title={t('panel_integrations', lang)}
          sub={tf('integrations_sub', lang, { n: s.integrations.length })}
          bodyClass="flush"
        >
          <table className="tbl">
            <tbody>
              {s.integrations.map((it) => (
                <tr key={it.name}>
                  <td style={{ color: 'var(--t1)', fontWeight: 500 }}>{it.name}</td>
                  <td className="mono" style={{ fontSize: 10.5, color: 'var(--t3)' }}>
                    {it.kind.toUpperCase()}
                  </td>
                  <td>
                    <StatusPill status={it.status} />
                  </td>
                  <td className="mono" style={{ fontSize: 10.5, color: 'var(--t3)' }}>
                    {it.meta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        {/* Autonomous Decision Audit — full width */}
        <Panel
          title={t('decision_audit', lang)}
          sub={t('audit_sub', lang)}
          bodyClass="flush"
          style={{ gridColumn: '1 / -1' }}
        >
          <table className="tbl dense">
            <thead>
              <tr>
                <th>{t('col_time_utc', lang)}</th>
                <th>{t('col_action', lang)}</th>
                <th>{t('col_target', lang)}</th>
                <th>{t('col_decided_by', lang)}</th>
                <th>{t('col_confidence', lang)}</th>
                <th>{t('col_latency', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {s.audit.map((row) => {
                const auto = row.by === ENGINE_ID;
                return (
                  <tr key={row.t + row.target}>
                    <td className="mono">{row.t}</td>
                    <td style={{ color: 'var(--t1)' }}>{row.action}</td>
                    <td className="mono">{row.target}</td>
                    <td>
                      <span className={`badge ${auto ? 'bd-acc' : 'bd-mut'}`}>
                        <Glyph k={auto ? 'diamond' : 'circle'} size={7} />
                        {row.by}
                      </span>
                    </td>
                    <td className="mono">{row.conf}</td>
                    <td className="mono">{row.latency}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
