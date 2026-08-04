import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCache } from '@vercel/functions';
import type { ActionRecord, AutonomyMode, KonsolStatus, WorkloadRequest } from './types';

/**
 * Shared run state: a queue of PENDING WORKLOAD REQUESTS plus the state of the current run.
 *
 * A WorkloadRequest is exactly { runId, scenarioId, requestedAt, requestedBy }. It carries no verdict, no
 * severity, no alert, no action, no signal and no display instruction, and there is deliberately no field
 * it could carry one in. That is the enforcement, not a convention: the console's only channel to the
 * telemetry stream is this four-field record. Everything read back out of storage is rebuilt field by
 * field (see toRequest), so the invariant survives a round trip through a store this process does not
 * exclusively own.
 *
 * TWO LAYERS, in this order:
 *   1. LOCAL: a globalThis singleton (Next gives each route its own module instance, so a plain
 *      module-level variable would give the console and the telemetry stream separate stores) mirrored
 *      to one JSON file under os.tmpdir(). Same-instance fast path, and the whole story off platform.
 *   2. SHARED: the Vercel Runtime Cache, a per-region key-value store shared by every Function
 *      invocation. This is the only layer that crosses instances, and it is why this file exists in
 *      this shape at all: on Vercel the console POST and the SSE stream routinely land on DIFFERENT
 *      instances, so layer 1 alone means the stream never sees the button press.
 *
 * Every cache call is wrapped: a cache outage degrades to layer 1, it never fails a route.
 *
 * ponytail: read-modify-write on the queue is not atomic in either layer, so two presenters clicking at
 * the same instant can still race and lose one request. Ceiling accepted for a single-presenter demo;
 * upgrade path is a KV store with an atomic list pop (Upstash LPOP) instead of get-then-set.
 */

const MIRROR_PATH = join(tmpdir(), 'crown-konsol-state.json');
/** Bounded: state that can grow without limit is a memory bug waiting for a load test. */
const MAX_QUEUE = 16;
const MAX_CHAIN = 64;
/** A pending request older than this is stale (left over from a previous process) and is dropped. */
const PENDING_TTL_MS = 5 * 60 * 1000;

/**
 * One cache key per concern, never one blob: a progress write must not clobber a concurrent dial write.
 *
 * Scoped by VERCEL_ENV because the Runtime Cache is shared per region across every DEPLOYMENT of the
 * project, preview and production alike. Measured, not assumed: a freshly deployed preview read back a
 * FULL_AUTO dial set on a different preview minutes earlier. Unscoped keys would therefore let a dial
 * moved on a preview raise effective autonomy on the production demo, which is precisely the quiet
 * escalation deny-by-default exists to prevent. Each environment now gets its own queue, dial and chain.
 */
const SCOPE = process.env.VERCEL_ENV ?? 'local';
const KEY = {
  queue: `crown:demo:${SCOPE}:queue`,
  progress: `crown:demo:${SCOPE}:progress`,
  dial: `crown:demo:${SCOPE}:dial`,
  chain: `crown:demo:${SCOPE}:chain`,
  siaran: `crown:demo:${SCOPE}:siaran`,
} as const;

/**
 * Cache lifetimes, in seconds.
 *
 * The DIAL is the deliberate change of behaviour in this file, and it is a compromise. The dial gates
 * destructive autonomous action, so the previous version refused to persist it at all: it fails safe to
 * CROWN_DIAL_DEFAULT (MONITOR_ONLY) on every cold start, because a stale FULL_AUTO left in storage and
 * picked up by a later process is exactly the kind of quiet escalation deny-by-default exists to prevent.
 * It now has to be shared, because the surface that SETS it and the stream that READS it are different
 * instances. A ttl is the price, and it is now a FEATURE rather than a leak: an elevated dial LAPSES back
 * to MONITOR_ONLY on its own, so a FULL_AUTO setting cannot quietly survive into a later session. That
 * lapse used to be silent, which was the real defect. setDial now stores the expiry alongside the
 * position so the dashboard can show a live countdown, which is what makes a time-boxed elevation an
 * honest control rather than a trap. CROWN_DIAL_TTL_S (default 1800) sets the window.
 * The AUDIT CHAIN moved for the same cross-instance reason; it is safe to share now only
 * because AUDIT_INTEGRITY_KEY is set in the deployment, so a chain sealed on one instance still verifies
 * on another (see runner.ts integrityKey).
 */
