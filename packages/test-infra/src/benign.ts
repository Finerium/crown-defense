import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { TelemetryEvent } from '@crown/contracts';
import { SCHEMA_VERSION } from '@crown/contracts';
import { type FileType, SafeSimulator, generateFile, validateFormat, windowEntropy } from '@crown/simulator';

/**
 * Benign-but-suspicious workload suite — the false-positive oracle (AC-FP-01, AC-FP-02).
 *
 * These produce telemetry that LOOKS like ransomware on a single axis (high write entropy, or high op
 * frequency, or even in-place corruption for full-disk encryption) but is ground-truth BENIGN. The
 * detection engine (Phase 2) must NOT raise a destructive verdict on them: it gets there via the
 * >=2-corroborating-signal rule (high entropy alone is not enough), the format-validation signal staying
 * GREEN for real workloads, and the auditable process allow-list (AC-FP-02) for legitimate encryptors.
 */

export type BenignWorkload =
  | 'backup-agent'
  | 'compression-7zip'
  | 'video-encode'
  | 'db-maintenance'
  | 'legitimate-fde';

export interface BenignRun {
  workload: BenignWorkload;
  processPath: string;
  signed: boolean;
  /** True for legitimate-FDE: looks malicious on entropy+format, defended ONLY by the allow-list. */
  requiresAllowlist: boolean;
  events: TelemetryEvent[];
  groundTruth: { kind: 'BENIGN'; workload: BenignWorkload };
}

/** Canonical allow-list of known-good high-entropy binaries (AC-FP-02). Operator-configurable in prod. */
export const BENIGN_PROCESS_PATHS: Record<BenignWorkload, string> = {
  'backup-agent': '/usr/bin/restic',
  'compression-7zip': '/usr/bin/7z',
  'video-encode': '/usr/bin/ffmpeg',
  'db-maintenance': '/usr/lib/postgresql/17/bin/postgres',
  'legitimate-fde': '/usr/sbin/cryptsetup',
};

/** Binaries an operator allow-lists so legitimate IN-PLACE encryption is not flagged (AC-FP-02). Scoped
 *  to true in-place encryptors only — backup tools create new files and need no allow-list defense. */
export const DEFAULT_ALLOWLIST: string[] = ['/usr/sbin/cryptsetup', '/usr/bin/veracrypt'];

/** Realistic signing status — NOT a free attack/benign discriminator: legitimate tooling is often an
 *  unsigned portable/static build (7-Zip, static ffmpeg), and attackers run signed LOLBins. */
export const BENIGN_PROCESS_SIGNED: Record<BenignWorkload, boolean> = {
  'backup-agent': true,
  'compression-7zip': false, // portable/unsigned build is common
  'video-encode': false, // static ffmpeg build is frequently unsigned
  'db-maintenance': true,
  'legitimate-fde': true,
};

const BASE = Date.parse('2026-06-28T01:00:00.000Z');

