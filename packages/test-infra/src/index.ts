/**
 * @crown/test-infra — build-time test oracles + evidence tooling (Phase 1). NOT shipped to the bank.
 * The benign-but-suspicious workload suite (FP oracle), the metrics collector, and the evidence report
 * generator. Once frozen, these are TEST ORACLES: worker subagents are hook-denied from writing them.
 */
export {
  BENIGN_PROCESS_PATHS,
  BENIGN_WORKLOADS,
  type BenignRun,
  type BenignWorkload,
  DEFAULT_ALLOWLIST,
  runBenignSuite,
} from './benign.js';
export {
  type ActionLabel,
  MetricsCollector,
  type MetricsSummary,
  percentile,
  type ScenarioResult,
  type VerdictLabel,
} from './metrics.js';
export { type EvidenceReport, evidence, writeReport } from './report.js';
