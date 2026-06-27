/**
 * @crown/test-infra — build-time test oracles + evidence tooling (Phase 1). NOT shipped to the bank.
 * The benign-but-suspicious workload suite (FP oracle), the metrics collector, and the evidence report
 * generator. Once frozen, these are TEST ORACLES: worker subagents are hook-denied from writing them.
 */
export {
  BENIGN_PROCESS_PATHS,
  BENIGN_PROCESS_SIGNED,
  BENIGN_WORKLOADS,
  type BenignRun,
  type BenignWorkload,
  DEFAULT_ALLOWLIST,
  runBenignSuite,
} from './benign.js';
export {
  type ActionLabel,
  MIN_BENIGN_FOR_RATE,
  MetricsCollector,
  type MetricsSummary,
  percentile,
  type ScenarioResult,
  type VerdictLabel,
} from './metrics.js';
export { type BlindScenario, GroundTruthRegistry } from './scenario.js';
export {
  attackTelemetry,
  type BatteryResult,
  type DetectionRunResult,
  runAttackBattery,
  runBenignBattery,
  runDetection,
} from './detection-harness.js';
export { type TestPki, genTestPki } from './pki.js';
export { type EvidenceReport, evidence, writeReport } from './report.js';
