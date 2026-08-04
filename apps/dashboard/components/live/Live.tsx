'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PRODUCT_NAME } from '../../lib/data';
import { type Lang, type StringKey, t, tf } from '../../lib/i18n';
import type {
  ActionRecord,
  AutonomyMode,
  ChainVerificationResult,
  LatencyReport,
  ScenarioSummary,
  TamperDemoResult,
} from '../../lib/server/types';
import { Glyph, Panel } from '../ui';
import { type AliranView, type RunView, type SignalRow, useAliran } from './useAliran';

/**
 * The Live surface: the tab a judge can use to check the system WITHOUT taking our word for anything.
 *
 * Every number on this screen arrives from the SSE stream at /api/telemetri/aliran or from an API
 * response, and is printed as received. Where a value has not arrived, the screen prints DASH. Nothing is
 * interpolated, smoothed, rounded up into a rosier figure, or filled in from a previous run.
 */

const DASH = '-';
/** Visual separator between inline notes. Decorative, so it is hidden from assistive technology. */
const SEP = '\u00b7';

/* -------------------------------------------------------------------------- */
/* Small formatters. Each one returns DASH rather than inventing a value.      */
/* -------------------------------------------------------------------------- */

function ms(n: number | null | undefined): string {
  return n === null || n === undefined ? DASH : String(Math.round(n));
}

function num(n: number | null | undefined, digits = 2): string {
  return n === null || n === undefined ? DASH : n.toFixed(digits);
}

function clock(iso: string | null): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? DASH : d.toISOString().slice(11, 19);
}

/**
 * The C1 `emitted_at` and the C2 `decided_at` live on the SIMULATED timeline, which starts at midnight in
 * the oracle fixtures. Rendering them as a bare wall clock would read as "this happened at 00:00:00", so
 * every use of this helper is labelled with lv_sim_tl on screen.
 */
function simClock(iso: string | null): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? DASH : d.toISOString().slice(11, 23);
}

function shortHash(h: string | null | undefined, keep = 18): string {
  if (!h) return DASH;
  return h.length <= keep ? h : `${h.slice(0, keep)}...`;
}

function scenarioLabel(s: ScenarioSummary, lang: Lang): string {
  return lang === 'id' ? s.labelId : s.labelEn;
}

/* -------------------------------------------------------------------------- */
/* Chrome                                                                      */
/* -------------------------------------------------------------------------- */

function Step({ n, label }: { n: number; label: string }) {
  return (
    <div className="lv-step">
      <span className="lv-step-n" aria-hidden="true">
        {n}
      </span>
      <h2 className="lv-step-t">{label}</h2>
      <span className="lv-step-rule" />
    </div>
  );
}

