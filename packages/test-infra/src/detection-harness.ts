import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TelemetryEvent } from '@crown/contracts';
import { type DetectionConfig, DetectionEngine, loadConfig } from '@crown/detection';
import { FAMILY_PROFILES, type FamilyProfile, type FileType, SafeSimulator } from '@crown/simulator';
import { runBenignSuite } from './benign.js';
import type { ActionLabel, ScenarioResult, VerdictLabel } from './metrics.js';

/**
 * Detection grading harness (oracle side). Drives the @crown/detection engine with the Phase-1 oracle's
 * C1 telemetry and scores it against ground truth. The engine sees ONLY C1 events; the harness resolves
 * truth afterward (oracle independence). Produces ScenarioResult[] for the MetricsCollector + AC evidence.
 */

const FILE_EVENTS = new Set([
  'FILE_WRITE',
  'FILE_CREATE',
  'FILE_RENAME',
  'FILE_DELETE',
  'FILE_TYPE_CHANGED',
  'CANARY_TOUCHED',
]);

export interface DetectionRunResult {
  scenarioId: string;
  groundTruth: 'ATTACK' | 'BENIGN';
  detected: boolean;
  firstMassIndex: number | null;
  filesLost: number;
  detectLatencyMs: number | null;
  verdict: VerdictLabel;
  recommendedAction: ActionLabel;
  fastPath: boolean;
  corroboratingCount: number;
  suppressedByAllowlist: boolean;
}

/** Feed a single host's C1 stream through a fresh engine; record the detection outcome. */
export function runDetection(
  scenarioId: string,
  events: TelemetryEvent[],
  groundTruth: 'ATTACK' | 'BENIGN',
  cfg: DetectionConfig
): DetectionRunResult {
  const engine = new DetectionEngine(cfg);
  let firstMassIndex: number | null = null;
  let detVerdict: { fast_path: boolean; corroborating_count: number } | null = null;
  let peak: VerdictLabel = 'BENIGN';
  let suppressed = false;
  const RANK: Record<ActionLabel, number> = { NONE: 0, MONITOR: 1, ALERT: 2, ISOLATE_HOST: 3 };
  let peakAction: ActionLabel = 'NONE'; // the actual most-severe recommended action the engine produced
  for (let i = 0; i < events.length; i++) {
    const res = engine.ingest(events[i] as TelemetryEvent);
    const v = res.verdict.verdict;
    if (v === 'MASS_ENCRYPTION') peak = 'MASS_ENCRYPTION';
    else if (v === 'SUSPICIOUS' && peak === 'BENIGN') peak = 'SUSPICIOUS';
    const act = res.verdict.recommended_action;
    if (RANK[act] > RANK[peakAction]) peakAction = act;
    if (res.suppressedByAllowlist) suppressed = true;
    if (firstMassIndex === null && v === 'MASS_ENCRYPTION') {
      firstMassIndex = i;
      detVerdict = { fast_path: res.verdict.fast_path, corroborating_count: res.verdict.corroborating_count };
    }
  }
  let filesLost = 0;
  if (firstMassIndex !== null) {
    for (let i = 0; i <= firstMassIndex; i++) {
      if (FILE_EVENTS.has((events[i] as TelemetryEvent).event_type)) filesLost++;
    }
  }
  let detectLatencyMs: number | null = null;
  if (firstMassIndex !== null && events.length > 0) {
    detectLatencyMs =
      Date.parse((events[firstMassIndex] as TelemetryEvent).emitted_at) -
      Date.parse((events[0] as TelemetryEvent).emitted_at);
  }
  return {
    scenarioId,
    groundTruth,
    detected: firstMassIndex !== null,
    firstMassIndex,
    filesLost,
    detectLatencyMs,
    verdict: peak,
    recommendedAction: peakAction,
    fastPath: detVerdict?.fast_path ?? false,
    corroboratingCount: detVerdict?.corroborating_count ?? 0,
    suppressedByAllowlist: suppressed,
  };
}

/** Generate an attack scenario's C1 telemetry from the safe simulator (real reversible file I/O). */
export async function attackTelemetry(
  fam: FamilyProfile,
  opts: { plantCanary?: boolean; rename?: boolean; seeds?: number } = {}
): Promise<TelemetryEvent[]> {
  const dir = await mkdtemp(join(tmpdir(), 'crown-det-'));
  const sim = new SafeSimulator({
    targetDir: dir,
    mode: fam.mode,
    filesPerSecond: fam.filesPerSecond,
    fileTypes: fam.fileTypes as FileType[],
    encryptedExtension: '.vntr',
    keepKey: true,
    seed: `fam-${fam.name}`,
    family: fam.name,
    ...(opts.plantCanary ? { plantCanary: true } : {}),
    ...(opts.rename === false ? { rename: false } : {}),
    ...(fam.blockBytes ? { intermittentBlockBytes: fam.blockBytes } : {}),
  });
  await sim.seed(opts.seeds ?? 12);
  const events = (await sim.run()).events;
  await sim.restore();
  await rm(dir, { recursive: true, force: true });
  return events;
}

export interface BatteryResult {
  attacks: DetectionRunResult[];
  scenarios: ScenarioResult[];
}

/** Run the full attack battery (every family, fusion-only — no canary planted so signals must corroborate). */
export async function runAttackBattery(cfg: DetectionConfig = loadConfig()): Promise<BatteryResult> {
  const attacks: DetectionRunResult[] = [];
  const scenarios: ScenarioResult[] = [];
  for (const fam of FAMILY_PROFILES) {
    const events = await attackTelemetry(fam, { plantCanary: false });
    const r = runDetection(`atk-${fam.name}`, events, 'ATTACK', cfg);
    attacks.push(r);
    scenarios.push({
      id: r.scenarioId,
      groundTruth: 'ATTACK',
      verdict: r.verdict,
      recommendedAction: r.recommendedAction,
      fastPath: r.fastPath,
      corroboratingCount: r.corroboratingCount,
      mode: fam.mode,
      family: fam.name,
      filesLost: r.filesLost,
      ...(r.detectLatencyMs !== null ? { detectLatencyMs: r.detectLatencyMs } : {}),
    });
  }
  return { attacks, scenarios };
}

/** Run a large benign corpus (variants x 5 workloads) for a meaningful destructive-FP rate (AC-FP-01). */
export async function runBenignBattery(cfg: DetectionConfig, variants: number): Promise<BatteryResult> {
  const attacks: DetectionRunResult[] = [];
  const scenarios: ScenarioResult[] = [];
  for (let v = 0; v < variants; v++) {
    const dir = await mkdtemp(join(tmpdir(), 'crown-benbat-'));
    const runs = await runBenignSuite(dir, v);
    await rm(dir, { recursive: true, force: true });
    for (const run of runs) {
      const r = runDetection(`ben-${run.workload}-${v}`, run.events, 'BENIGN', cfg);
      attacks.push(r);
      scenarios.push({
        id: r.scenarioId,
        groundTruth: 'BENIGN',
        verdict: r.verdict,
        recommendedAction: r.recommendedAction,
        workload: run.workload,
        suppressedByAllowlist: r.suppressedByAllowlist,
      });
    }
  }
  return { attacks, scenarios };
}
