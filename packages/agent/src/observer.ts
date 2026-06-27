import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { SCHEMA_VERSION, type TelemetryEvent } from '@crown/contracts';
import { entropy, formatValid, inferType, magicChanged } from './inspect.js';

/**
 * Userspace filesystem observer — the BUILD's agent monitoring backend (ADR-006: eBPF/minifilter are the
 * production backends; this userspace poller is the light build option, always feeding a durable sink).
 * It snapshots a directory and, on each poll, emits C1 telemetry for changed/created files, computing
 * entropy (read-vs-write at the same offset), structural validity, and magic-change from the REAL bytes.
 *
 * Honest limitation (documented): userspace polling has NO process attribution — process fields are null
 * (production eBPF/minifilter supply pid/path/signed, which the allow-list and dual-control rely on). The
 * detector tolerates null process; allow-list suppression therefore requires the production backend.
 */
export interface ObserverOptions {
  agentId: string;
  hostId: string;
  canaryPaths?: string[]; // absolute paths the agent treats as decoys (CANARY_TOUCHED on change)
  windowBytes?: number;
}

interface Snap {
  bytes: Uint8Array;
  type: string;
}

export class FsObserver {
  private opts: ObserverOptions;
  private snap = new Map<string, Snap>();
  private canaries: Set<string>;
  private seq = 0;
  private lastPollMs: number | null = null;

  constructor(opts: ObserverOptions) {
    this.opts = opts;
    this.canaries = new Set(opts.canaryPaths ?? []);
  }

  private async listFiles(dir: string): Promise<string[]> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries.filter((e) => e.isFile()).map((e) => join(dir, e.name));
    } catch {
      return [];
    }
  }

  /** Capture the baseline (no events emitted). Call once before activity starts. */
  async snapshot(dir: string): Promise<void> {
    for (const p of await this.listFiles(dir)) {
      const bytes = new Uint8Array(await readFile(p));
      this.snap.set(p, { bytes, type: inferType(bytes) });
    }
  }

  /**
   * Poll the directory: emit one C1 event per changed/created file. `nowMs` is the observation time
   * (inject for deterministic tests). Updates the baseline so the next poll is incremental.
   */
  async poll(dir: string, nowMs: number): Promise<TelemetryEvent[]> {
    const files = await this.listFiles(dir);
    const elapsedSec = this.lastPollMs === null ? 1 : Math.max(0.001, (nowMs - this.lastPollMs) / 1000);
    const events: TelemetryEvent[] = [];
    const changed: { path: string; before: Snap | null; after: Uint8Array }[] = [];

    for (const p of files) {
      const after = new Uint8Array(await readFile(p));
      const before = this.snap.get(p) ?? null;
      if (before && before.bytes.length === after.length && eq(before.bytes, after)) continue; // unchanged
      changed.push({ path: p, before, after });
    }

    const writesPerSec = changed.length / elapsedSec;
    const typesTouched = new Set<string>();
    for (const c of changed) typesTouched.add(c.before?.type ?? inferType(c.after));

    for (const c of changed) {
      const isCanary = this.canaries.has(c.path);
      const prevType = c.before?.type ?? null;
      const newType = inferType(c.after);
      const entropyRead = c.before ? entropy(c.before.bytes, this.opts.windowBytes) : null; // CREATE => null
      const entropyWrite = entropy(c.after, this.opts.windowBytes);
      const headerChanged = c.before ? magicChanged(c.before.bytes, c.after) : false;
      events.push({
        schema_version: SCHEMA_VERSION,
        event_id: `agt-${this.opts.agentId}-${this.seq++}`,
        agent_id: this.opts.agentId,
        host_id: this.opts.hostId,
        emitted_at: new Date(nowMs).toISOString(),
        event_type: isCanary ? 'CANARY_TOUCHED' : c.before ? 'FILE_WRITE' : 'FILE_CREATE',
        process: { pid: null, path: null, user: null, signed: null }, // userspace: no process attribution
        file: {
          path: c.path,
          prev_type: prevType,
          new_type: newType,
          size_bytes: c.after.length,
          entropy_read: entropyRead,
          entropy_write: entropyWrite,
          header_changed: headerChanged,
          format_valid: formatValid(c.after),
        },
        canary: isCanary ? { canary_id: basename(c.path), directory: dir, operation: 'WRITE' } : null,
        op_window: {
          writes_per_sec: Math.round(writesPerSec * 100) / 100,
          renames_per_sec: 0,
          distinct_types_touched: typesTouched.size,
        },
      });
      this.snap.set(c.path, { bytes: c.after, type: newType });
    }
    this.lastPollMs = nowMs;
    return events;
  }
}

function eq(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Track which extension a path uses (the agent reports the magic-inferred type, not the extension). */
export function extOf(p: string): string {
  return extname(p).replace('.', '');
}