/** Status and severity are never colour alone: every badge here is glyph + text label + colour. */
function Tag({
  kind,
  glyph,
  children,
}: {
  kind: 'crit' | 'high' | 'med' | 'low' | 'ok' | 'acc' | 'mut';
  glyph: 'circle' | 'ring' | 'tri' | 'diamond' | 'square' | 'check' | 'x' | 'arc';
  children: React.ReactNode;
}) {
  return (
    <span className={`badge bd-${kind}`}>
      <Glyph k={glyph} size={8} />
      {children}
    </span>
  );
}

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** A verbatim quotation of a server string. The label says where it came from. */
function Quote({ k, children, lang }: { k: string; children: string; lang?: Lang }) {
  return (
    <p className="lv-quote" lang={lang}>
      <span className="lv-quote-k">{k}</span>
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* 1. Live baseline                                                            */
/* -------------------------------------------------------------------------- */

const CHART_W = 300;
const CHART_H = 84;

function RateChart({ rate, lang }: { rate: number[]; lang: Lang }) {
  const current = rate.length ? rate[rate.length - 1] : null;
  if (rate.length < 2) {
    return (
      <div className="lv-chart-empty">
        <span className="lv-note">{DASH}</span>
      </div>
    );
  }
  const max = Math.max(...rate, 0.001);
  const pts = rate
    .map((v, i) => {
      const x = (i / (rate.length - 1)) * CHART_W;
      const y = CHART_H - 8 - (v / max) * (CHART_H - 18);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      className="lv-chart"
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${t('lv_a11y_rate_chart', lang)}, ${num(current)} ${t('lv_rate_unit', lang)}`}
    >
      <title>{t('lv_a11y_rate_chart', lang)}</title>
      <line className="lv-chart-base" x1="0" y1={CHART_H - 8} x2={CHART_W} y2={CHART_H - 8} />
      <polyline className="lv-chart-line" points={pts} />
    </svg>
  );
}

/**
 * What the stream says is being observed. The honesty note (`noteId`, currently only on the backup
 * scenario) is rendered as a first-class block: API.md requires it shown, it is not decoration.
 */
function ScenarioCard({ run, lang }: { run: RunView; lang: Lang }) {
  const sc = run.scenario;
  return (
    <Panel
      title={t('lv_scenario', lang)}
      sub={sc.id}
      right={
        <Tag kind={sc.group === 'serangan' ? 'crit' : 'ok'} glyph={sc.group === 'serangan' ? 'tri' : 'check'}>
          {t(sc.group === 'serangan' ? 'lv_group_attack' : 'lv_group_benign', lang)}
        </Tag>
      }
    >
      <div className="lv-stack">
        <h3 className="lv-cmp-title">{scenarioLabel(sc, lang)}</h3>
        <dl className="lv-kv">
          <KV k={t('lv_host', lang)}>
            <span className="lv-hash">{sc.host}</span>
          </KV>
          <KV k={t('lv_segment', lang)}>{sc.segment}</KV>
          <KV k={t('lv_technique', lang)}>{sc.technique ?? DASH}</KV>
          {sc.family ? (
            <KV k={t('lv_family', lang)}>
              <span className="lv-hash">
                {sc.family} {DASH} {sc.mode ?? DASH} {DASH} {sc.filesPerSecond ?? DASH} files/s
                {sc.blockBytes === null ? '' : ` ${DASH} ${sc.blockBytes} B blocks`}
              </span>
            </KV>
          ) : null}
          {sc.workload ? (
            <KV k={t('lv_workload', lang)}>
              <span className="lv-hash">{sc.workload}</span>
            </KV>
          ) : null}
          <KV k={t('lv_run_dial', lang)}>{run.dialAtStart}</KV>
        </dl>
        <p className="lv-note-lg" lang="id">
          {sc.descId}
        </p>
        {sc.noteId ? (
          <div className="lv-down">
            <div className="lv-row">
              <Tag kind="med" glyph="tri">
                {t('lv_note_honest', lang)}
              </Tag>
            </div>
            <p className="lv-note-lg" lang="id">
              {sc.noteId}
            </p>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function Baseline({ v, lang, sinceS }: { v: AliranView; lang: Lang; sinceS: number | null }) {
  const running = v.run !== null && v.run.selesai === null;
  const stateKey: StringKey =
    v.state === 'langsung'
      ? 'lv_state_live'
      : v.state === 'menyambung-ulang'
        ? 'lv_state_retry'
        : v.state === 'tak-tersedia'
          ? 'lv_state_down'
          : 'lv_state_connecting';
  const rate = v.rate.length ? v.rate[v.rate.length - 1] : null;
  return (
    <Panel
      title={t('lv_stream', lang)}
      sub={t('lv_rate_note', lang)}
      right={
        v.state === 'langsung' ? (
          <Tag kind="ok" glyph="circle">
            {t(stateKey, lang)}
          </Tag>
        ) : v.state === 'tak-tersedia' ? (
          <Tag kind="crit" glyph="x">
            {t(stateKey, lang)}
          </Tag>
        ) : (
          <Tag kind="med" glyph="arc">
            {t(stateKey, lang)}
          </Tag>
        )
      }
    >
      <div className="lv-strip">
        <div>
          <div className="lv-strip-k">
            <Glyph k="circle" size={6} color="var(--acc)" className="lv-beat-dot" />
            {t('lv_beat', lang)}
          </div>
          <div className="lv-strip-v">{v.beat ? `#${v.beat.seq}` : DASH}</div>
          <div className="lv-strip-s">{t('lv_beat_note', lang)}</div>
        </div>
        <div>
          <div className="lv-strip-k">{t('lv_clock', lang)}</div>
          <div className="lv-strip-v">{clock(v.lastAtIso)}</div>
          <div className="lv-strip-s">{sinceS === null ? DASH : tf('lv_last_seen', lang, { n: sinceS })}</div>
        </div>
        <div>
          <div className="lv-strip-k">{t('lv_rate', lang)}</div>
          <div className="lv-strip-v">
            {num(rate)}
            <span className="lv-unit"> {t('lv_rate_unit', lang)}</span>
          </div>
          <div className="lv-strip-s">{running ? t('lv_running', lang) : t('lv_idle', lang)}</div>
        </div>
        <div>
          <div className="lv-strip-k">{t('lv_events_in', lang)}</div>
          <div className="lv-strip-v">{v.run?.lastTick ? v.run.lastTick.counts.eventsIngested : DASH}</div>
          <div className="lv-strip-s">
            {v.run ? tf('lv_of_total', lang, { n: v.run.totalEvents }) : t('lv_idle_note', lang)}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <RateChart rate={v.rate} lang={lang} />
      </div>
      {!running ? (
        <p className="lv-note" style={{ marginTop: 8 }}>
          {t('lv_idle_note', lang)}
        </p>
      ) : null}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Signals with thresholds, and the fusion rule                             */
/* -------------------------------------------------------------------------- */

function SignalBar({ row, lang }: { row: SignalRow; lang: Lang }) {
  const pct = row.score === null ? 0 : Math.max(0, Math.min(1, row.score)) * 100;
  const markPct = row.minFired === null ? null : Math.max(0, Math.min(1, row.minFired)) * 100;
  // The declared class from the contract, and separately whether the stream has confirmed it.
  const shown = row.declared ?? row.klass;
  const classTag =
    shown === 'diskriminatif' ? (
      <Tag kind="acc" glyph="diamond">
        {t('lv_sig_disc', lang)}
      </Tag>
    ) : shown === 'konteks' ? (
      <Tag kind="mut" glyph="square">
        {t('lv_sig_ctx', lang)}
      </Tag>
    ) : null;
  const proofTag =
    row.klass === null ? (
      <Tag kind="low" glyph="ring">
        {t('lv_sig_unproven', lang)}
      </Tag>
    ) : row.declared !== null && row.klass !== row.declared ? (
      <Tag kind="crit" glyph="x">
        {t('lv_sig_conflict', lang)}
      </Tag>
    ) : (
      <Tag kind="ok" glyph="check">
        {t('lv_sig_proven', lang)}
      </Tag>
    );
  return (
    <div className="lv-sig">
      <div className="lv-sig-name">{row.signalType}</div>
      <div
        className="lv-sig-track"
        role="img"
        aria-label={tf('lv_a11y_sig_bar', lang, {
          name: row.signalType,
          score: num(row.score),
          mark: num(row.minFired),
        })}
      >
        <span className={`lv-sig-fill${row.fired ? ' on' : ''}`} style={{ width: `${pct}%` }} />
        {markPct !== null ? <span className="lv-sig-mark" style={{ left: `${markPct}%` }} /> : null}
      </div>
      <div className="lv-sig-score">{num(row.score)}</div>
      <div className="lv-sig-meta">
        {row.fired ? (
          <Tag kind="crit" glyph="tri">
            {t('lv_sig_fired', lang)}
          </Tag>
        ) : (
          <Tag kind="mut" glyph="circle">
            {t('lv_sig_quiet', lang)}
          </Tag>
        )}
        {classTag}
        {proofTag}
        <span>
          {row.minFired === null
            ? t('lv_sig_never', lang)
            : `${t('lv_sig_mark', lang)}: ${tf('lv_sig_bracket', lang, {
                min: num(row.minFired),
                max: num(row.maxQuiet),
              })}`}
        </span>
        {row.detail ? <span>{row.detail}</span> : null}
        {row.at ? (
          <span>
            {simClock(row.at)} {t('lv_sim_tl', lang)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The rule, in full, in both languages, plus the threshold AS THE STREAM EVIDENCES IT.
 *
 * The rule sentence deliberately carries no number: the stream can only bound the threshold, and printing
 * a bound inside the sentence would state a requirement stronger than the evidence supports. The bound is
 * printed underneath, labelled `exactly` when the stream pins it and `at most` when it does not.
 */
function thresholdText(minCorr: number | null, pinnedNow: boolean, lang: Lang): string {
  if (minCorr === null) return t('lv_fusion_unknown', lang);
  if (pinnedNow) return tf('lv_thr_exact', lang, { n: minCorr, below: minCorr - 1 });
  return tf('lv_thr_atmost', lang, { n: minCorr });
}

function thresholdShort(minCorr: number | null, pinnedNow: boolean, lang: Lang): string {
  if (minCorr === null) return DASH;
  return tf(pinnedNow ? 'lv_thr_short_exact' : 'lv_thr_short_atmost', lang, { n: minCorr });
}

function FusionRule({
  minCorr,
  pinnedNow,
  lang,
}: { minCorr: number | null; pinnedNow: boolean; lang: Lang }) {
  return (
    <div className="lv-stack">
      <p className="lv-note-lg" lang="id">
        <strong>ID</strong> {t('lv_fusion_rule', 'id')}
      </p>
      <p className="lv-note-lg" lang="en">
        <strong>EN</strong> {t('lv_fusion_rule', 'en')}
      </p>
      <dl className="lv-kv">
        <KV k={t('lv_thr_head', lang)}>{thresholdText(minCorr, pinnedNow, lang)}</KV>
      </dl>
      <p className="lv-note">{t('lv_sig_class_note', lang)}</p>
    </div>
  );
}

function Signals({ v, lang }: { v: AliranView; lang: Lang }) {
  return (
    <div className="lv-wide">
      <Panel
        title={t('lv_signals', lang)}
        sub={tf('lv_signals_sub', lang, { n: v.signals.length })}
        right={
          v.run?.lastTick ? (
            <Tag kind={v.run.lastTick.fastPath ? 'crit' : 'mut'} glyph="diamond">
              {tf('lv_count_vs_min', lang, {
                n: v.run.lastTick.corroboratingCount,
                min: thresholdShort(v.observedMinCorroboration, v.corroborationPinned, lang),
              })}
            </Tag>
          ) : null
        }
      >
        {v.signals.length === 0 ? (
          <p className="lv-note-lg">{t('lv_signals_empty', lang)}</p>
        ) : (
          v.signals.map((row) => <SignalBar key={row.signalType} row={row} lang={lang} />)
        )}
      </Panel>
      <Panel title={t('lv_fusion', lang)}>
        <FusionRule minCorr={v.observedMinCorroboration} pinnedNow={v.corroborationPinned} lang={lang} />
      </Panel>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Decision provenance, and the refusal                                     */
/* -------------------------------------------------------------------------- */

function Provenance({
  run,
  minCorr,
  pinnedNow,
  lang,
}: { run: RunView; minCorr: number | null; pinnedNow: boolean; lang: Lang }) {
  const p = run.putusan;
  if (!p) {
    return <p className="lv-note-lg">{t('lv_no_verdict', lang)}</p>;
  }
  const fired = p.verdict.signals.filter((s) => s.fired);
  const auditHash = run.audits.length ? run.audits[0].record.record_hash : null;
  const headline = fired.map((s) => `${s.signal_type}${s.detail ? ` (${s.detail})` : ''}`).join(', ');
  return (
    <div className="lv-why">
      <p className="lv-why-head">{headline || t('lv_none_fired', lang)}</p>
      <div className="lv-row">
        <Tag kind="crit" glyph="tri">
          {p.verdict.verdict}
        </Tag>
        <Tag kind="high" glyph="diamond">
          {p.verdict.recommended_action}
        </Tag>
        <Tag kind={p.verdict.fast_path ? 'crit' : 'mut'} glyph={p.verdict.fast_path ? 'tri' : 'square'}>
          {p.verdict.fast_path ? t('lv_fast_yes', lang) : t('lv_fast_no', lang)}
        </Tag>
      </div>
      <dl className="lv-kv">
        <KV k={t('lv_corroborated', lang)}>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {fired.map((s) => (
              <li key={s.signal_type} className="lv-hash">
                {s.signal_type} {DASH} {t('lv_raw', lang)} {num(s.score)}
                {s.detail ? ` ${DASH} ${s.detail}` : ''}
              </li>
            ))}
          </ul>
        </KV>
        <KV k={t('lv_rule_that_fired', lang)}>
          {p.verdict.fast_path ? t('lv_fast_yes', lang) : t('lv_fast_no', lang)}
        </KV>
        <KV k={t('lv_thr_head', lang)}>
          {tf('lv_count_vs_min', lang, {
            n: p.verdict.corroborating_count,
            min: thresholdShort(minCorr, pinnedNow, lang),
          })}
        </KV>
        <KV k={t('lv_decided_at', lang)}>
          <span className="lv-hash">
            {p.verdict.decided_at} {DASH} {t('lv_sim_tl', lang)}
          </span>
        </KV>
        <KV k={t('lv_confidence_label', lang)}>{num(p.verdict.confidence)}</KV>
        <KV k={t('lv_verdict_id', lang)}>
          <span className="lv-hash">{p.verdict.verdict_id}</span>
        </KV>
        <KV k={t('lv_audit_hash', lang)}>
          <span className="lv-hash">{auditHash ?? DASH}</span>
        </KV>
      </dl>
    </div>
  );
}

/**
 * Two outcomes reach this panel and they are not the same thing.
 *
 * REFUSED: the engine declined to isolate, and that is the end of it. A green check is correct.
 * PROPOSED: the dial is at HUMAN_GATED, so a destructive verdict became a proposal awaiting a second
 * distinct approver. Rendering that as a refusal put a green check under the words "ISOLATION REFUSED"
 * while the quoted containment reason directly beneath it read "requires a second distinct approver".
 * The header denied its own body, on the one invariant this product is built around.
 */
function Refusal({ run, lang, diusulkan }: { run: RunView; lang: Lang; diusulkan: boolean }) {
  const engineReason = run.lastTick?.suppressionReason ?? null;
  const decision = run.kontainmen?.decision ?? null;
  const outcomeReason = run.kontainmen?.outcomeReason ?? null;
  const firedNow = run.lastTick ? run.lastTick.signals.filter((s) => s.fired) : [];
  return (
    <div className="lv-refuse">
      <h3 className="lv-refuse-head">
        <Glyph k={diusulkan ? 'tri' : 'check'} size={16} color={diusulkan ? 'var(--med)' : 'var(--ok)'} />
        {t(diusulkan ? 'lv_tunggu_head' : 'lv_refused', lang)}
      </h3>
      <p className="lv-note-lg">{t(diusulkan ? 'lv_tunggu_lead' : 'lv_refusal_lead', lang)}</p>
      {engineReason ? <Quote k={t('lv_engine_reason', lang)}>{engineReason}</Quote> : null}
      {decision ? (
        <Quote k={t('lv_containment_reason', lang)}>{decision.reason}</Quote>
      ) : (
        <Quote k={t('lv_engine_reason', lang)}>{t('lv_no_disc', lang)}</Quote>
      )}
      {outcomeReason ? <Quote k={t('lv_containment_reason', lang)}>{outcomeReason}</Quote> : null}
      {run.scenario.expectedNonIsolationReasonId ? (
        <Quote k={t('lv_catalogue_reason', lang)} lang="id">
          {run.scenario.expectedNonIsolationReasonId}
        </Quote>
      ) : null}
      <dl className="lv-kv">
        <KV k={t('lv_fired_here', lang)}>
          {firedNow.length === 0 ? t('lv_none_fired', lang) : firedNow.map((s) => s.signal_type).join(', ')}
        </KV>
        <KV k={t('lv_run_disposition', lang)}>
          {decision ? (
            <Tag kind="ok" glyph="check">
              {decision.disposition}
            </Tag>
          ) : (
            DASH
          )}
        </KV>
        <KV k={t('lv_run_command', lang)}>
          <Tag kind="ok" glyph="x">
            {t('lv_cmd_none', lang)}
          </Tag>
        </KV>
      </dl>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Agent action log + latency                                               */
/* -------------------------------------------------------------------------- */

function ActionLog({ run, lang }: { run: RunView | null; lang: Lang }) {
  const k = run?.kontainmen ?? null;
  const records = run?.audits ?? [];
  if (!run || (records.length === 0 && !k)) {
    return <p className="lv-note-lg">{t('lv_actions_empty', lang)}</p>;
  }
  return (
    <div className="lv-log">
      {records.map((a) => (
        <div className="lv-log-item" key={a.record.action_id}>
          <span className="lv-strip-k" style={{ margin: 0 }}>
            <Glyph k="square" size={9} color="var(--acc)" />
          </span>
          <div>
            <div className="lv-log-t">
              {a.record.action_type} {DASH} {a.record.outcome} {DASH} {a.record.autonomy_mode}
            </div>
            <div className="lv-log-m">
              chain_seq {a.record.chain_seq} {DASH} record_hash {shortHash(a.record.record_hash)} {DASH}{' '}
              {clock(a.record.occurred_at)}
            </div>
            {a.record.justification.signals_summary ? (
              <div className="lv-log-m">{a.record.justification.signals_summary}</div>
            ) : null}
          </div>
        </div>
      ))}
      {k ? (
        <div className="lv-log-item">
          <span className="lv-strip-k" style={{ margin: 0 }}>
            <Glyph k={k.command ? 'tri' : 'x'} size={9} color={k.command ? 'var(--crit)' : 'var(--ok)'} />
          </span>
          <div>
            <div className="lv-log-t">
              {k.command ? (
                <>
                  {t('lv_cmd_issued', lang)} {DASH} {k.command.command_type} {DASH} {k.command.target_host_id}
                </>
              ) : (
                <>{t('lv_cmd_none', lang)}</>
              )}
            </div>
            <div className="lv-log-m">
              {k.decision.disposition} {DASH} {k.decision.reason}
            </div>
            {k.command ? (
              <div className="lv-log-m">
                action_record_id {k.command.action_record_id} {DASH} rollback_deadline{' '}
                {k.command.rollback_deadline ?? DASH}
              </div>
            ) : null}
            {k.outcomeReason ? <div className="lv-log-m">{k.outcomeReason}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const LAT_KEYS = [
  { field: 'detection_wall_ms', label: 'lv_lat_wall', measured: true },
  { field: 'detection_timeline_ms', label: 'lv_lat_timeline', measured: false },
  { field: 'containment_wall_ms', label: 'lv_lat_contain', measured: true },
  { field: 'paced_out_ms', label: 'lv_lat_paced', measured: true },
] as const;

function Latency({ report, lang }: { report: LatencyReport | null; lang: Lang }) {
  return (
    <div className="lv-stack">
      <div className="lv-grid3">
        {LAT_KEYS.map((row) => {
          const value = report ? report[row.field] : null;
          const note = report ? report.labels[row.field][lang] : null;
          return (
            <div className="lv-lat" key={row.field}>
              <div className="lv-lat-k">{t(row.label, lang)}</div>
              <div className="lv-lat-v">
                {ms(value)}
                <span className="lv-unit"> ms</span>
              </div>
              {row.measured ? (
                <Tag kind="mut" glyph="check">
                  {t('lv_lat_measured', lang)}
                </Tag>
              ) : (
                <Tag kind="med" glyph="tri">
                  {t('lv_lat_simulated', lang)}
                </Tag>
              )}
              <p className="lv-lat-note">{note ?? DASH}</p>
            </div>
          );
        })}
      </div>
      <p className="lv-note">{t('lv_dash_note', lang)}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Back to safe, and the two-run comparison                                 */
/* -------------------------------------------------------------------------- */

function RunColumn({ run, lang }: { run: RunView; lang: Lang }) {
  const s = run.selesai;
  const acted = s?.containmentExecuted === true;
  return (
    <div className={`lv-cmp-col ${acted ? 'lv-acted' : 'lv-held'}`}>
      <h3 className="lv-cmp-title">{scenarioLabel(run.scenario, lang)}</h3>
      <div className="lv-row">
        <Tag kind={run.dialAtStart === 'FULL_AUTO' ? 'high' : 'ok'} glyph="diamond">
          {t('lv_run_dial', lang)}: {run.dialAtStart}
        </Tag>
        {acted ? (
          <Tag kind="crit" glyph="tri">
            {t('lv_cmd_issued', lang)}
          </Tag>
        ) : (
          <Tag kind="ok" glyph="check">
            {t('lv_cmd_none', lang)}
          </Tag>
        )}
      </div>
      <dl className="lv-kv">
        <KV k={t('lv_run_verdict', lang)}>{s ? s.finalVerdict : DASH}</KV>
        <KV k={t('lv_run_disposition', lang)}>{s?.disposition ?? DASH}</KV>
        <KV k={t('lv_run_command', lang)}>
          <span className="lv-hash">{run.kontainmen?.command?.command_id ?? DASH}</span>
        </KV>
        <KV k={t('lv_chain_len', lang)}>{s ? s.auditChainLength : DASH}</KV>
        <KV k={t('lv_audit_hash', lang)}>
          <span className="lv-hash">{shortHash(s?.auditHeadHash ?? null)}</span>
        </KV>
        <KV k={t('lv_lat_wall', lang)}>{ms(s?.latency.detection_wall_ms)} ms</KV>
      </dl>
      {run.kontainmen ? (
        <Quote k={t('lv_containment_reason', lang)}>{run.kontainmen.decision.reason}</Quote>
      ) : null}
    </div>
  );
}

function Compare({ history, lang }: { history: RunView[]; lang: Lang }) {
  if (history.length === 0) return <p className="lv-note-lg">{t('lv_compare_empty', lang)}</p>;
  return (
    <div className="lv-cmp">
      {history.slice(0, 2).map((r) => (
        <RunColumn key={r.runId} run={r} lang={lang} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The dial and the run controls                                               */
/* -------------------------------------------------------------------------- */

const DIAL_POSITIONS: { id: AutonomyMode; key: StringKey }[] = [
  { id: 'MONITOR_ONLY', key: 'dial_monitor' },
  { id: 'ALERT_RECOMMEND', key: 'dial_alert' },
  { id: 'HUMAN_GATED', key: 'dial_human' },
  { id: 'FULL_AUTO', key: 'dial_auto' },
];

function DialControl({
  position,
  lang,
  pending,
  message,
  onSet,
}: {
  position: AutonomyMode | null;
  lang: Lang;
  pending: boolean;
  message: string | null;
  onSet: (p: AutonomyMode) => void;
}) {
  return (
    <div className="lv-stack">
      {/* Native radios in a fieldset: arrow-key navigation and the checked state come from the
          platform, so there is no ARIA radio group to keep in sync and nothing to get wrong. */}
      <fieldset className="lv-dialset">
        <legend className="lv-sr">{t('lv_dial', lang)}</legend>
        <div className="lv-dial">
          {DIAL_POSITIONS.map((d) => {
            const on = position === d.id;
            return (
              <label className="lv-dialbtn" key={d.id}>
                <input
                  className="lv-dial-in"
                  type="radio"
                  name="lv-dial"
                  value={d.id}
                  checked={on}
                  disabled={pending}
                  onChange={() => onSet(d.id)}
                />
                <Glyph k={on ? 'check' : 'ring'} size={11} />
                <span className="lv-dialbtn-b">
                  <span className="lv-dialbtn-l">{t(d.key, lang)}</span>
                  <span className="lv-dialbtn-m">{d.id}</span>
                  {d.id === 'MONITOR_ONLY' ? (
                    <Tag kind="ok" glyph="check">
                      {t('lv_dial_default', lang)}
                    </Tag>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <p className="lv-note">{t('lv_dial_note', lang)}</p>
      {pending ? <p className="lv-note">{t('lv_dial_pending', lang)}</p> : null}
      {message ? (
        <Quote k={t('lv_dial', lang)} lang="id">
          {message}
        </Quote>
      ) : null}
    </div>
  );
}

function RunControls({
  catalogue,
  locked,
  busy,
  message,
  lang,
  onRun,
}: {
  catalogue: ScenarioSummary[];
  locked: boolean;
  busy: boolean;
  message: string | null;
  lang: Lang;
  onRun: (id: string) => void;
}) {
  if (locked) return <p className="lv-note-lg">{t('lv_run_locked', lang)}</p>;
  const groups: { key: StringKey; rows: ScenarioSummary[] }[] = [
    { key: 'lv_group_attack', rows: catalogue.filter((c) => c.group === 'serangan') },
    { key: 'lv_group_benign', rows: catalogue.filter((c) => c.group === 'sah') },
  ];
  return (
    <div className="lv-stack">
      {groups.map((g) => (
        <div key={g.key} className="lv-stack">
          <div className="lv-strip-k">{t(g.key, lang)}</div>
          <div className="lv-runs">
            {g.rows.map((c) => (
              <button
                key={c.id}
                type="button"
                className="lv-runbtn"
                disabled={busy}
                onClick={() => onRun(c.id)}
              >
                <span className="lv-runbtn-l">{scenarioLabel(c, lang)}</span>
                <span className="lv-runbtn-s">
                  {c.host} {DASH} {c.segment}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {busy ? <p className="lv-note">{t('lv_busy', lang)}</p> : null}
      {message ? (
        <Quote k={t('lv_run_panel', lang)} lang="id">
          {message}
        </Quote>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The audit sub-tab                                                           */
/* -------------------------------------------------------------------------- */

function ChainVerdict({ r, lang }: { r: ChainVerificationResult; lang: Lang }) {
  // An empty chain verifies as valid (API.md). Saying INTACT over nothing would be a claim, not a result.
  if (r.count === 0) {
    return (
      <div className="lv-row">
        <Tag kind="mut" glyph="ring">
          {t('lv_chain_zero', lang)}
        </Tag>
      </div>
    );
  }
  return (
    <div className="lv-row">
      {r.valid ? (
        <Tag kind="ok" glyph="check">
          {t('lv_chain_ok', lang)}
        </Tag>
      ) : (
        <Tag kind="crit" glyph="x">
          {t('lv_chain_broken', lang)}
        </Tag>
      )}
      <span className="lv-note">{tf('lv_verify_result', lang, { n: r.count })}</span>
      {r.brokenAt !== null ? (
        <span className="lv-note">
          <span aria-hidden="true">{SEP}</span> {tf('lv_broken_at', lang, { n: r.brokenAt })}
        </span>
      ) : null}
      {r.reason ? (
        <span className="lv-note">
          <span aria-hidden="true">{SEP}</span> {r.reason}
        </span>
      ) : null}
    </div>
  );
}

function AuditPanel({ chain, lang }: { chain: ActionRecord[]; lang: Lang }) {
  const [verify, setVerify] = useState<ChainVerificationResult | null>(null);
  const [tamper, setTamper] = useState<TamperDemoResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const call = useCallback(async (path: string, apply: (data: unknown) => void) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(path, { method: 'POST' });
      apply(await res.json());
    } catch {
      setErr('network');
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="lv-stack">
      <Panel
        title={t('lv_chain', lang)}
        sub={tf('lv_chain_sub', lang, { n: chain.length })}
        right={
          <span className="lv-row">
            <button
              type="button"
              className="btn sm"
              disabled={busy}
              onClick={() =>
                call('/api/audit/verifikasi', (d) => {
                  setTamper(null);
                  setVerify(d as ChainVerificationResult);
                })
              }
            >
              <Glyph k="check" size={9} />
              {busy ? t('lv_working', lang) : t('lv_verify', lang)}
            </button>
            <button
              type="button"
              className="btn sm danger"
              disabled={busy}
              onClick={() =>
                call('/api/audit/rusak', (d) => {
                  setVerify(null);
                  setTamper(d as TamperDemoResult);
                })
              }
            >
              <Glyph k="x" size={9} />
              {busy ? t('lv_working', lang) : t('lv_tamper', lang)}
            </button>
          </span>
        }
      >
        <div className="lv-stack">
          {err ? (
            <Tag kind="crit" glyph="x">
              {t('lv_err_request', lang)}
            </Tag>
          ) : null}
          {verify ? <ChainVerdict r={verify} lang={lang} /> : null}
          {tamper ? (
            <div className="lv-stack">
              <div className="lv-row">
                <span className="lv-strip-k" style={{ margin: 0 }}>
                  {t('lv_before', lang)}
                </span>
                <ChainVerdict r={tamper.before} lang={lang} />
              </div>
              <div className="lv-row">
                <span className="lv-strip-k" style={{ margin: 0 }}>
                  {t('lv_after', lang)}
                </span>
                <ChainVerdict r={tamper.after} lang={lang} />
              </div>
              <dl className="lv-kv">
                <KV k={t('lv_mutated_field', lang)}>
                  {tamper.mutatedField} {DASH} chain_seq {tamper.mutatedChainSeq ?? DASH}
                </KV>
                <KV k={t('lv_expected_hash', lang)}>
                  <span className="lv-hash">{tamper.link?.expected_record_hash ?? DASH}</span>
                </KV>
                <KV k={t('lv_stored_hash', lang)}>
                  <span className="lv-hash">{tamper.link?.stored_record_hash ?? DASH}</span>
                </KV>
                <KV k={t('lv_next_prev', lang)}>
                  <span className="lv-hash">{tamper.link?.next_stored_prev_hash ?? DASH}</span>
                </KV>
              </dl>
              <p className="lv-note">{t('lv_tamper_note', lang)}</p>
            </div>
          ) : null}
          {chain.length === 0 ? (
            <p className="lv-note-lg">{t('lv_chain_empty', lang)}</p>
          ) : (
            <div className="lv-scroll">
              <table className="tbl dense">
                <thead>
                  <tr>
                    <th>{t('lv_col_seq', lang)}</th>
                    <th>{t('col_action', lang)}</th>
                    <th>{t('lv_col_outcome', lang)}</th>
                    <th>{t('lv_col_mode', lang)}</th>
                    <th>{t('lv_col_approver', lang)}</th>
                    <th>{t('lv_col_prev', lang)}</th>
                    <th>{t('lv_col_hash', lang)}</th>
                  </tr>
                </thead>
                <tbody>
                  {chain.map((r) => {
                    const broken =
                      tamper !== null &&
                      tamper.after.brokenAt !== null &&
                      r.chain_seq === tamper.mutatedChainSeq;
                    return (
                      <tr key={r.action_id} className={broken ? 'lv-broken-row' : undefined}>
                        <td className="mono">
                          {broken ? (
                            <span className="lv-row">
                              {r.chain_seq}
                              <Tag kind="crit" glyph="x">
                                {t('lv_broken_short', lang)}
                              </Tag>
                            </span>
                          ) : (
                            r.chain_seq
                          )}
                        </td>
                        <td style={{ color: 'var(--t1)' }}>{r.action_type}</td>
                        <td className="mono">{r.outcome}</td>
                        <td className="mono">{r.autonomy_mode}</td>
                        <td className="mono">{r.approver?.actor_id ?? t('lv_none', lang)}</td>
                        <td className="mono">{shortHash(r.prev_hash, 14)}</td>
                        <td className="mono">{shortHash(r.record_hash, 14)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The surface                                                                 */
/* -------------------------------------------------------------------------- */

export function Live({ lang }: { lang: Lang }) {
  const v = useAliran();
  const [tab, setTab] = useState<'aliran' | 'audit'>('aliran');
  const [catalogue, setCatalogue] = useState<ScenarioSummary[]>([]);
  const [locked, setLocked] = useState(true);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [dialMsg, setDialMsg] = useState<string | null>(null);
  const [dialPending, setDialPending] = useState(false);
  const [dialFromApi, setDialFromApi] = useState<AutonomyMode | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);

  // Liveness readout. Bumped once a second; only ever used against a server timestamp.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [cat, dial] = await Promise.all([fetch('/api/konsol/katalog'), fetch('/api/dial')]);
        if (!live) return;
        if (cat.ok) {
          setCatalogue((await cat.json()) as ScenarioSummary[]);
          setLocked(false);
        } else {
          setLocked(true);
        }
        if (dial.ok) {
          const d = (await dial.json()) as { position: AutonomyMode };
          setDialFromApi(d.position);
        }
      } catch {
        setLocked(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const setDial = useCallback(async (position: AutonomyMode) => {
    setDialPending(true);
    setDialMsg(null);
    try {
      const res = await fetch('/api/dial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ position }),
      });
      const body = (await res.json()) as { position?: AutonomyMode; pesan?: string };
      if (res.ok && body.position) setDialFromApi(body.position);
      else if (body.pesan) setDialMsg(body.pesan);
    } catch {
      setDialMsg(null);
    } finally {
      setDialPending(false);
    }
  }, []);

  const startRun = useCallback(async (scenarioId: string) => {
    setRunMsg(null);
    try {
      const res = await fetch('/api/konsol/jalankan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scenarioId }),
      });
      const body = (await res.json()) as { accepted?: boolean; pesan?: string };
      if (!res.ok && body.pesan) setRunMsg(body.pesan);
    } catch {
      setRunMsg(null);
    }
  }, []);

  const run = v.run;
  const busy = run !== null && run.selesai === null;
  // The heartbeat is authoritative for the dial: it is what the server is about to decide WITH.
  const dial = v.dial ?? dialFromApi;
  const sinceS = useMemo(
    () =>
      v.lastAtMs === null || nowMs === null ? null : Math.max(0, Math.round((nowMs - v.lastAtMs) / 1000)),
    [v.lastAtMs, nowMs]
  );
  const finished = run?.selesai ?? null;
  const commandIssued = run?.kontainmen?.command != null;
  // PROPOSE means held for an approver, not declined. Same panel, different claim.
  const diusulkan = finished?.disposition === 'PROPOSE';
  const showRefusal = run !== null && finished !== null && !commandIssued;
  const latency = finished?.latency ?? run?.putusan?.latency ?? null;

  return (
    <div className="lv-shell">
      <div className="screen-title">
        <h1>{t('lv_title', lang)}</h1>
        <span className="sub">{t('lv_sub', lang)}</span>
      </div>

      {/* The architecture fact, on the surface, in both languages. Never a tooltip. */}
      <section className="lv-boundary" aria-label={t('lv_boundary_title', lang)}>
        <div className="lv-boundary-head">
          <Glyph k="diamond" size={9} />
          {t('lv_boundary_title', lang)}
        </div>
        <p className="lv-boundary-line" lang="id">
          {t('lv_boundary', 'id')}
        </p>
        <p className="lv-boundary-line" lang="en">
          {t('lv_boundary', 'en')}
        </p>
        <p className="lv-boundary-body">{tf('lv_boundary_detail', lang, { product: PRODUCT_NAME })}</p>
        <p className="lv-note">{t('lv_boundary_both', lang)}</p>
      </section>

      <div className="lv-subnav">
        <button
          type="button"
          className={`lv-subtab${tab === 'aliran' ? ' on' : ''}`}
          aria-current={tab === 'aliran' ? 'true' : undefined}
          onClick={() => setTab('aliran')}
        >
          <Glyph k={tab === 'aliran' ? 'check' : 'ring'} size={9} />
          {t('lv_tab_stream', lang)}
        </button>
        <button
          type="button"
          className={`lv-subtab${tab === 'audit' ? ' on' : ''}`}
          aria-current={tab === 'audit' ? 'true' : undefined}
          onClick={() => setTab('audit')}
        >
          <Glyph k={tab === 'audit' ? 'check' : 'ring'} size={9} />
          {t('lv_tab_audit', lang)}
        </button>
      </div>

      {tab === 'audit' ? (
        <AuditPanel chain={v.chain} lang={lang} />
      ) : (
        <>
          {v.state === 'tak-tersedia' || v.state === 'menyambung-ulang' ? (
            <div className="lv-down">
              <div className="lv-row">
                <Tag kind={v.state === 'tak-tersedia' ? 'crit' : 'med'} glyph="x">
                  {t(v.state === 'tak-tersedia' ? 'lv_state_down' : 'lv_state_retry', lang)}
                </Tag>
                <button type="button" className="btn sm" onClick={v.reconnect}>
                  <Glyph k="arc" size={9} />
                  {t('lv_reconnect', lang)}
                </button>
              </div>
              <p className="lv-note-lg">{t('lv_down_note', lang)}</p>
            </div>
          ) : null}
          {v.error ? (
            <Quote k={t('lv_stream', lang)} lang="id">
              {v.error}
            </Quote>
          ) : null}

          {/* Controls: the dial, the workloads, and the instant side-by-side comparison. */}
          <div className="lv-grid2">
            <Panel title={t('lv_dial', lang)} sub={t('lv_dial_sub', lang)}>
              <DialControl
                position={dial}
                lang={lang}
                pending={dialPending}
                message={dialMsg}
                onSet={setDial}
              />
            </Panel>
            <Panel title={t('lv_run_panel', lang)}>
              <RunControls
                catalogue={catalogue}
                locked={locked}
                busy={busy}
                message={runMsg}
                lang={lang}
                onRun={startRun}
              />
            </Panel>
          </div>
          <Panel title={t('lv_compare', lang)} sub={t('lv_compare_sub', lang)}>
            <Compare history={v.history} lang={lang} />
          </Panel>

          {/* The arc, in order. */}
          <Step n={1} label={t('lv_stream', lang)} />
          <Baseline v={v} lang={lang} sinceS={sinceS} />
          {run ? <ScenarioCard run={run} lang={lang} /> : null}

          <Step n={2} label={t('lv_signals', lang)} />
          <Signals v={v} lang={lang} />

          <Step n={3} label={t('lv_provenance', lang)} />
          {run ? (
            <>
              <Provenance
                run={run}
                minCorr={v.observedMinCorroboration}
                pinnedNow={v.corroborationPinned}
                lang={lang}
              />
              {showRefusal ? (
                <div style={{ marginTop: 14 }}>
                  <Panel title={t(diusulkan ? 'lv_tunggu' : 'lv_refusal', lang)}>
                    <Refusal run={run} lang={lang} diusulkan={diusulkan} />
                  </Panel>
                </div>
              ) : null}
            </>
          ) : (
            <p className="lv-note-lg">{t('lv_no_verdict', lang)}</p>
          )}

          <Step n={4} label={t('lv_actions', lang)} />
          <div className="lv-wide">
            <Panel title={t('lv_actions', lang)} sub={t('lv_actions_sub', lang)}>
              <ActionLog run={run} lang={lang} />
            </Panel>
            <Panel title={t('lv_latency', lang)}>
              <Latency report={latency} lang={lang} />
            </Panel>
          </div>

          <Step n={5} label={t('lv_safe_again', lang)} />
          <Panel title={t('lv_safe_again', lang)}>
            {finished ? (
              <div className="lv-stack">
                <div className="lv-row">
                  <Tag kind="ok" glyph="check">
                    {t('lv_run_finished', lang)}
                  </Tag>
                  <Tag
                    kind={finished.scratchRemoved ? 'ok' : 'med'}
                    glyph={finished.scratchRemoved ? 'check' : 'tri'}
                  >
                    {finished.scratchRemoved ? t('lv_scratch_removed', lang) : t('lv_scratch_kept', lang)}
                  </Tag>
                  <Tag kind={finished.containmentExecuted ? 'crit' : 'ok'} glyph="diamond">
                    {finished.containmentExecuted ? t('lv_cmd_issued', lang) : t('lv_cmd_none', lang)}
                  </Tag>
                </div>
                <dl className="lv-kv">
                  <KV k={t('lv_run_verdict', lang)}>{finished.finalVerdict}</KV>
                  <KV k={t('lv_run_disposition', lang)}>{finished.disposition ?? DASH}</KV>
                  <KV k={t('lv_events_in', lang)}>{finished.counts.eventsIngested}</KV>
                  <KV k={t('lv_files_touched', lang)}>{finished.counts.filesTouched}</KV>
                  <KV k={t('lv_chain_len', lang)}>{finished.auditChainLength}</KV>
                  <KV k={t('lv_audit_hash', lang)}>
                    <span className="lv-hash">{finished.auditHeadHash ?? DASH}</span>
                  </KV>
                </dl>
              </div>
            ) : (
              <p className="lv-note-lg">{t('lv_idle_note', lang)}</p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
