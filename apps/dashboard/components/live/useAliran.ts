'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ActionRecord,
  AliranEvent,
  AliranEventName,
  AuditEvent,
  AutonomyMode,
  DetakEvent,
  KontainmenEvent,
  PutusanEvent,
  ScenarioSummary,
  SelesaiEvent,
  TikEvent,
} from '../../lib/server/types';

/**
 * The Live surface's single source of truth: the public SSE stream at /api/telemetri/aliran.
 *
 * Everything in here is a projection of what the SERVER said. Nothing is synthesised, nothing is
 * interpolated and nothing is filled in with a plausible-looking default. Where a number has not arrived
 * yet the projection stores null and the UI prints a dash.
 *
 * The one thing measured on the client is the ARRIVAL RATE of stream events (see `rate`), which is a real
 * browser-side measurement of the server's delivery, labelled as such on screen. It is not telemetry.
 */

/* -------------------------------------------------------------------------- */
/* Bounds (rule 5: nothing here may grow without limit)                        */
/* -------------------------------------------------------------------------- */

const MAX_RATE_POINTS = 90;
const MAX_TICKS = 60;
const MAX_LOG = 40;
const MAX_HISTORY = 4;
const MAX_PROOF_SETS = 16;
const RETRY_MS = 5000;

const EVENT_NAMES: AliranEventName[] = [
  'detak',
  'mulai',
  'tik',
  'putusan',
  'kontainmen',
  'audit',
  'selesai',
  'galat',
];

/* -------------------------------------------------------------------------- */
/* Projected shapes                                                            */
/* -------------------------------------------------------------------------- */

export type StreamState = 'menghubungkan' | 'langsung' | 'menyambung-ulang' | 'tak-tersedia';

/** How a signal's class was PROVEN from the stream. Never asserted, always derived. */
export type SignalClass = 'diskriminatif' | 'konteks' | null;

/**
 * The classification the API contract publishes (lib/server/API.md, "the five signal_type values"):
 * CANARY_TAMPER and FORMAT_VALIDATION_FAIL are the encryption-discriminating pair, the other three are
 * context signals that benign work also trips.
 *
 * This is the DECLARED class. It is not trusted on its own: `klass` below is derived independently from
 * the stream, and the surface shows whether the derivation confirms the declaration, has not confirmed it
 * yet, or contradicts it. A contradiction would be a real finding, so it is rendered rather than hidden.
 */
const DECLARED: Record<string, Exclude<SignalClass, null>> = {
  CANARY_TAMPER: 'diskriminatif',
  FORMAT_VALIDATION_FAIL: 'diskriminatif',
  ENTROPY_DELTA: 'konteks',
  OP_FREQUENCY: 'konteks',
  TYPE_HEADER_CHANGE: 'konteks',
};

export interface SignalRow {
  signalType: string;
  /** What the API contract declares this evaluator to be. Always present. */
  declared: Exclude<SignalClass, null> | null;
  fired: boolean;
  score: number | null;
  detail: string | null;
  /** emitted_at of the C1 event that produced this reading. */
  at: string | null;
  /** Lowest score at which the engine was OBSERVED firing this signal. Null until it has fired. */
  minFired: number | null;
  /** Highest score at which the engine was OBSERVED not firing it. Null until observed quiet with a score. */
  maxQuiet: number | null;
  klass: SignalClass;
}

export interface RunView {
  runId: string;
  scenario: ScenarioSummary;
  dialAtStart: AutonomyMode;
  totalEvents: number;
  pacingGapMs: number;
  startedAt: string;
  ticks: TikEvent[];
  tickCount: number;
  lastTick: TikEvent | null;
  putusan: PutusanEvent | null;
  kontainmen: KontainmenEvent | null;
  audits: AuditEvent[];
  selesai: SelesaiEvent | null;
}

export interface AliranView {
  state: StreamState;
  /** Last idle heartbeat. Its `seq` is the server's own tick counter. */
  beat: DetakEvent | null;
  /** Wall-clock ms of the last event of ANY kind, for the "last seen" readout. */
  lastAtMs: number | null;
  /** Server timestamp of the last event of any kind. */
  lastAtIso: string | null;
  /** Measured events/second, one point per received event. Bounded. */
  rate: number[];
  dial: AutonomyMode | null;
  run: RunView | null;
  history: RunView[];
  chain: ActionRecord[];
  signals: SignalRow[];
  /**
   * Corroboration threshold as EVIDENCED by the stream, an upper bound: the smallest corroborating_count on
   * which the engine returned a destructive verdict without the fast path. Null until the stream shows one.
   */
  observedMinCorroboration: number | null;
  /**
   * True when the stream has also produced the matching lower bound, so the threshold above is not merely
   * an upper bound but the exact value. See growProof.
   */
  corroborationPinned: boolean;
  error: string | null;
}