function dialTtlS(): number {
  const n = Number(process.env.CROWN_DIAL_TTL_S);
  return Number.isFinite(n) && n > 0 ? n : 1800;
}

const TTL_S = {
  queue: PENDING_TTL_MS / 1000,
  progress: 300,
  chain: 900,
} as const;

const DIALS: AutonomyMode[] = ['MONITOR_ONLY', 'ALERT_RECOMMEND', 'HUMAN_GATED', 'FULL_AUTO'];
const PHASES = ['antre', 'berjalan', 'selesai'];

interface State {
  queue: WorkloadRequest[];
  progress: KonsolStatus | null;
  dial: AutonomyMode;
  chain: ActionRecord[];
}

function defaultDial(): AutonomyMode {
  const fromEnv = process.env.CROWN_DIAL_DEFAULT;
  return DIALS.includes(fromEnv as AutonomyMode) ? (fromEnv as AutonomyMode) : 'MONITOR_ONLY';
}

/* -------------------------------------------------------------------------- */
/* Shape validation. Everything below treats storage as external input.        */
/* -------------------------------------------------------------------------- */

const str = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Validate AND normalize. The result is rebuilt field by field rather than spread, so any extra property
 * a stored entry happened to carry is dropped here rather than travelling on to the telemetry stream.
 */
function toRequest(v: unknown): WorkloadRequest | null {
  const r = v as WorkloadRequest;
  if (!r || !str(r.runId) || !str(r.scenarioId) || !str(r.requestedAt) || !str(r.requestedBy)) {
    return null;
  }
  return {
    runId: r.runId,
    scenarioId: r.scenarioId,
    requestedAt: r.requestedAt,
    requestedBy: r.requestedBy,
  };
}

/** Same rebuild-don't-spread rule: KonsolStatus stays verdict-free even if storage says otherwise. */
function toProgress(v: unknown): KonsolStatus | null {
  const p = v as KonsolStatus;
  if (
    !p ||
    !str(p.runId) ||
    !str(p.scenarioId) ||
    !PHASES.includes(p.phase) ||
    !num(p.eventsEmitted) ||
    !num(p.filesTouched) ||
    !num(p.elapsedMs)
  ) {
    return null;
  }
  return {
    runId: p.runId,
    scenarioId: p.scenarioId,
    phase: p.phase,
    eventsEmitted: p.eventsEmitted,
    filesTouched: p.filesTouched,
    elapsedMs: p.elapsedMs,
  };
}

/**
 * Shape check only, and not a normalizing one: an ActionRecord is a hash-chain link whose real validation
 * is the HMAC recomputation in @crown/audit (verifyChain), which this file must not import. Rebuilding or
 * dropping fields here would change the bytes the verifier hashes and break a chain that is in fact
 * sound, so a stored chain is taken whole or not at all.
 */
const isRecord = (v: unknown): v is ActionRecord => {
  const r = v as ActionRecord;
  return !!r && typeof r === 'object' && num(r.chain_seq) && str(r.record_hash);
};

const fresh = (r: WorkloadRequest): boolean => Date.parse(r.requestedAt) >= Date.now() - PENDING_TTL_MS;

function toQueue(v: unknown): WorkloadRequest[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(toRequest)
    .filter((r): r is WorkloadRequest => r !== null)
    .filter(fresh)
    .slice(0, MAX_QUEUE);
}

/* -------------------------------------------------------------------------- */
/* Layer 1: process memory plus the tmp mirror (unchanged behaviour)           */
/* -------------------------------------------------------------------------- */

const SLOT = Symbol.for('crown.demo.konsolStore');
function memory(): State {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[SLOT]) g[SLOT] = { queue: [], progress: null, dial: defaultDial(), chain: [] } satisfies State;
  return g[SLOT] as State;
}

