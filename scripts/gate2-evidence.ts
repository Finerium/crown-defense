/**
 * Gate-2 evidence generator (main-thread oracle). Runs the @crown/detection engine against the Phase-1
 * safe-simulator battery + benign suite and writes manifest-conformant AC-DET/AC-FP artifacts.
 * Run: `pnpm tsx scripts/gate2-evidence.ts`. The engine decides ONLY from C1 (oracle independence).
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DetectionVerdict } from '@crown/contracts';
import { DetectionEngine, loadConfig } from '@crown/detection';
import { ALL_EVASION_MODES, FAMILY_PROFILES, familyByName } from '@crown/simulator';
import {
  MetricsCollector,
  attackTelemetry,
  evidence,
  runAttackBattery,
  runBenignBattery,
  runDetection,
  writeReport,
} from '@crown/test-infra';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REP = (p: string) => resolve(ROOT, 'reports', p);
const cfg = loadConfig({});
const cfgAllow = { ...cfg, allowlist: ['/usr/sbin/cryptsetup', '/usr/bin/veracrypt'] };

async function main() {
  // Run the full attack battery once; reuse for AC-DET-01/05/06.
  const battery = await runAttackBattery(cfg);
  const m = new MetricsCollector();
  for (const s of battery.scenarios) m.record(s);
  const sum = m.summary();

  // AC-DET-01: full-encryption families => MASS_ENCRYPTION.
  const fullFams = FAMILY_PROFILES.filter((f) => f.mode === 'FULL').map((f) => f.name);
  const fullResults = battery.scenarios.filter((s) => fullFams.includes(s.family as string));
  const ac01 = fullResults.every((s) => s.verdict === 'MASS_ENCRYPTION');
  await writeReport(
    REP('detection/full.json'),
    evidence('AC-DET-01', 2, ac01, {
      families: fullFams,
      all_detected: ac01,
      results: fullResults.map((s) => ({ family: s.family, verdict: s.verdict, filesLost: s.filesLost })),
    })
  );

  // AC-DET-02: intermittent detected AND format-validation load-bearing (ablation, in-place).
  const intermFams = FAMILY_PROFILES.filter((f) => f.mode === 'INTERMITTENT_EVERY_N_BYTES');
  const intermRows: Record<string, unknown>[] = [];
  let ac02 = intermFams.length > 0;
  for (const fam of intermFams) {
    const events = await attackTelemetry(fam, { rename: false }); // in-place: no type-change, entropy flat
    const withFormat = runDetection(`i-${fam.name}`, events, 'ATTACK', cfg);
    const ablated = events.map((e) => ({ ...e, file: { ...e.file, format_valid: true } }));
    const withoutFormat = runDetection(`ia-${fam.name}`, ablated, 'ATTACK', cfg);
    const ok = withFormat.verdict === 'MASS_ENCRYPTION' && withoutFormat.verdict !== 'MASS_ENCRYPTION';
    if (!ok) ac02 = false;
    intermRows.push({
      family: fam.name,
      detected_with_format: withFormat.verdict === 'MASS_ENCRYPTION',
      detected_without_format: withoutFormat.verdict === 'MASS_ENCRYPTION',
      format_load_bearing: ok,
    });
  }
  await writeReport(
    REP('detection/intermittent.json'),
    evidence('AC-DET-02', 2, ac02, {
      note: 'In-place intermittent: entropy flat, magic preserved, no type-change. Ablating format_valid removes detection => format-validation is the load-bearing signal (entropy alone is blind).',
      results: intermRows,
    })
  );

  // AC-DET-03: low-and-slow detected within the file-loss budget.
  const slowFams = FAMILY_PROFILES.filter((f) => f.mode === 'LOW_AND_SLOW');
  const slowRows: Record<string, unknown>[] = [];
  let ac03 = slowFams.length > 0;
  for (const fam of slowFams) {
    const events = await attackTelemetry(fam);
    const r = runDetection(`s-${fam.name}`, events, 'ATTACK', cfg);
    const ok = r.detected && r.filesLost <= 10;
    if (!ok) ac03 = false;
    slowRows.push({ family: fam.name, detected: r.detected, filesLost: r.filesLost, fps: fam.filesPerSecond });
  }
  await writeReport(REP('detection/low_slow.json'), evidence('AC-DET-03', 2, ac03, { results: slowRows }));

  // AC-DET-04: canary fast-path.
  const canaryEvents = await attackTelemetry(familyByName('LockBit-3.0') as FamilyProfileT, { plantCanary: true });
  const canaryRes = runDetection('canary', canaryEvents, 'ATTACK', cfg);
  const ac04 = canaryRes.fastPath && canaryRes.verdict === 'MASS_ENCRYPTION';
  await writeReport(
    REP('detection/canary.json'),
    evidence('AC-DET-04', 2, ac04, { fast_path: canaryRes.fastPath, verdict: canaryRes.verdict })
  );

  // AC-DET-05: corroboration invariant — every ISOLATE_HOST verdict satisfies >=2 OR fast_path (C2 refine).
  let isolateVerdicts = 0;
  let violations = 0;
  let parseFailures = 0;
  for (const fam of FAMILY_PROFILES) {
    const events = await attackTelemetry(fam);
    const engine = new DetectionEngine(cfg);
    for (const e of events) {
      const res = engine.ingest(e);
      if (!DetectionVerdict.safeParse(res.verdict).success) parseFailures++;
      if (res.verdict.recommended_action === 'ISOLATE_HOST') {
        isolateVerdicts++;
        if (!(res.verdict.corroborating_count >= 2 || res.verdict.fast_path)) violations++;
      }
    }
  }
  const ac05 = violations === 0 && parseFailures === 0 && isolateVerdicts > 0;
  await writeReport(
    REP('detection/corroboration.json'),
    evidence('AC-DET-05', 2, ac05, { isolate_verdicts: isolateVerdicts, violations, schema_parse_failures: parseFailures })
  );

  // AC-DET-06: coverage + reported detection rate.
  const ac06 = sum.familiesCovered.length >= 20 && sum.modesCovered.length >= 4;
  await writeReport(
    REP('detection/coverage.json'),
    evidence('AC-DET-06', 2, ac06, {
      families: sum.familiesCovered.length,
      modes: sum.modesCovered.length,
      evasion_modes: ALL_EVASION_MODES,
      detection_rate_reported: Math.round(sum.detectionRate * 1000) / 1000,
      detected: sum.detected,
      attacks: sum.attacks,
      files_lost: sum.filesLost,
      detect_latency_ms: sum.detectLatencyMs,
    })
  );

  // AC-FP-01: destructive false-positive rate over a LARGE benign corpus (40 variants x 5 = 200 scenarios).
  const benign = await runBenignBattery(cfgAllow, 40);
  const mf = new MetricsCollector();
  for (const s of benign.scenarios) mf.record(s);
  const fpSum = mf.summary();
  const ac_fp01 = fpSum.falsePositives === 0 && fpSum.destructiveFalsePositiveRate <= 0.005 && !fpSum.coverageInsufficient;
  await writeReport(
    REP('fp/benign.json'),
    evidence('AC-FP-01', 2, ac_fp01, {
      benign_scenarios: fpSum.benign,
      destructive_false_positives: fpSum.falsePositives,
      destructive_fp_rate: fpSum.destructiveFalsePositiveRate,
      benign_misclassifications: fpSum.benignMisclassifications,
      allowlist_suppressions: fpSum.allowlistSuppressions,
      coverage_insufficient: fpSum.coverageInsufficient,
    })
  );

  // AC-FP-02: allow-list load-bearing.
  const withAllow = (await runBenignBattery(cfgAllow, 2)).scenarios.filter((s) => s.workload === 'legitimate-fde');
  const without = (await runBenignBattery(cfg, 2)).scenarios.filter((s) => s.workload === 'legitimate-fde');
  const suppressed = withAllow.every((s) => s.recommendedAction !== 'ISOLATE_HOST' && s.suppressedByAllowlist);
  const flaggedWithout = without.every((s) => s.recommendedAction === 'ISOLATE_HOST');
  const ac_fp02 = suppressed && flaggedWithout;
  await writeReport(
    REP('fp/allowlist.json'),
    evidence('AC-FP-02', 2, ac_fp02, {
      with_allowlist_suppressed: suppressed,
      without_allowlist_flagged: flaggedWithout,
      note: 'Legitimate FDE genuinely looks malicious (invalid format + entropy delta); the allow-list is the load-bearing, auditable defense (AC-FP-02).',
    })
  );

  const results = {
    'AC-DET-01': ac01,
    'AC-DET-02': ac02,
    'AC-DET-03': ac03,
    'AC-DET-04': ac04,
    'AC-DET-05': ac05,
    'AC-DET-06': ac06,
    'AC-FP-01': ac_fp01,
    'AC-FP-02': ac_fp02,
  };
  const all = Object.values(results).every(Boolean);
  // biome-ignore lint/suspicious/noConsole: evidence status output
  console.log(JSON.stringify({ gate: 2, results, detection_rate: sum.detectionRate, all_pass: all }, null, 2));
  process.exit(all ? 0 : 1);
}

type FamilyProfileT = (typeof FAMILY_PROFILES)[number];

main().catch((e) => {
  // biome-ignore lint/suspicious/noConsole: evidence error output
  console.error(e);
  process.exit(1);
});