/* -------------------------------------------------------------------------- */
/* Signal-class proof, derived only from what the stream says                   */
/* -------------------------------------------------------------------------- */

/**
 * The engine publishes its fusion rule: a destructive verdict needs the canary fast path, OR at least
 * `min` corroborating fired signals INCLUDING at least one discriminating one. That rule lets the class of
 * each evaluator be PROVEN from the wire, with no hardcoded list of signal names:
 *
 *  - a tick that reached MASS_ENCRYPTION (or fired the fast path) provably had >=1 discriminating signal
 *    among its fired set. If exactly one member of that set is not already proven CONTEXT, that one is
 *    DISCRIMINATING.
 *  - a tick that did NOT reach MASS_ENCRYPTION, without the fast path, whose corroborating_count is at
 *    least the observed threshold, provably had NO discriminating signal fired: every signal fired on it
 *    is CONTEXT.
 *
 * Both rules are re-applied to the stored evidence whenever new evidence lands, so proof accumulates
 * across runs in the session. Evidence lists are bounded.
 */
interface Proof {
  /** Fired sets from ticks that provably contained a discriminating signal. Evidence buffer, bounded. */
  discSets: string[][];
  /** Fired sets from non-destructive, non-fast-path ticks, with their corroborating_count. Bounded. */
  quietSets: { fired: string[]; count: number }[];
  /** Upper bound on the corroboration threshold. */
  upperC: number | null;
  /** Signals PROVEN to be context. Monotone: a proof is never withdrawn when evidence ages out. */
  ctx: string[];
  /** Signals PROVEN to be discriminating. Monotone. */
  disc: string[];
  /**
   * Lower bound minus one: the largest corroborating_count seen on a non-destructive, non-fast-path tick
   * that DID fire a proven-discriminating signal. Such a tick proves count < threshold.
   */
  belowC: number | null;
  /**
   * Fast-path correlation, per signal type. `fast_path` is the decoy shortcut, so the signal whose `fired`
   * value has tracked `fastPath` on EVERY observed tick, with both values seen at least once, is the
   * fast-path signal and is therefore discriminating. Five entries at most, so this is bounded by the
   * contract's own signal enumeration.
   */
  fp: Record<string, { match: boolean; sawTrue: boolean; sawFalse: boolean }>;
}

function pushSet(list: string[][], fired: string[]): string[][] {
  if (fired.length === 0) return list;
  const key = [...fired].sort().join('|');
  if (list.some((s) => [...s].sort().join('|') === key)) return list;
  return [...list, fired].slice(-MAX_PROOF_SETS);
}

/** Grow the proven sets from the evidence buffers. Proofs only ever accumulate, never reverse. */
function growProof(p: Proof): Proof {
  const ctx = new Set(p.ctx);
  const disc = new Set(p.disc);

  // DISCRIMINATING by fast-path correlation. This is what makes a canary run self-proving: the stream
  // says fast_path fired, and it says which signal was lit on exactly those ticks and no others.
  for (const [signalType, f] of Object.entries(p.fp)) {
    if (f.match && f.sawTrue && f.sawFalse) disc.add(signalType);
  }

  // CONTEXT: only a tick at or above the observed threshold can prove the absence of a discriminator.
  if (p.upperC !== null) {
    for (const q of p.quietSets) {
      if (q.count >= p.upperC) for (const s of q.fired) ctx.add(s);
    }
  }
  // DISCRIMINATING by elimination, to a fixed point.
  let changed = true;
  while (changed) {
    changed = false;
    for (const set of p.discSets) {
      const candidates = set.filter((s) => !ctx.has(s));
      if (candidates.length === 1 && !disc.has(candidates[0])) {
        disc.add(candidates[0]);
        changed = true;
      }
    }
  }
  // LOWER BOUND: a non-destructive tick that fired a proven discriminator had count below the threshold.
  let belowC = p.belowC;
  for (const q of p.quietSets) {
    if (q.fired.some((s) => disc.has(s))) belowC = belowC === null ? q.count : Math.max(belowC, q.count);
  }
  return { ...p, ctx: [...ctx], disc: [...disc], belowC };
}