function ev(p: {
  i: number;
  workload: BenignWorkload;
  type: TelemetryEvent['event_type'];
  filePath: string;
  prevType: string;
  newType: string;
  size: number;
  entropyRead: number | null;
  entropyWrite: number | null;
  formatValid: boolean | null;
  headerChanged: boolean | null;
  writesPerSec: number;
  renamesPerSec: number;
  distinctTypes: number;
}): TelemetryEvent {
  return {
    schema_version: SCHEMA_VERSION,
    event_id: `benign-${p.workload}-${p.i}`,
    agent_id: 'agent-sim-001',
    host_id: 'host-sim-001',
    emitted_at: new Date(BASE + p.i * 40).toISOString(),
    event_type: p.type,
    // One stable pid per workload run; signing varies realistically (see BENIGN_PROCESS_SIGNED).
    process: {
      pid: 4200 + BENIGN_WORKLOADS.indexOf(p.workload),
      path: BENIGN_PROCESS_PATHS[p.workload],
      user: 'svc',
      signed: BENIGN_PROCESS_SIGNED[p.workload],
    },
    file: {
      path: p.filePath,
      prev_type: p.prevType,
      new_type: p.newType,
      size_bytes: p.size,
      entropy_read: p.entropyRead === null ? null : round(p.entropyRead),
      entropy_write: p.entropyWrite === null ? null : round(p.entropyWrite),
      header_changed: p.headerChanged,
      format_valid: p.formatValid,
    },
    canary: null, // benign workloads never touch canaries
    op_window: {
      writes_per_sec: p.writesPerSec,
      renames_per_sec: p.renamesPerSec,
      distinct_types_touched: p.distinctTypes,
    },
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Backup agent: creates NEW high-entropy archive files (no in-place overwrite => no entropy delta). */
async function backupAgent(dir: string, n: number): Promise<BenignRun> {
  const out = resolve(dir, 'backup');
  await mkdir(out, { recursive: true });
  const events: TelemetryEvent[] = [];
  for (let i = 0; i < n; i++) {
    const archive = generateFile('docx', 8000, 500 + i); // valid compressed archive (high entropy)
    const path = join(out, `snapshot_${i}.docx`);
    await writeFile(path, archive);
    events.push(
      ev({
        i,
        workload: 'backup-agent',
        type: 'FILE_CREATE',
        filePath: path,
        prevType: 'docx',
        newType: 'docx',
        size: archive.length,
        entropyRead: null, // newly created — no prior content at the offset
        entropyWrite: windowEntropy(archive),
        formatValid: validateFormat('docx', archive), // stays valid
        headerChanged: false,
        writesPerSec: 25,
        renamesPerSec: 0,
        distinctTypes: 1,
      })
    );
  }
  return run('backup-agent', events, false);
}

/** 7-Zip: reads many, writes ONE valid archive. High entropy, low op-frequency. */
async function compression(dir: string): Promise<BenignRun> {
  const out = resolve(dir, 'archive.docx');
  const archive = generateFile('docx', 60000, 9);
  await mkdir(dir, { recursive: true });
  await writeFile(out, archive);
  const e = ev({
    i: 0,
    workload: 'compression-7zip',
    type: 'FILE_CREATE',
    filePath: out,
    prevType: 'docx',
    newType: 'docx',
    size: archive.length,
    entropyRead: null,
    entropyWrite: windowEntropy(archive),
    formatValid: validateFormat('docx', archive),
    headerChanged: false,
    writesPerSec: 2,
    renamesPerSec: 0,
    distinctTypes: 1,
  });
  return run('compression-7zip', [e], false);
}

/** Video encode: writes ONE growing high-entropy file. Entropy is MEASURED from the real bytes; mp4 has
 *  no structural validator so format_valid is null (honest "not validated"), never stamped true. */
async function videoEncode(dir: string): Promise<BenignRun> {
  const out = resolve(dir, 'render.mp4');
  const body = generateFile('png', 120000, 3); // real high-entropy payload; measured, not asserted
  await mkdir(dir, { recursive: true });
  await writeFile(out, body);
  const entropy = windowEntropy(body); // measured
  const events: TelemetryEvent[] = [];
  for (let i = 0; i < 4; i++) {
    events.push(
      ev({
        i,
        workload: 'video-encode',
        type: 'FILE_WRITE',
        filePath: out,
        prevType: 'mp4',
        newType: 'mp4',
        size: body.length,
        entropyRead: i === 0 ? null : entropy, // overwriting already-high-entropy media => ~flat delta
        entropyWrite: entropy,
        formatValid: null, // mp4 not validated by the oracle => unknown, NOT a stamped pass
        headerChanged: false,
        writesPerSec: 6,
        renamesPerSec: 0,
        distinctTypes: 1,
      })
    );
  }
  return run('video-encode', events, false);
}

/** DB maintenance (VACUUM): many in-place writes + renames, but data stays structured & valid. */
async function dbMaintenance(dir: string, n: number): Promise<BenignRun> {
  const out = resolve(dir, 'db');
  await mkdir(out, { recursive: true });
  const events: TelemetryEvent[] = [];
  for (let i = 0; i < n; i++) {
    const before = generateFile('csv', 6000, 1000 + i);
    const after = generateFile('csv', 6000, 2000 + i); // rewritten, still valid structured csv
    const path = join(out, `table_${i}.csv`);
    await writeFile(path, after);
    events.push(
      ev({
        i,
        workload: 'db-maintenance',
        type: i % 3 === 0 ? 'FILE_RENAME' : 'FILE_WRITE',
        filePath: path,
        prevType: 'csv',
        newType: 'csv',
        size: after.length,
        entropyRead: windowEntropy(before),
        entropyWrite: windowEntropy(after), // moderate; delta ~0
        formatValid: validateFormat('csv', after), // stays valid
        headerChanged: false,
        writesPerSec: 90, // HIGH op-frequency (the suspicious axis) — but only 1 signal
        renamesPerSec: 30,
        distinctTypes: 1,
      })
    );
  }
  return run('db-maintenance', events, false);
}

/** Legitimate full-disk encryption: in-place, high entropy, INVALID format — looks malicious. Defended
 *  ONLY by the allow-list (AC-FP-02). Uses the safe simulator's reversible transform on real files. */
async function legitimateFde(dir: string, n: number): Promise<BenignRun> {
  const out = resolve(dir, 'fde');
  const sim = new SafeSimulator({
    targetDir: out,
    mode: 'FULL',
    filesPerSecond: 40,
    fileTypes: ['txt', 'csv'] as FileType[],
    encryptedExtension: '.luks',
    keepKey: true,
    seed: 'fde',
    rename: false,
  });
  await sim.seed(n);
  const sum = await sim.run();
  // Re-label the simulator telemetry as a BENIGN, ALLOW-LISTED encryptor (process + no canary).
  const events = sum.events.map((e, i) =>
    ev({
      i,
      workload: 'legitimate-fde',
      type: 'FILE_WRITE',
      filePath: e.file.path as string,
      prevType: e.file.prev_type as string,
      newType: e.file.new_type as string,
      size: e.file.size_bytes as number,
      entropyRead: e.file.entropy_read,
      entropyWrite: e.file.entropy_write,
      formatValid: e.file.format_valid as boolean, // FALSE — looks malicious
      headerChanged: e.file.header_changed as boolean, // TRUE
      writesPerSec: 40,
      renamesPerSec: 0,
      distinctTypes: 2,
    })
  );
  await sim.restore(); // prove benign/reversible
  return run('legitimate-fde', events, true);
}

function run(workload: BenignWorkload, events: TelemetryEvent[], requiresAllowlist: boolean): BenignRun {
  return {
    workload,
    processPath: BENIGN_PROCESS_PATHS[workload],
    signed: BENIGN_PROCESS_SIGNED[workload],
    requiresAllowlist,
    events,
    groundTruth: { kind: 'BENIGN', workload },
  };
}

/** Run the full benign-but-suspicious suite into `dir`. Returns one BenignRun per workload. */
export async function runBenignSuite(dir: string): Promise<BenignRun[]> {
  return [
    await backupAgent(dir, 12),
    await compression(dir),
    await videoEncode(dir),
    await dbMaintenance(dir, 20),
    await legitimateFde(dir, 8),
  ];
}

export const BENIGN_WORKLOADS: BenignWorkload[] = [
  'backup-agent',
  'compression-7zip',
  'video-encode',
  'db-maintenance',
  'legitimate-fde',
];
