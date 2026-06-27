import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { entropy as agentEntropy, formatValid as agentFormatValid, inferType } from '@crown/agent';
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
  | 'legitimate-fde'
  // FP-prone classes the adversarial review flagged — these reach 2-3 CONTEXT signals and must NOT isolate:
  | 'format-converter' // png->webp batch: TYPE_HEADER_CHANGE + OP_FREQUENCY, but output stays VALID
  | 'log-compaction' // in-place gzip: ENTROPY_DELTA(low->high) + TYPE_HEADER + OP_FREQUENCY, output VALID
  | 'security-scanner'; // backup/AV READS decoys (CANARY_TOUCHED op=READ must not fire the fast-path)

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
  // A DBA maintenance/ETL script — runs via /usr/bin/python3, the SAME interpreter an attacker LOLBin
  // abuses. Deliberate exact-path overlap so process.path is a weak signal, never a free class separator.
  'db-maintenance': '/usr/bin/python3',
  'legitimate-fde': '/usr/sbin/cryptsetup',
  'format-converter': '/usr/bin/convert', // ImageMagick
  'log-compaction': '/usr/bin/gzip',
  'security-scanner': '/usr/bin/clamscan',
};

/** FNV-1a hash of a string. */
function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** Opaque numeric id — event_id must not encode the workload label. */
function opaque(s: string): string {
  return fnv(s).toString(36);
}

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
  'format-converter': true,
  'log-compaction': true,
  'security-scanner': true,
};