function classesOf(p: Proof): Map<string, SignalClass> {
  const out = new Map<string, SignalClass>();
  for (const s of p.ctx) out.set(s, 'konteks');
  for (const s of p.disc) if (!out.has(s)) out.set(s, 'diskriminatif');
  return out;
}

/** The threshold is pinned exactly when the lower and upper bounds meet. */
function pinned(p: Proof): boolean {
  return p.upperC !== null && p.belowC !== null && p.belowC + 1 === p.upperC;
}

/* -------------------------------------------------------------------------- */
/* Reducer                                                                     */
/* -------------------------------------------------------------------------- */

interface Internal {
  view: AliranView;
  proof: Proof;
}

const EMPTY: Internal = {
  view: {
    state: 'menghubungkan',
    beat: null,
    lastAtMs: null,
    lastAtIso: null,
    rate: [],
    dial: null,
    run: null,
    history: [],
    chain: [],
    signals: [],
    observedMinCorroboration: null,
    corroborationPinned: false,
    error: null,
  },
  proof: { discSets: [], quietSets: [], upperC: null, ctx: [], disc: [], belowC: null, fp: {} },
};

function withRate(rate: number[], prevMs: number | null, nowMs: number): number[] {
  if (prevMs === null) return rate;
  const gap = Math.max(1, nowMs - prevMs);
  return [...rate, 1000 / gap].slice(-MAX_RATE_POINTS);
}

function applyTickSignals(rows: SignalRow[], e: TikEvent): SignalRow[] {
  const byType = new Map(rows.map((r) => [r.signalType, r]));
  for (const s of e.signals) {
    const prev = byType.get(s.signal_type);
    const row: SignalRow = {
      signalType: s.signal_type,
      declared: DECLARED[s.signal_type] ?? null,
      fired: s.fired,
      score: s.score,
      detail: s.detail,
      at: e.emittedAt,
      minFired: prev?.minFired ?? null,
      maxQuiet: prev?.maxQuiet ?? null,
      klass: prev?.klass ?? null,
    };
    if (s.score !== null) {
      if (s.fired) row.minFired = row.minFired === null ? s.score : Math.min(row.minFired, s.score);
      else row.maxQuiet = row.maxQuiet === null ? s.score : Math.max(row.maxQuiet, s.score);
    }
    byType.set(s.signal_type, row);
  }
  // The engine returns its evaluators in a stable order; keep first-seen order so rows never jump.
  const order = rows.map((r) => r.signalType);
  for (const s of e.signals) if (!order.includes(s.signal_type)) order.push(s.signal_type);
  return order.map((tname) => byType.get(tname)).filter((r): r is SignalRow => r !== undefined);
}

