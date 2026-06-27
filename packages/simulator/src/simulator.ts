import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { TelemetryEvent } from '@crown/contracts';
import { SCHEMA_VERSION } from '@crown/contracts';
import { deriveKey, xorRange } from './crypto.js';
import { windowEntropy } from './entropy.js';
import { type FileType, generateFile, magicBytes, validateFormat } from './formats.js';
import { type EvasionMode, type ModeResult, applyMode } from './modes.js';

/**
 * The SAFE ransomware simulator — the primary detection oracle.
 *
 * SAFETY BOUNDARY (non-negotiable, enforced by construction):
 *   benign  · reversible (retained XOR key) · single-directory (every path is asserted under targetDir)
 *   key-retaining · non-propagating (only files it seeded) · no network, no child process.
 * It performs REAL file I/O so the Phase-2 agent can observe the same directory, and it emits the
 * ground-truth C1 telemetry stream the detection engine consumes. It NEVER touches real malware.
 */

export interface SimulatorConfig {
  targetDir: string; // single directory; the simulator never escapes it
  mode: EvasionMode;
  filesPerSecond: number; // drives the virtual emission clock (low => low writes/sec for LOW_AND_SLOW)
  fileTypes: FileType[];
  intermittentBlockBytes?: number;
  encryptedExtension: string; // e.g. '.vntr' (appended on rename; removed on restore)
  keepKey: true; // ALWAYS true — reversible by construction
  durationMs?: number; // optional cap; defaults to processing all seeded files
  seed?: string; // deterministic key + filenames + clock (reproducible oracle)
  agentId?: string;
  hostId?: string;
  family?: string; // ground-truth family label
  plantCanary?: boolean; // include a canary file; touching it emits CANARY_TOUCHED (fast-path)
  rename?: boolean; // append encryptedExtension (default true)
  clockStartMs?: number; // base for virtual emitted_at timestamps
}

export type GroundTruth =
  | { kind: 'ATTACK'; mode: EvasionMode; family: string | null }
  | { kind: 'BENIGN'; workload: string };

export interface SimulatorRunSummary {
  mode: EvasionMode;
  family: string | null;
  filesTouched: number;
  bytesRewritten: number;
  formatBrokenCount: number;
  canaryTouched: boolean;
  startedAt: string;
  endedAt: string;
  reversible: true;
  events: TelemetryEvent[];
  groundTruth: GroundTruth;
}

interface TouchedFile {
  finalPath: string; // path after optional rename
  origPath: string;
  type: FileType;
  ranges: Array<[number, number]>;
  renamed: boolean;
}

const FORBIDDEN_ESCAPE = 'targetDir containment violated';

export class SafeSimulator {
  private cfg: SimulatorConfig;
  private root: string;
  private key: Uint8Array;
  private seededFiles: Array<{ path: string; type: FileType; isCanary: boolean }> = [];
  private touched: TouchedFile[] = [];
  private events: TelemetryEvent[] = [];
  private stopped = false;
  private eventSeq = 0;

  constructor(cfg: SimulatorConfig) {
    if (cfg.keepKey !== true)
      throw new Error('keepKey must be true — the simulator is reversible by construction');
    this.cfg = cfg;
    this.root = resolve(cfg.targetDir);
    this.key = deriveKey(cfg.seed);
  }

