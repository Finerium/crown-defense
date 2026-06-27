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
import { MetricsCollector, type ScenarioResult, evidence, runBenignSuite, writeReport } from '@crown/test-infra';

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

async function modesReport() {
  const rows: Record<string, unknown>[] = [];
  let pass = true;
  for (const mode of ALL_EVASION_MODES) {
    const types: FileType[] = mode === 'FULL' ? ['txt'] : ['docx', 'png'];
    const dir = await tmp(mode);
    const sim = createSimulator(cfg(dir, mode, types));
    await sim.seed(10);
    const sum = await sim.run();
    const e = sum.events.find((x) => x.event_type === 'FILE_WRITE') ?? sum.events[0];
    const er = (e?.file.entropy_read ?? 0) as number;
    const ew = (e?.file.entropy_write ?? 0) as number;
    const delta = Math.abs(ew - er);
    const intermittentOk =
      mode !== 'INTERMITTENT_EVERY_N_BYTES' || (e?.file.header_changed === false && delta < 1.0);
    const brokeFormat = sum.formatBrokenCount === sum.filesTouched;
    const ok = brokeFormat && intermittentOk;
    if (!ok) pass = false;
    rows.push({
      mode,
      filesTouched: sum.filesTouched,
      formatBrokenCount: sum.formatBrokenCount,
      sample_event: {
        format_valid: e?.file.format_valid,
        header_changed: e?.file.header_changed,
        entropy_read: er,
        entropy_write: ew,
        entropy_delta: Math.round(delta * 1000) / 1000,
      },
      ok,
    });
    await rm(dir, { recursive: true, force: true });
  }
  await writeReport(REP('modes.json'), evidence('SIM-MODES', 1, pass, { modes: rows }));
  return pass;
}

async function safetyReport() {
  const dir = await tmp('safe');
  const sim = createSimulator(cfg(dir, 'FULL', ['docx', 'png', 'txt']));
  await sim.seed(12);
  const before = new Map<string, Buffer>();
  for (const p of await sim.list()) before.set(p, await readFile(p));
  const sum = await sim.run();
  const root = resolve(dir);
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
  const pass = summary.attacks === 10 && summary.benign === 10 && typeof summary.falsePositiveRate === 'number';
  await writeReport(
    REP('metrics.json'),
    evidence('METRICS-VALID', 1, pass, { note: 'synthetic placeholder verdicts; detection scoring is Phase 2', summary })
  );
  return pass;
}

async function main() {
  const results = {
    'SIM-MODES': await modesReport(),
    'SIM-SAFE': await safetyReport(),
    'SIM-COVERAGE': await coverageReport(),
    'BENIGN-SUITE': await benignReport(),
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