function reduce(prev: Internal, e: AliranEvent, nowMs: number): Internal {
  const v = prev.view;
  const base: AliranView = {
    ...v,
    state: 'langsung',
    lastAtMs: nowMs,
    lastAtIso: e.at,
    rate: withRate(v.rate, v.lastAtMs, nowMs),
  };

  switch (e.type) {
    case 'detak':
      return { ...prev, view: { ...base, beat: e, dial: e.dial, error: null } };

    case 'mulai':
      return {
        ...prev,
        view: {
          ...base,
          dial: e.dial,
          error: null,
          chain: [],
          run: {
            runId: e.runId,
            scenario: e.scenario,
            dialAtStart: e.dial,
            totalEvents: e.totalEvents,
            pacingGapMs: e.pacingGapMs,
            startedAt: e.at,
            ticks: [],
            tickCount: 0,
            lastTick: null,
            putusan: null,
            kontainmen: null,
            audits: [],
            selesai: null,
          },
        },
      };

    case 'tik': {
      if (!base.run || base.run.runId !== e.runId) return { ...prev, view: base };
      const fired = e.signals.filter((s) => s.fired).map((s) => s.signal_type);
      const destructive = e.verdict === 'MASS_ENCRYPTION';
      const fp: Proof['fp'] = { ...prev.proof.fp };
      for (const sg of e.signals) {
        const cur = fp[sg.signal_type] ?? { match: true, sawTrue: false, sawFalse: false };
        fp[sg.signal_type] = {
          match: cur.match && sg.fired === e.fastPath,
          sawTrue: cur.sawTrue || e.fastPath,
          sawFalse: cur.sawFalse || !e.fastPath,
        };
      }
      const proof = growProof({
        ...prev.proof,
        fp,
        discSets: destructive || e.fastPath ? pushSet(prev.proof.discSets, fired) : prev.proof.discSets,
        quietSets:
          !destructive && !e.fastPath && fired.length > 0
            ? [...prev.proof.quietSets, { fired, count: e.corroboratingCount }].slice(-MAX_PROOF_SETS)
            : prev.proof.quietSets,
        upperC:
          destructive && !e.fastPath
            ? prev.proof.upperC === null
              ? e.corroboratingCount
              : Math.min(prev.proof.upperC, e.corroboratingCount)
            : prev.proof.upperC,
      });
      const classes = classesOf(proof);
      const signals = applyTickSignals(base.signals, e).map((r) => ({
        ...r,
        klass: classes.get(r.signalType) ?? r.klass,
      }));
      return {
        proof,
        view: {
          ...base,
          signals,
          observedMinCorroboration: proof.upperC,
          corroborationPinned: pinned(proof),
          run: {
            ...base.run,
            ticks: [...base.run.ticks, e].slice(-MAX_TICKS),
            tickCount: e.index + 1,
            lastTick: e,
          },
        },
      };
    }

    case 'putusan':
      if (!base.run || base.run.runId !== e.runId) return { ...prev, view: base };
      return { ...prev, view: { ...base, run: { ...base.run, putusan: e } } };

    case 'kontainmen':
      if (!base.run || base.run.runId !== e.runId) return { ...prev, view: base };
      return { ...prev, view: { ...base, run: { ...base.run, kontainmen: e } } };

    case 'audit': {
      if (!base.run || base.run.runId !== e.runId) return { ...prev, view: base };
      return {
        ...prev,
        view: {
          ...base,
          chain: [...base.chain, e.record].slice(-MAX_LOG),
          run: { ...base.run, audits: [...base.run.audits, e].slice(-MAX_LOG) },
        },
      };
    }

    case 'selesai': {
      if (!base.run || base.run.runId !== e.runId) return { ...prev, view: base };
      const done: RunView = { ...base.run, selesai: e };
      return {
        ...prev,
        view: { ...base, run: done, history: [done, ...base.history].slice(0, MAX_HISTORY) },
      };
    }

    case 'galat':
      return { ...prev, view: { ...base, error: e.pesan } };

    default:
      return { ...prev, view: base };
  }
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

function isAliranEvent(x: unknown): x is AliranEvent {
  return typeof x === 'object' && x !== null && typeof (x as { type?: unknown }).type === 'string';
}

export function useAliran(): AliranView & { reconnect: () => void } {
  const [internal, setInternal] = useState<Internal>(EMPTY);
  const [nonce, setNonce] = useState(0);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reconnect = useCallback(() => {
    if (retry.current) clearTimeout(retry.current);
    retry.current = null;
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    // `r` is the reconnect counter. It makes each manual retry a distinct URL, so no intermediary can
    // hand back a cached copy of the response that just failed.
    const es = new EventSource(`/api/telemetri/aliran?r=${nonce}`);

    const onMessage = (ev: MessageEvent<string>) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return; // a malformed frame is dropped, never rendered as data
      }
      if (!isAliranEvent(parsed)) return;
      const now = Date.now();
      setInternal((prev) => reduce(prev, parsed as AliranEvent, now));
    };

    for (const name of EVENT_NAMES) es.addEventListener(name, onMessage as EventListener);
    es.onopen = () => setInternal((p) => ({ ...p, view: { ...p.view, state: 'langsung' } }));
    es.onerror = () => {
      const closed = es.readyState === EventSource.CLOSED;
      setInternal((p) => ({
        ...p,
        view: { ...p.view, state: closed ? 'tak-tersedia' : 'menyambung-ulang' },
      }));
      // CLOSED means the browser gave up (a non-200 or a rejected content type). Retry on our own clock;
      // a transient drop is already retried by EventSource itself.
      if (closed && !retry.current) {
        retry.current = setTimeout(() => {
          retry.current = null;
          setNonce((n) => n + 1);
        }, RETRY_MS);
      }
    };

    return () => {
      for (const name of EVENT_NAMES) es.removeEventListener(name, onMessage as EventListener);
      es.close();
    };
  }, [nonce]);

  useEffect(
    () => () => {
      if (retry.current) clearTimeout(retry.current);
    },
    []
  );

  return { ...internal.view, reconnect };
}