/** Local state: the mirror file wins for the queue and the progress, memory covers the rest. */
function read(): State {
  const mem = memory();
  try {
    const parsed: unknown = JSON.parse(readFileSync(MIRROR_PATH, 'utf8'));
    const o = parsed as Partial<State>;
    if (!o || typeof o !== 'object') return mem;
    return {
      queue: toQueue(o.queue),
      progress: toProgress(o.progress) ?? mem.progress,
      dial: mem.dial,
      chain: mem.chain,
    };
  } catch {
    return mem; // no mirror yet, or a read-only filesystem: memory is authoritative
  }
}

function write(next: State): void {
  const mem = memory();
  mem.queue = next.queue;
  mem.progress = next.progress;
  mem.dial = next.dial;
  mem.chain = next.chain;
  try {
    writeFileSync(MIRROR_PATH, JSON.stringify({ queue: next.queue, progress: next.progress }), 'utf8');
  } catch {
    /* read-only or full filesystem: the in-memory state is still authoritative */
  }
}

/* -------------------------------------------------------------------------- */
/* Layer 2: the Vercel Runtime Cache (the only layer that crosses instances)   */
/* -------------------------------------------------------------------------- */

/**
 * Is a REAL, shared Runtime Cache reachable here?
 *
 * getCache() never fails: with no platform cache behind it, @vercel/functions silently falls back to a
 * module-level in-memory cache. That fallback is NOT shared, because Next gives each route its own module
 * instance, so the console route and the telemetry stream would each get a private one. Trusting it would
 * be strictly worse than ignoring it: the stream pops the queue, writes the now-empty queue into its own
 * private cache, and from then on that empty array masks every request the console puts into shared
 * memory. Off platform we therefore skip layer 2 entirely and behave exactly as this file did before.
 *
 * VERCEL is the gate because it is the one signal that is reliably set wherever a real cache exists.
 * Probing the cache's own plumbing does not work from here: @vercel/functions resolves a platform cache
 * from the injected request context FIRST and only then from RUNTIME_CACHE_ENDPOINT, and that context is
 * not reachable through the package's public exports. Keying off the transport variables alone reports
 * "no cache" on exactly the deployment that has one.
 */
function cacheAvailable(): boolean {
  return Boolean(process.env.VERCEL);
}

/** undefined means "no shared answer": cache absent, key missing, or the cache errored. */
async function pull(key: string): Promise<unknown> {
  if (!cacheAvailable()) return undefined;
  try {
    return (await getCache().get(key)) ?? undefined;
  } catch {
    return undefined; // a cache outage falls back to layer 1, it never fails a route
  }
}

async function push(key: string, value: unknown, ttl: number): Promise<void> {
  if (!cacheAvailable()) return;
  try {
    await getCache().set(key, value, { ttl, name: key });
  } catch {
    /* a cache outage leaves layer 1 authoritative on this instance, and no route 500s */
  }
}

/**
 * The queue as this instance must see it. When a shared cache holds the key it is AUTHORITATIVE, including
 * when it holds an empty array: local memory on the instance that enqueued still remembers a request that
 * another instance has already taken, and preferring it would run the same workload twice.
 */
async function sharedQueue(): Promise<WorkloadRequest[]> {
  const cached = await pull(KEY.queue);
  return Array.isArray(cached) ? toQueue(cached) : read().queue;
}

/* -------------------------------------------------------------------------- */
/* Accessors. Async because layer 2 is.                                        */
/* -------------------------------------------------------------------------- */

export const store = {
  /** Queue a workload request and mark it 'antre'. Returns false when the queue is at its bound. */
  async enqueue(req: WorkloadRequest): Promise<boolean> {
    const queue = await sharedQueue();
    if (queue.length >= MAX_QUEUE) return false;
    const next = [...queue, req];
    const progress: KonsolStatus = {
      runId: req.runId,
      scenarioId: req.scenarioId,
      phase: 'antre',
      eventsEmitted: 0,
      filesTouched: 0,
      elapsedMs: 0,
    };
    write({ ...read(), queue: next, progress });
    await push(KEY.queue, next, TTL_S.queue);
    await push(KEY.progress, progress, TTL_S.progress);
    return true;
  },

  /**
   * Pop the oldest pending request, or null. Only the telemetry stream calls this.
   *
   * NOT atomic, and it cannot be: the read, the modify and the write are three separate cache round
   * trips across independent function instances. Measured on production, two streams polling in the same
   * instant both popped the SAME request and both executed it. See claimRun() for what narrows that.
   */
  async takePending(): Promise<WorkloadRequest | null> {
    const queue = await sharedQueue();
    const [next, ...rest] = queue;
    write({ ...read(), queue: rest }); // keep layer 1 in step even on an empty poll
    if (!next) return null;
    await push(KEY.queue, rest, TTL_S.queue); // no cache write on an idle poll
    return next;
  },

  async setProgress(p: KonsolStatus | null): Promise<void> {
    write({ ...read(), progress: p });
    await push(KEY.progress, p, TTL_S.progress);
  },

  async getProgress(): Promise<KonsolStatus | null> {
    return toProgress(await pull(KEY.progress)) ?? read().progress;
  },
};