  /** Assert a path stays inside targetDir (single-directory invariant). Throws on any escape. */
  private contain(p: string): string {
    const abs = isAbsolute(p) ? resolve(p) : resolve(this.root, p);
    const rel = relative(this.root, abs);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`${FORBIDDEN_ESCAPE}: ${p}`);
    return abs;
  }

  /** Plant `count` structurally-valid benign files (idempotent per seed). Optionally a canary that sorts first. */
  async seed(count: number): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const types = this.cfg.fileTypes.length ? this.cfg.fileTypes : (['docx'] as FileType[]);
    this.seededFiles = [];
    if (this.cfg.plantCanary) {
      // Canary name sorts first (encryptors enumerate in order); realistic type/size (ADR-010).
      const cpath = this.contain('~$canary-aaaa.docx');
      await writeFile(cpath, generateFile('docx', 6000, 99));
      this.seededFiles.push({ path: cpath, type: 'docx', isCanary: true });
    }
    for (let i = 0; i < count; i++) {
      const type = types[i % types.length] as FileType;
      const name = `data_${String(i).padStart(5, '0')}.${type}`;
      const path = this.contain(name);
      const size = 2048 + ((i * 1637) % 30000); // 2KB..32KB, deterministic
      await writeFile(path, generateFile(type, size, (this.hashSeed() + i) >>> 0));
      this.seededFiles.push({ path, type, isCanary: false });
    }
  }

  private hashSeed(): number {
    const s = this.cfg.seed ?? 'default';
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  stop(): void {
    this.stopped = true;
  }

  private clockAt(index: number): string {
    const base = this.cfg.clockStartMs ?? Date.parse('2026-06-28T00:00:00.000Z');
    const fps = Math.max(0.0001, this.cfg.filesPerSecond);
    return new Date(base + Math.round((index * 1000) / fps)).toISOString();
  }

  /** Run the simulated encryption. Emits one C1 event per file; never propagates, never networks. */
  async run(): Promise<SimulatorRunSummary> {
    const startedAt = this.clockAt(0);
    const startMs = Date.now();
    let bytesRewritten = 0;
    let formatBroken = 0;
    let canaryTouched = false;
    const renameOn = this.cfg.rename !== false;
    const ext = this.cfg.encryptedExtension.startsWith('.')
      ? this.cfg.encryptedExtension
      : `.${this.cfg.encryptedExtension}`;
    const typesTouched = new Set<string>();

    for (let i = 0; i < this.seededFiles.length; i++) {
      if (this.stopped) break;
      if (this.cfg.durationMs && Date.now() - startMs > this.cfg.durationMs) break;
      const f = this.seededFiles[i] as { path: string; type: FileType; isCanary: boolean };
      const orig = new Uint8Array(await readFile(f.path));
      const entropyRead = windowEntropy(orig);
      const magicLen = magicBytes(f.type);

      const buf = orig.slice();
      const res: ModeResult = applyMode(buf, this.key, this.cfg.mode, {
        magicLen,
        blockBytes: this.cfg.intermittentBlockBytes ?? 16,
        headerBytes: 64,
      });
      const entropyWrite = windowEntropy(buf);
      const formatValid = validateFormat(f.type, buf);
      if (!formatValid) formatBroken++;

      await writeFile(f.path, buf);
      let finalPath = f.path;
      if (renameOn) {
        finalPath = this.contain(`${relative(this.root, f.path)}${ext}`);
        await rename(f.path, finalPath);
      }
      this.touched.push({ finalPath, origPath: f.path, type: f.type, ranges: res.ranges, renamed: renameOn });
      bytesRewritten += res.ranges.reduce((a, [s, e]) => a + (e - s), 0);
      typesTouched.add(renameOn ? ext.replace('.', '') : f.type);

      const at = this.clockAt(i);
      if (f.isCanary) canaryTouched = true;
      this.events.push(
        this.event({
          at,
          type: f.isCanary ? 'CANARY_TOUCHED' : 'FILE_WRITE',
          filePath: finalPath,
          prevType: f.type,
          newType: renameOn ? ext.replace('.', '') : f.type,
          sizeBytes: buf.length,
          entropyRead,
          entropyWrite,
          headerChanged: res.headerChanged,
          formatValid,
          isCanary: f.isCanary,
          index: i,
          renameOn,
          typesTouched: typesTouched.size,
        })
      );
    }

    return {
      mode: this.cfg.mode,
      family: this.cfg.family ?? null,
      filesTouched: this.touched.length,
      bytesRewritten,
      formatBrokenCount: formatBroken,
      canaryTouched,
      startedAt,
      endedAt: this.clockAt(Math.max(0, this.touched.length - 1)),
      reversible: true,
      events: this.events,
      groundTruth: { kind: 'ATTACK', mode: this.cfg.mode, family: this.cfg.family ?? null },
    };
  }

  /** Restore every touched file from the retained key (proves benign/reversible). Verifies format validity. */
  async restore(): Promise<{ restored: number; allValid: boolean }> {
    let restored = 0;
    let allValid = true;
    for (const t of this.touched) {
      const buf = new Uint8Array(await readFile(t.finalPath));
      // XOR is its own inverse: re-apply over the same ranges with the same key => original bytes.
      for (const [s, e] of t.ranges) xorRange(buf, this.key, s, e);
      await writeFile(t.finalPath, buf);
      if (t.renamed) await rename(t.finalPath, t.origPath);
      if (!validateFormat(t.type, buf)) allValid = false;
      restored++;
    }
    return { restored, allValid };
  }

  /** Files currently present in targetDir (for tests / metrics). Bounded read. */
  async list(): Promise<string[]> {
    try {
      return (await readdir(this.root)).map((n) => join(this.root, n));
    } catch {
      return [];
    }
  }

  private event(p: {
    at: string;
    type: TelemetryEvent['event_type'];
    filePath: string;
    prevType: string;
    newType: string;
    sizeBytes: number;
    entropyRead: number;
    entropyWrite: number;
    headerChanged: boolean;
    formatValid: boolean;
    isCanary: boolean;
    index: number;
    renameOn: boolean;
    typesTouched: number;
  }): TelemetryEvent {
    const fps = Math.max(0.0001, this.cfg.filesPerSecond);
    return {
      schema_version: SCHEMA_VERSION,
      event_id: `evt-${this.cfg.seed ?? 'r'}-${this.eventSeq++}`,
      agent_id: this.cfg.agentId ?? 'agent-sim-001',
      host_id: this.cfg.hostId ?? 'host-sim-001',
      emitted_at: p.at,
      event_type: p.type,
      process: {
        pid: 6660 + (p.index % 7),
        path: `/tmp/${this.cfg.family ?? 'sim'}.bin`,
        user: 'victim',
        signed: false,
      },
      file: {
        path: p.filePath,
        prev_type: p.prevType,
        new_type: p.newType,
        size_bytes: p.sizeBytes,
        entropy_read: round(p.entropyRead),
        entropy_write: round(p.entropyWrite),
        header_changed: p.headerChanged,
        format_valid: p.formatValid,
      },
      canary: p.isCanary ? { canary_id: 'canary-aaaa', directory: this.root, operation: 'WRITE' } : null,
      op_window: {
        writes_per_sec: round(fps),
        renames_per_sec: p.renameOn ? round(fps) : 0,
        distinct_types_touched: p.typesTouched,
      },
    };
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
