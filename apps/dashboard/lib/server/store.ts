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
  stream: `crown:demo:${SCOPE}:stream`,
} as const;

/**
 * Cache lifetimes, in seconds.
 *
 * The DIAL is the deliberate change of behaviour in this file, and it is a compromise. The dial gates
 * destructive autonomous action, so the previous version refused to persist it at all: it fails safe to
 * CROWN_DIAL_DEFAULT (MONITOR_ONLY) on every cold start, because a stale FULL_AUTO left in storage and
 * picked up by a later process is exactly the kind of quiet escalation deny-by-default exists to prevent.
 * It now has to be shared, because the surface that SETS it and the stream that READS it are different
 * instances. A SHORT ttl is the price: 600 seconds keeps one demo session working and then lets the dial
 * fall back to MONITOR_ONLY on its own, so a FULL_AUTO setting cannot quietly survive into a later
 * session. The AUDIT CHAIN moved for the same cross-instance reason; it is safe to share now only
 * because AUDIT_INTEGRITY_KEY is set in the deployment, so a chain sealed on one instance still verifies
 * on another (see runner.ts integrityKey).
 */
const TTL_S = {
  queue: PENDING_TTL_MS / 1000,
  progress: 300,
  dial: 600,
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

  /** Pop the oldest pending request, or null. Only the telemetry stream calls this. */
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

/* The dial and the last run's audit chain live beside the queue but are deliberately NOT part of the
 * console-visible progress type. Separate accessors keep KonsolStatus verdict-free. */

export async function getDial(): Promise<AutonomyMode> {
  const cached = await pull(KEY.dial);
  // Anything the cache cannot prove to be one of the four positions falls back to the local dial, which
  // starts at CROWN_DIAL_DEFAULT. Failing safe is the point, so an unrecognised value never widens autonomy.
  return DIALS.includes(cached as AutonomyMode) ? (cached as AutonomyMode) : read().dial;
}

export async function setDial(position: AutonomyMode): Promise<void> {
  write({ ...read(), dial: position });
  await push(KEY.dial, position, TTL_S.dial);
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
 * On Vercel a disconnected SSE client does NOT reliably abort req.signal, so a dashboard reload can leave
 * a ZOMBIE stream polling for the rest of its maxDuration (300s). A zombie that calls takePending() steals
 * the next button press and runs the whole scenario into a socket nobody is listening to, which on stage
 * is indistinguishable from the product being broken.
 *
 * The first attempt at this was a last-writer-wins TOKEN: newest connection wins, superseded streams
 * close themselves. That was WRONG, and it was worse than the bug it fixed. A superseded stream closing
 * makes the browser's EventSource auto-reconnect, which re-claims the token, which closes the other one,
 * which reconnects... Two open dashboards livelock, killing each other every couple of seconds. Observed
 * live: the server heartbeat never got past #0 across a four second window, and three people on three
 * machines each saw a different subset of runs, non-deterministically. Worse, a judge opening the
 * dashboard from the QR code would have stolen the stream out from under the presenter mid-demo.
 *
 * So this is a LEASE, not a token, and losing it is not fatal:
 *   - the holder renews on every poll, so a live holder keeps it
 *   - a newcomer does NOT steal a live lease; it stays passive and keeps heartbeating
 *   - if the holder dies, its lease goes stale and the next poller takes over automatically
 * Nobody ever closes anybody. A passive stream is still a fully useful stream: it just does not take
 * work, and the route tells the client so via `aktif` on the heartbeat.
 *
 * ponytail: LEASE_MS is longer than a run so the holder does not lose the lease mid-scenario while it is
 * awaiting the runner instead of polling. If runs ever get longer than this, renew inside the run loop
 * rather than raising it further.
 */
const STREAM_TTL_S = 320; // just over the stream's maxDuration, so a lease outlives the stream that made it
const LEASE_MS = 25_000; // comfortably longer than a 6 to 10 second run, short enough to recover fast
let localLease: { id: string; at: number } | null = null;

interface Lease {
  id: string;
  at: number;
}

function toLease(v: unknown): Lease | null {
  if (!v || typeof v !== 'object') return null;
  const l = v as Partial<Lease>;
  return str(l.id) && num(l.at) ? { id: l.id, at: l.at } : null;
}

/**
 * Try to hold the work lease. Returns true if this stream may take work, false if it must stay passive.
 * Calling this renews the lease when it is already ours, so the holder simply keeps holding.
 */
export async function acquireStreamLease(id: string): Promise<boolean> {
  const now = Date.now();
  const held = toLease(await pull(KEY.stream)) ?? localLease;
  const liveAndSomeoneElses = held !== null && held.id !== id && now - held.at < LEASE_MS;
  if (liveAndSomeoneElses) return false;
  const mine = { id, at: now };
  localLease = mine;
  await push(KEY.stream, mine, STREAM_TTL_S);
  return true;
}
