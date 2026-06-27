/**
 * Gate-1 evidence generator (main-thread oracle). Runs the safe simulator + benign suite and writes the
 * manifest-conformant artifacts under reports/sim/. Run: `pnpm tsx scripts/gate1-evidence.ts`.
 * Detection SCORING (AC-DET/AC-FP) is Phase 2 — this only proves the ORACLE is built and valid.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TelemetryEvent } from '@crown/contracts';
import {
  ALL_EVASION_MODES,
  type EvasionMode,
  FAMILY_COUNT,
  FAMILY_PROFILES,
  type FileType,
  MODES_COVERED,
  createSimulator,
} from '@crown/simulator';
import {
  BENIGN_WORKLOADS,
  MetricsCollector,
  type ScenarioResult,
  evidence,
  runBenignSuite,
  writeReport,
} from '@crown/test-infra';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REP = (p: string) => join(ROOT, 'reports', 'sim', p);

async function tmp(tag: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `crown-g1-${tag}-`));
}

function cfg(dir: string, mode: EvasionMode, types: FileType[]) {
  return {
    targetDir: dir,
    mode,
    filesPerSecond: mode === 'LOW_AND_SLOW' ? 3 : 120,
    fileTypes: types,
    encryptedExtension: '.vntr',
    keepKey: true as const,
    seed: `g1-${mode}`,
    intermittentBlockBytes: 16,
  };
}

// Honest per-(mode,type) matrix: every mode is run over the SAME fixed corpus (low-entropy txt,
// CRC-protected docx/png, marker-only jpg). The "which signal catches it" columns are DERIVED from the
// real emitted telemetry, so the report cannot manufacture a favorable contrast by picking inputs.
async function modesReport() {
  const CORPUS: FileType[] = ['txt', 'docx', 'png', 'jpg'];
  const ENTROPY_FIRES = 1.0; // |entropy_write - entropy_read| >= this => entropy signal would fire
  const rows: Record<string, unknown>[] = [];
  let pass = true;
  for (const mode of ALL_EVASION_MODES) {
    for (const type of CORPUS) {
      const dir = await tmp(`${mode}-${type}`);
      const sim = createSimulator(cfg(dir, mode, [type]));
      await sim.seed(10);
      const sum = await sim.run();
      const evs = sum.events.filter((x) => x.event_type === 'FILE_WRITE');
      const avg = (f: (e: (typeof evs)[number]) => number) =>
        evs.length ? evs.reduce((a, e) => a + f(e), 0) / evs.length : 0;
      const er = avg((e) => (e.file.entropy_read ?? 0) as number);
      const ew = avg((e) => (e.file.entropy_write ?? 0) as number);
      const delta = Math.abs(ew - er);
      const formatBrokenFrac = sum.filesTouched ? sum.formatBrokenCount / sum.filesTouched : 0;
      const headerChanged = (evs[0]?.file.header_changed ?? null) as boolean | null;
      const entropyCatches = delta >= ENTROPY_FIRES;
      const formatCatchesReliably = formatBrokenFrac === 1; // every file of this type flagged
      const caughtSingleFile = entropyCatches || formatCatchesReliably;
      rows.push({
        mode,
        type,
        entropy_read: Math.round(er * 1000) / 1000,
        entropy_write: Math.round(ew * 1000) / 1000,
        entropy_delta: Math.round(delta * 1000) / 1000,
        format_broken_fraction: Math.round(formatBrokenFrac * 100) / 100,
        header_changed: headerChanged,
        writes_per_sec: (evs[0]?.op_window?.writes_per_sec ?? null) as number | null,
        entropy_signal_fires: entropyCatches,
        format_signal_fires_reliably: formatCatchesReliably,
        caught_at_single_file: caughtSingleFile,
      });
      await rm(dir, { recursive: true, force: true });
    }
  }

  // HONEST gate expectations (the report can now genuinely FAIL):
  //  - FULL/HEADER_ONLY/FIRST_4KB break format on EVERY type (magic smash) — reliable format catch.
  //  - INTERMITTENT preserves magic and breaks format RELIABLY on CRC-protected types (docx,png); on txt
  //    it is entropy-detectable; on marker-only jpg it is NOT reliably caught at the single-file level
  //    (the documented gap — caught at host level via op-frequency + the presence of CRC types).
  const get = (mode: string, type: string) => rows.find((r) => r.mode === mode && r.type === type)!;
  const checks = {
    full_breaks_format_all_types: ['txt', 'docx', 'png', 'jpg'].every(
      (t) => get('FULL', t).format_signal_fires_reliably === true
    ),
    intermittent_reliable_on_crc_types: ['docx', 'png'].every(
      (t) =>
        get('INTERMITTENT_EVERY_N_BYTES', t).format_signal_fires_reliably === true &&
        get('INTERMITTENT_EVERY_N_BYTES', t).header_changed === false
    ),
    intermittent_entropy_flat_on_crc_types: ['docx', 'png'].every(
      (t) => (get('INTERMITTENT_EVERY_N_BYTES', t).entropy_delta as number) < ENTROPY_FIRES
    ),
    intermittent_entropy_detectable_on_txt:
      get('INTERMITTENT_EVERY_N_BYTES', 'txt').entropy_signal_fires === true,
    intermittent_jpg_is_the_known_gap:
      get('INTERMITTENT_EVERY_N_BYTES', 'jpg').caught_at_single_file === false,
  };
  pass = Object.values(checks).every(Boolean);

  await writeReport(
    REP('modes.json'),
    evidence('SIM-MODES', 1, pass, {
      narrative:
        'Every mode run over the SAME fixed corpus (txt/docx/png/jpg). FULL & header/first-4KB break the ' +
        'magic on all types. INTERMITTENT keeps entropy ~flat on already-high-entropy CRC types and is ' +
        'caught ONLY by the CRC format-validation signal (entropy alone is blind); on low-entropy txt it ' +
        'IS entropy-detectable; on marker-only jpg interior corruption is NOT reliably caught at the ' +
        'single-file level — the honest gap, defended at host level by op-frequency + mixed file types.',
      checks,
      matrix: rows,
    })
  );
  return pass;
}

async function safetyReport() {
  const dir = await tmp('safe');
  const sim = createSimulator(cfg(dir, 'FULL', ['docx', 'png', 'txt']));
  await sim.seed(12);
  const before = new Map<string, Buffer>();
  for (const p of await sim.list()) before.set(p, await readFile(p));
  const sum = await sim.run();
  const { realpath } = await import('node:fs/promises');
  const root = await realpath(dir); // match the simulator's canonical (symlink-safe) root
  let contained = true;
  for (const e of sum.events) {
    const rel = relative(root, resolve(e.file.path as string));
    if (rel.startsWith('..') || isAbsolute(rel)) contained = false;
  }
  const r = await sim.restore();
  let reversible = r.allValid;
  for (const [p, original] of before) {
    if (Buffer.compare(await readFile(p), original) !== 0) reversible = false;
  }
  // Source scan: no network / child-process imports in the simulator package.
  const srcDir = join(ROOT, 'packages', 'simulator', 'src');
  const { readdir } = await import('node:fs/promises');
  const forbidden = ['net', 'http', 'https', 'dgram', 'tls', 'child_process'];
  let netClean = true;
  for (const f of await readdir(srcDir)) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
    const src = await readFile(join(srcDir, f), 'utf8');
    const specs = [...src.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)].map((m) => (m[1] ?? '').replace(/^node:/, ''));
    if (specs.some((s) => forbidden.includes(s)) || /\bfetch\s*\(/.test(src)) netClean = false;
  }
  const pass = contained && reversible && netClean;
  await writeReport(
    REP('safety.json'),
    evidence('SIM-SAFE', 1, pass, { contained, reversible, netClean, restored: r.restored, filesTouched: sum.filesTouched })
  );
  await rm(dir, { recursive: true, force: true });
  return pass;
}

async function coverageReport() {
  const pass = FAMILY_COUNT >= 20 && MODES_COVERED >= 4;
  await writeReport(
    REP('coverage.json'),
    evidence('SIM-COVERAGE', 1, pass, {
      families: FAMILY_COUNT,
      modes: MODES_COVERED,
      evasion_modes: ALL_EVASION_MODES,
      family_names: FAMILY_PROFILES.map((f) => f.name),
    })
  );
  return pass;
}

async function benignReport() {
  const dir = await tmp('benign');
  const runs = await runBenignSuite(dir);
  let allValid = true;
  let allBenign = true;
  const rows = runs.map((r) => {
    for (const e of r.events) {
      if (!TelemetryEvent.safeParse(e).success) allValid = false;
      if (e.canary !== null) allBenign = false;
    }
    return { workload: r.workload, events: r.events.length, requiresAllowlist: r.requiresAllowlist };
  });
  const pass = allValid && allBenign && runs.length === 5;
  await writeReport(REP('benign.json'), evidence('BENIGN-SUITE', 1, pass, { workloads: rows, allValid, allBenign }));
  await rm(dir, { recursive: true, force: true });
  return pass;
}

async function metricsReport() {
  // The collector is validated with SYNTHETIC placeholder verdicts; real detection scoring is Phase 2.
  const m = new MetricsCollector();
  const mk = (i: number): ScenarioResult => ({
    id: `synthetic-${i}`,
    groundTruth: i % 2 ? 'ATTACK' : 'BENIGN',
    verdict: i % 2 ? 'MASS_ENCRYPTION' : 'BENIGN',
    recommendedAction: i % 2 ? 'ISOLATE_HOST' : 'MONITOR',
    mode: 'FULL',
    family: 'LockBit-3.0',
    detectLatencyMs: 800 + i,
    filesLost: 3,
  });
  for (let i = 0; i < 20; i++) m.record(mk(i));
  const summary = m.summary();
  const pass =
    summary.attacks === 10 &&
    summary.benign === 10 &&
    typeof summary.destructiveFalsePositiveRate === 'number' &&
    summary.coverageInsufficient === true; // 10 benign < floor => correctly flagged, not a fake 0%
  await writeReport(
    REP('metrics.json'),
    evidence('METRICS-VALID', 1, pass, {
      note: 'synthetic placeholder verdicts; real detection/FP scoring is Phase 2. coverageInsufficient=true here is CORRECT: 10 benign scenarios is below the rate floor.',
      summary,
    })
  );
  return pass;
}

// FIX-1 evidence: non-signal METADATA must not separate the two classes; the label must not leak.
async function separabilityReport() {
  const labels = [...FAMILY_PROFILES.map((f) => f.name), ...ALL_EVASION_MODES, ...BENIGN_WORKLOADS];
  type Ev = {
    event_id: string;
    agent_id: string;
    host_id: string;
    emitted_at: string;
    file: { path: string | null; new_type: string | null };
    process: { path: string | null; signed: boolean | null; pid: number | null; user: string | null };
  };
  const consumed: string[] = [];
  const collect = (events: Ev[]) => {
    for (const e of events)
      consumed.push(`${e.event_id} ${e.file.path ?? ''} ${e.process.path ?? ''} ${e.file.new_type ?? ''}`);
  };
  const attack: Ev[] = [];
  // NOTE: the temp dir name must NOT contain the family (it would leak the label into file.path). Use an index.
  for (const [fi, fam] of FAMILY_PROFILES.entries()) {
    const dir = await tmp(`sep-${fi}`);
    const sim = createSimulator({
      targetDir: dir,
      mode: fam.mode,
      filesPerSecond: fam.filesPerSecond,
      fileTypes: fam.fileTypes as FileType[],
      encryptedExtension: '.vntr',
      keepKey: true as const,
      seed: `fam-${fam.name}`,
      family: fam.name,
      ...(fam.blockBytes ? { intermittentBlockBytes: fam.blockBytes } : {}),
    });
    await sim.seed(4);
    const evs = (await sim.run()).events as unknown as Ev[];
    attack.push(...evs);
    collect(evs);
    await rm(dir, { recursive: true, force: true });
  }
  const bdir = await tmp('sep-benign');
  const benign = (await runBenignSuite(bdir)).flatMap((r) => r.events) as unknown as Ev[];
  collect(benign);
  await rm(bdir, { recursive: true, force: true });

  const setOf = <T>(xs: Ev[], f: (e: Ev) => T) => new Set(xs.map(f));
  const overlaps = <T>(x: Set<T>, y: Set<T>) => [...x].some((v) => y.has(v));
  const aSigned = setOf(attack, (e) => e.process.signed);
  const bSigned = setOf(benign, (e) => e.process.signed);
  const hour = (e: Ev) => e.emitted_at.slice(0, 13);
  const pidsInRange = [...attack, ...benign].every(
    (e) => (e.process.pid ?? -1) >= 4096 && (e.process.pid ?? -1) < 8192
  );

  const checks = {
    signed_both_values_both_classes:
      aSigned.has(true) && aSigned.has(false) && bSigned.has(true) && bSigned.has(false),
    process_path_overlaps: overlaps(setOf(attack, (e) => e.process.path), setOf(benign, (e) => e.process.path)),
    emitted_at_hour_overlaps: overlaps(setOf(attack, hour), setOf(benign, hour)),
    pid_same_range: pidsInRange,
    user_overlaps: overlaps(setOf(attack, (e) => e.process.user), setOf(benign, (e) => e.process.user)),
    ids_shared:
      setOf(attack, (e) => e.agent_id).size === 1 && overlaps(setOf(attack, (e) => e.agent_id), setOf(benign, (e) => e.agent_id)),
    no_label_leak: labels.filter((l) => consumed.some((c) => c.includes(l))).length === 0,
  };
  const pass = Object.values(checks).every(Boolean);
  await writeReport(
    REP('separability.json'),
    evidence('SIM-SEPARABILITY', 1, pass, {
      note: 'Non-signal METADATA (emitted_at, process.signed/path/pid/user, agent/host id, event_id) does not separate ATTACK vs BENIGN, and no ground-truth label leaks into a consumed field. SIGNAL fields (format_valid/entropy/header/type-change/op_window/canary) ARE allowed to separate — that is detection. A classifier must fuse real signals, not memorize a fiat field.',
      checks,
      attack_signed_values: [...aSigned],
      benign_signed_values: [...bSigned],
      process_path_overlap: [...setOf(attack, (e) => e.process.path)].filter((p) =>
        setOf(benign, (e) => e.process.path).has(p)
      ),
    })
  );
  return pass;
}

async function main() {
  const results = {
    'SIM-MODES': await modesReport(),
    'SIM-SAFE': await safetyReport(),
    'SIM-COVERAGE': await coverageReport(),
    'BENIGN-SUITE': await benignReport(),
    'SIM-SEPARABILITY': await separabilityReport(),
    'METRICS-VALID': await metricsReport(),
  };
  const all = Object.values(results).every(Boolean);
  // biome-ignore lint/suspicious/noConsole: evidence generator status output
  console.log(JSON.stringify({ gate: 1, results, all_pass: all }, null, 2));
  process.exit(all ? 0 : 1);
}

main().catch((e) => {
  // biome-ignore lint/suspicious/noConsole: evidence generator error output
  console.error(e);
  process.exit(1);
});