// SAME base instant as the attack clock (simulator default) — emitted_at must NOT separate the two classes
// (it is a fixture timestamp, not a signal; a real detector keys on rates/deltas, never absolute time).
const BASE = Date.parse('2026-06-28T00:00:00.000Z');

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
  // A benign scanner READS decoys — a READ must never fire the destructive fast-path (review HIGH).
  canaryOp?: 'READ' | 'WRITE' | 'RENAME' | 'DELETE';
}): TelemetryEvent {
  return {
    schema_version: SCHEMA_VERSION,
    // Opaque id, same `evt-<base36>-<seq>` shape as attack events — never encodes the workload label.
    event_id: `evt-${opaque(p.workload)}-${p.i}`,
    agent_id: 'agent-sim-001',
    host_id: 'host-sim-001',
    emitted_at: new Date(BASE + p.i * 40).toISOString(),
    event_type: p.type,
    // One stable pid per workload run, drawn from the SAME 4096..8191 hashed range as attack pids
    // (simulator uses 4096 + h%4096) so pid distributions overlap and pid is not a free class separator.
    process: {
      pid: 4096 + (fnv(p.workload) % 4096),
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
    canary: p.canaryOp ? { canary_id: `decoy-${p.i}`, directory: '/protected', operation: p.canaryOp } : null,
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

// Deterministic high-entropy noise (no Math.random) for benign container bodies.
function noise(seed: number, n: number): Uint8Array {
  const b = new Uint8Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    b[i] = (s >>> 24) & 0xff;
  }
  return b;
}
/** A structurally-valid RIFF/WEBP file (recognized benign container — high entropy, but NOT ciphertext). */
function webpBytes(seed: number, bodyLen = 8000): Uint8Array {
  const out = new Uint8Array(12 + bodyLen);
  out.set([0x52, 0x49, 0x46, 0x46], 0); // 'RIFF'
  out.set([0x57, 0x45, 0x42, 0x50], 8); // 'WEBP'
  out.set(noise(seed, bodyLen), 12);
  return out;
}
/** A compressed file with a recognized magic. Rotates gzip/zstd/lz4 so the corpus exercises multiple
 *  benign compression formats (incl. the ones a too-narrow magic table would mis-flag as ciphertext). */
function compressedBytes(seed: number, fmt: number, bodyLen = 6000): Uint8Array {
  const magics = [
    [0x1f, 0x8b], // gzip
    [0x28, 0xb5, 0x2f, 0xfd], // zstd
    [0x04, 0x22, 0x4d, 0x18], // lz4
  ];
  const magic = magics[fmt % magics.length] as number[];
  const out = new Uint8Array(magic.length + bodyLen);
  out.set(magic, 0);
  out.set(noise(seed, bodyLen), magic.length);
  return out;
}

/** Backup agent: creates NEW high-entropy archive files (no in-place overwrite => no entropy delta). */
async function backupAgent(dir: string, n: number, variant = 0): Promise<BenignRun> {
  const out = resolve(dir, 'backup');
  await mkdir(out, { recursive: true });
  const events: TelemetryEvent[] = [];
  for (let i = 0; i < n; i++) {
    const archive = generateFile('docx', 8000, 500 + i + variant * 1000); // valid compressed archive
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
async function compression(dir: string, variant = 0): Promise<BenignRun> {
  const out = resolve(dir, 'archive.docx');
  const archive = generateFile('docx', 60000, 9 + variant * 1000);
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
async function videoEncode(dir: string, variant = 0): Promise<BenignRun> {
  const out = resolve(dir, 'render.mp4');
  const body = generateFile('png', 120000, 3 + variant * 1000); // real high-entropy payload; measured
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
async function dbMaintenance(dir: string, n: number, variant = 0): Promise<BenignRun> {
  const out = resolve(dir, 'db');
  await mkdir(out, { recursive: true });
  const events: TelemetryEvent[] = [];
  for (let i = 0; i < n; i++) {
    const before = generateFile('csv', 6000, 1000 + i + variant * 1000);
    const after = generateFile('csv', 6000, 2000 + i + variant * 1000); // rewritten, still valid csv
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
async function legitimateFde(dir: string, n: number, variant = 0): Promise<BenignRun> {
  const out = resolve(dir, 'fde');
  const sim = new SafeSimulator({
    targetDir: out,
    mode: 'FULL',
    filesPerSecond: 40,
    fileTypes: ['txt', 'csv'] as FileType[],
    encryptedExtension: '.luks',
    keepKey: true,
    seed: `fde-${variant}`,
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

/** Image batch conversion (png -> webp, in place): TYPE_HEADER_CHANGE + OP_FREQUENCY fire, BUT the output
 *  is a valid recognized container (no structural loss) — must NOT reach a destructive verdict. Fields are
 *  MEASURED via the agent's own validators (the product code), never stamped. */
async function formatConverter(dir: string, n: number, variant = 0): Promise<BenignRun> {
  const out = resolve(dir, 'convert');
  await mkdir(out, { recursive: true });
  const events: TelemetryEvent[] = [];
  for (let i = 0; i < n; i++) {
    const src = generateFile('png', 8000, 6000 + i + variant * 1000); // real high-entropy png
    const webp = webpBytes(6000 + i + variant * 1000);
    const path = join(out, `image_${i}.png`);
    await writeFile(path, webp); // converter overwrote the file in place with webp content
    events.push(
      ev({
        i,
        workload: 'format-converter',
        type: 'FILE_WRITE',
        filePath: path,
        prevType: inferType(src), // 'png'
        newType: inferType(webp), // 'riff' (webp)
        size: webp.length,
        entropyRead: agentEntropy(src),
        entropyWrite: agentEntropy(webp),
        formatValid: agentFormatValid(webp), // recognized container => valid
        headerChanged: true, // png magic -> riff magic
        writesPerSec: 28,
        renamesPerSec: 0,
        distinctTypes: 2,
      })
    );
  }
  return run('format-converter', events, false);
}

/** In-place log compaction (gzip): the HARDEST benign FP — entropy rises low->high, type + header change,
 *  high op-frequency (looks exactly like encryption). Saved ONLY by the output staying a VALID gzip (no
 *  structural-loss signal), which is precisely the encryption discriminator. */
async function logCompaction(dir: string, n: number, variant = 0): Promise<BenignRun> {
  const out = resolve(dir, 'logs');
  await mkdir(out, { recursive: true });
  const events: TelemetryEvent[] = [];
  for (let i = 0; i < n; i++) {
    const log = generateFile('txt', 6000, 7000 + i + variant * 1000); // low-entropy text log
    const cz = compressedBytes(7000 + i + variant * 1000, variant); // gzip / zstd / lz4 by variant
    const path = join(out, `app_${i}.log`);
    await writeFile(path, cz); // compacted in place
    events.push(
      ev({
        i,
        workload: 'log-compaction',
        type: 'FILE_WRITE',
        filePath: path,
        prevType: inferType(log), // 'text'
        newType: inferType(cz), // 'gzip' / 'zstd' / 'lz4' — all recognized => valid
        size: cz.length,
        entropyRead: agentEntropy(log), // low
        entropyWrite: agentEntropy(cz), // high => low->high rise (entropy signal fires)
        formatValid: agentFormatValid(cz), // valid recognized container => no structural-loss signal
        headerChanged: true,
        writesPerSec: 60 + (variant % 5) * 8, // perturb op-frequency across variants (genuine diversity)
        renamesPerSec: 0,
        distinctTypes: 2,
      })
    );
  }
  return run('log-compaction', events, false);
}

/** Security scanner / backup READING decoy files. A READ of a canary must NOT fire the destructive
 *  fast-path (a benign AV/backup/indexer routinely reads decoys). */
async function securityScanner(_dir: string, n: number, _variant = 0): Promise<BenignRun> {
  const events: TelemetryEvent[] = [];
  for (let i = 0; i < n; i++) {
    events.push(
      ev({
        i,
        workload: 'security-scanner',
        type: 'CANARY_TOUCHED',
        filePath: `/protected/decoy-${i}.xlsx`,
        prevType: 'xlsx',
        newType: 'xlsx',
        size: 4096,
        entropyRead: null, // a read does not rewrite content
        entropyWrite: null,
        formatValid: true, // unchanged, still valid
        headerChanged: false,
        writesPerSec: 0,
        renamesPerSec: 0,
        distinctTypes: 1,
        canaryOp: 'READ',
      })
    );
  }
  return run('security-scanner', events, false);
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

/** Run the full benign-but-suspicious suite into `dir`. `variant` shifts content so repeated runs are
 *  distinct instances (used to build a large benign corpus for a meaningful AC-FP-01 rate). */
export async function runBenignSuite(dir: string, variant = 0): Promise<BenignRun[]> {
  // Vary counts per variant so the corpus spans the op-frequency axis (genuine decision diversity).
  const j = variant % 5;
  return [
    await backupAgent(dir, 10 + j, variant),
    await compression(dir, variant),
    await videoEncode(dir, variant),
    await dbMaintenance(dir, 16 + j * 2, variant),
    await legitimateFde(dir, 6 + j, variant),
    await formatConverter(dir, 8 + j, variant),
    await logCompaction(dir, 8 + j, variant),
    await securityScanner(dir, 4 + j, variant),
  ];
}

export const BENIGN_WORKLOADS: BenignWorkload[] = [
  'backup-agent',
  'compression-7zip',
  'video-encode',
  'db-maintenance',
  'legitimate-fde',
  'format-converter',
  'log-compaction',
  'security-scanner',
];