/**
 * Arbitrate between two streams that popped the same request.
 *
 * takePending() is a read-modify-write across instances, so two streams polling together can both come
 * back holding the same run. That was visible as a cosmetic bug, two history rows for one runId, and the
 * blob naming now collapses those. But the underlying event is not cosmetic: at FULL_AUTO one verdict
 * would issue TWO ISOLATE_HOST commands, which is precisely the "acting wrongly" this product claims
 * never happens.
 *
 * There is no compare-and-set in the cache, so this is a write-then-read-back: each claimant writes its
 * own id, waits out the propagation, and reads. Last writer wins, everyone else stands down. It narrows
 * the window from a full poll interval to one round trip; it does NOT close it, and an atomic SETNX on a
 * real key-value store is the honest fix. That is written here rather than implied.
 *
 * The tie-break defaults to PROCEEDING, not to standing down. A read that comes back empty means the
 * cache did not answer, and if every claimant stood down on a cache miss the run would be lost entirely:
 * takePending already removed it from the queue, so nobody would execute a workload the operator pressed
 * a button for. Running twice is a bug; silently running zero times is a broken demo.
 */
export async function claimRun(runId: string, streamId: string): Promise<boolean> {
  const key = `crown:demo:${SCOPE}:klaim:${runId}`;
  try {
    const held = await pull(key);
    if (typeof held === 'string' && held !== streamId) return false;
    await push(key, streamId, 120);
    await new Promise((r) => setTimeout(r, 200));
    const menang = await pull(key);
    return menang === undefined || menang === streamId;
  } catch {
    return true; // the cache is not the authority on whether work happens
  }
}

/* The dial and the last run's audit chain live beside the queue but are deliberately NOT part of the
 * console-visible progress type. Separate accessors keep KonsolStatus verdict-free. */

/**
 * The dial, with the one fact the previous version hid: when it lapses.
 *
 * An elevated position is TIME BOXED. It expires and the system falls back to CROWN_DIAL_DEFAULT, which
 * is the fail-safe direction and is the behaviour we want. What was wrong was that it happened silently:
 * a presenter could set HUMAN_GATED, talk for twelve minutes, run an attack, and get MONITOR_ONLY
 * behaviour without ever being told why. So the stored value now carries its own deadline and the API
 * hands it to the UI, which counts it down. Same safety, no ambush.
 */
export interface DialState {
  position: AutonomyMode;
  /** UTC ISO-8601 ms. null when the dial sits at the default, which never expires. */
  expiresAtUtc: string | null;
  defaultPosition: AutonomyMode;
}

function parseDial(raw: unknown): { position: AutonomyMode; expiresAtUtc: string } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as { position?: unknown; expiresAtUtc?: unknown };
  if (!DIALS.includes(o.position as AutonomyMode)) return null;
  if (typeof o.expiresAtUtc !== 'string') return null;
  return { position: o.position as AutonomyMode, expiresAtUtc: o.expiresAtUtc };
}

export async function getDialState(): Promise<DialState> {
  const dflt = defaultDial();
  // Anything the cache cannot prove to be one of the four positions falls back to the local dial, which
  // starts at CROWN_DIAL_DEFAULT. Failing safe is the point, so an unrecognised value never widens autonomy.
  const parsed = parseDial(await pull(KEY.dial));
  if (!parsed) return { position: read().dial, expiresAtUtc: null, defaultPosition: dflt };
  return {
    position: parsed.position,
    // The default position is a resting state, not an elevation, so it is not counted down.
    expiresAtUtc: parsed.position === dflt ? null : parsed.expiresAtUtc,
    defaultPosition: dflt,
  };
}

