import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ActionRecord, AutonomyMode, KonsolStatus, WorkloadRequest } from './types';

/**
 * Shared run state: a queue of PENDING WORKLOAD REQUESTS plus the state of the current run.
 *
 * A WorkloadRequest is exactly { runId, scenarioId, requestedAt, requestedBy }. It carries no verdict, no
 * severity, no alert, no action, no signal and no display instruction, and there is deliberately no field
 * it could carry one in. That is the enforcement, not a convention: the console's only channel to the
 * telemetry stream is this four-field record.
 *
 * ponytail: process singleton (globalThis, because Next gives each route its own module instance), with
 * the queue and the progress mirrored to one JSON file under os.tmpdir(). On Vercel Fluid Compute
 * concurrent requests share a warm instance, which is enough for a single-presenter demo; the file is the
 * second chance when they do not. Read-modify-write on the file is not atomic, so two presenters clicking
 * at the same instant can race. Swap this one file for a KV store if it ever needs to survive that.
 */

const MIRROR_PATH = join(tmpdir(), 'crown-konsol-state.json');
/** Bounded: state that can grow without limit is a memory bug waiting for a load test. */
const MAX_QUEUE = 16;
const MAX_CHAIN = 64;
/** A pending request older than this is stale (left over from a previous process) and is dropped. */
const PENDING_TTL_MS = 5 * 60 * 1000;

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

/**
 * Process-wide memory. It hangs off globalThis because Next gives each route its own module instance, so a
 * plain module-level variable would give the console and the telemetry stream separate stores.
 */
const SLOT = Symbol.for('crown.demo.konsolStore');
function memory(): State {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[SLOT]) g[SLOT] = { queue: [], progress: null, dial: defaultDial(), chain: [] } satisfies State;
  return g[SLOT] as State;
}

const str = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isRequest(v: unknown): v is WorkloadRequest {
  const r = v as WorkloadRequest;
  return !!r && str(r.runId) && str(r.scenarioId) && str(r.requestedAt) && str(r.requestedBy);
}

function isProgress(v: unknown): v is KonsolStatus {
  const p = v as KonsolStatus;
  return (
    !!p &&
    str(p.runId) &&
    str(p.scenarioId) &&
    PHASES.includes(p.phase) &&
    num(p.eventsEmitted) &&
    num(p.filesTouched) &&
    num(p.elapsedMs)
  );
}

/**
 * Read the current state: the mirror file wins for the queue and the progress (it is the only link across
 * instance boundaries), memory covers the rest. Shape-validated, because a file is external input even
 * when this process wrote it.
 *
 * TWO things are deliberately NOT mirrored:
 *  - The DIAL. It gates destructive autonomous action, so it must fail safe to CROWN_DIAL_DEFAULT
 *    (MONITOR_ONLY) on every cold start. A stale FULL_AUTO left in a temp file and picked up by a later
 *    process is exactly the kind of quiet escalation deny-by-default exists to prevent.
 *  - The AUDIT CHAIN. It is sealed with a per-process HMAC key (see runner.ts), so a chain that outlived
 *    its process could never be verified, and an unverifiable audit chain is worse than an empty one.
 * Both still cross route module instances inside one process, via the globalThis slot above.
 */
function read(): State {
  const mem = memory();
  try {
    const parsed: unknown = JSON.parse(readFileSync(MIRROR_PATH, 'utf8'));
    const o = parsed as Partial<State>;
    if (!o || typeof o !== 'object') return mem;
    const cutoff = Date.now() - PENDING_TTL_MS;
    const queue = (Array.isArray(o.queue) ? o.queue : [])
      .filter(isRequest)
      .filter((r) => Date.parse(r.requestedAt) >= cutoff)
      .slice(0, MAX_QUEUE);
    return {
      queue,
      progress: isProgress(o.progress) ? o.progress : mem.progress,
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

export const store = {
  /** Queue a workload request and mark it 'antre'. Returns false when the queue is at its bound. */
  enqueue(req: WorkloadRequest): boolean {
    const s = read();
    if (s.queue.length >= MAX_QUEUE) return false;
    write({
      ...s,
      queue: [...s.queue, req],
      progress: {
        runId: req.runId,
        scenarioId: req.scenarioId,
        phase: 'antre',
        eventsEmitted: 0,
        filesTouched: 0,
        elapsedMs: 0,
      },
    });
    return true;
  },

  /** Pop the oldest pending request, or null. Only the telemetry stream calls this. */
  takePending(): WorkloadRequest | null {
    const s = read();
    if (s.queue.length === 0) {
      write(s); // keep memory in step with the mirror even on an empty poll
      return null;
    }
    const [next, ...rest] = s.queue;
    write({ ...s, queue: rest });
    return next ?? null;
  },

  setProgress(p: KonsolStatus | null): void {
    write({ ...read(), progress: p });
  },

  getProgress(): KonsolStatus | null {
    return read().progress;
  },
};

/* The dial and the last run's audit chain live beside the queue but are deliberately NOT part of the
 * console-visible progress type. Separate accessors keep KonsolStatus verdict-free. */

export function getDial(): AutonomyMode {
  return read().dial;
}

export function setDial(position: AutonomyMode): void {
  write({ ...read(), dial: position });
}

export function setChain(records: ActionRecord[]): void {
  write({ ...read(), chain: records.slice(-MAX_CHAIN) });
}

export function getChain(): ActionRecord[] {
  return read().chain;
}