export async function getDial(): Promise<AutonomyMode> {
  return (await getDialState()).position;
}

export async function setDial(position: AutonomyMode): Promise<void> {
  write({ ...read(), dial: position });
  const ttl = dialTtlS();
  const expiresAtUtc = new Date(Date.now() + ttl * 1000).toISOString();
  await push(KEY.dial, { position, expiresAtUtc }, ttl);
}

export async function setChain(records: ActionRecord[]): Promise<void> {
  const bounded = records.slice(-MAX_CHAIN);
  write({ ...read(), chain: bounded });
  await push(KEY.chain, bounded, TTL_S.chain);
}

export async function getChain(): Promise<ActionRecord[]> {
  const cached = await pull(KEY.chain);
  if (!Array.isArray(cached)) return read().chain;
  // Whole or nothing: a chain with a link quietly dropped would verify as broken and read as tampering.
  return cached.every(isRecord) ? (cached as ActionRecord[]).slice(-MAX_CHAIN) : read().chain;
}

/* -------------------------------------------------------------------------- */
/* Which telemetry stream is allowed to take work.                             */
/* -------------------------------------------------------------------------- */

/**
 * BROADCAST, and why there is no lease here any more.
 *
 * On Vercel a disconnected SSE client does NOT reliably abort req.signal, so a dashboard reload leaves a
 * ZOMBIE stream whose server loop keeps running for the rest of its maxDuration (300s) with nobody
 * listening. Two designs were tried against that and both were wrong:
 *
 *   1. A last-writer-wins TOKEN. Superseded streams closed themselves, the browser auto-reconnected and
 *      re-claimed, and two open dashboards livelocked, killing each other every couple of seconds.
 *   2. A renewable LEASE. No more livelock, but a zombie renews just as happily as a live client, so the
 *      zombie held the lease forever and starved every real viewer. Measured: a run reached 'selesai'
 *      with 37 events while both watching dashboards received nothing at all.
 *
 * Both failed for the same reason: the server cannot tell a dead client from a live one, so ANY scheme
 * that hands exclusive rights to a stream is guessing.
 *
 * So stop guessing. Nobody gets exclusive rights. takePending() is already a pop, so exactly one stream
 * executes a given run whether it is a zombie or not. The executor then PUBLISHES the run's events here,
 * and every stream, including passive ones and ones that connect mid-run, replays from this key. A zombie
 * executing becomes harmless: the work still happens and the results still reach every real viewer.
 *
 * This also fixes the thing that made the QR code on the last slide a trap. Judges opening the dashboard
 * on their phones now see the same run as the presenter, instead of stealing it or seeing nothing.
 *
 * ponytail: batched whole-array writes, not an append log, so a run is bounded by MAX_SIARAN events and
 * one cache item. Fine for a ~45 event run. If runs ever get long, switch to per-chunk keys.
 */
const SIARAN_TTL_S = 900; // a finished run stays replayable for a while, then ages out on its own
const MAX_SIARAN = 400; // hard bound; a real run is about 45 events

export interface Siaran {
  runId: string;
  events: unknown[];
  done: boolean;
  at: number;
}

let localSiaran: Siaran | null = null;

/** Executor only: publish the run so far. Called batched, not per event. */
export async function publishRun(runId: string, events: unknown[], done: boolean): Promise<void> {
  const siaran: Siaran = { runId, events: events.slice(0, MAX_SIARAN), done, at: Date.now() };
  localSiaran = siaran;
  await push(KEY.siaran, siaran, SIARAN_TTL_S);
}

/** Every stream: what run is being broadcast right now, and how far has it got. */
export async function readRun(): Promise<Siaran | null> {
  const cached = await pull(KEY.siaran);
  if (cached && typeof cached === 'object') {
    const c = cached as Partial<Siaran>;
    if (str(c.runId) && Array.isArray(c.events) && typeof c.done === 'boolean' && num(c.at)) {
      return { runId: c.runId, events: c.events, done: c.done, at: c.at };
    }
  }
  return localSiaran;
}
