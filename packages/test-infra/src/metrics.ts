/**
 * Metrics collector — scores detection scenarios against ground truth and computes the bank-facing
 * numbers (detection rate, false-positive rate, files-lost, detection latency). Phase 1 provides the
 * collector + report generator; Phase 2+ feed it real DetectionVerdicts to populate the AC-DET/AC-FP
 * evidence artifacts. FP is defined the bank way: a BENIGN scenario that yields a DESTRUCTIVE outcome.
 */

export type VerdictLabel = 'BENIGN' | 'SUSPICIOUS' | 'MASS_ENCRYPTION';
export type ActionLabel = 'NONE' | 'MONITOR' | 'ALERT' | 'ISOLATE_HOST';

export interface ScenarioResult {
  id: string;
  groundTruth: 'ATTACK' | 'BENIGN';
  verdict: VerdictLabel;
  recommendedAction: ActionLabel;
  fastPath?: boolean;
  corroboratingCount?: number;
  mode?: string; // evasion mode (attacks)
  family?: string | null;
  workload?: string; // benign workload
  filesLost?: number;
  detectLatencyMs?: number;
  suppressedByAllowlist?: boolean;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx] as number;
}

/** Minimum benign decisions before a measured false-positive RATE is meaningful evidence (AC-FP-01 is a
 *  <=0.5% rate; a 0% over a handful of scenarios is not the same claim). Below this, the rate is flagged. */
export const MIN_BENIGN_FOR_RATE = 200;

export interface MetricsSummary {
  attacks: number;
  detected: number;
  detectionRate: number;
  benign: number;
  /** BENIGN scenarios that produced a DESTRUCTIVE recommendation (the bank-critical FP). */
  falsePositives: number;
  destructiveFalsePositiveRate: number;
  /** BENIGN scenarios wrongly VERDICTED MASS_ENCRYPTION even if action-gated below destructive. */
  benignMisclassifications: number;
  benignMisclassificationRate: number;
  /** BENIGN in-place encryptors correctly suppressed by the allow-list (AC-FP-02 evidence). */
  allowlistSuppressions: number;
  /** True when benign sample count is below MIN_BENIGN_FOR_RATE — the rate is NOT yet load-bearing. */
  coverageInsufficient: boolean;
  modesCovered: string[];
  familiesCovered: string[];
  filesLost: { max: number; p95: number };
  /** Latency over DETECTED attacks only (undetected attacks have no detection latency). */
  detectLatencyMs: { p50: number; p95: number; n: number };
}

export class MetricsCollector {
  private results: ScenarioResult[] = [];

  record(r: ScenarioResult): void {
    this.results.push(r);
  }

  all(): ScenarioResult[] {
    return this.results;
  }

  /** A BENIGN scenario is a (destructive) false positive iff it produced a destructive recommendation. */
  static isFalsePositive(r: ScenarioResult): boolean {
    return r.groundTruth === 'BENIGN' && r.recommendedAction === 'ISOLATE_HOST';
  }

  /** A BENIGN scenario is misclassified iff verdicted MASS_ENCRYPTION, even if action-gated below destructive. */
  static isBenignMisclassified(r: ScenarioResult): boolean {
    return r.groundTruth === 'BENIGN' && r.verdict === 'MASS_ENCRYPTION';
  }

  /** An ATTACK scenario is detected iff the engine reached MASS_ENCRYPTION. */
  static isDetected(r: ScenarioResult): boolean {
    return r.groundTruth === 'ATTACK' && r.verdict === 'MASS_ENCRYPTION';
  }

  summary(minBenignForRate: number = MIN_BENIGN_FOR_RATE): MetricsSummary {
    const attacks = this.results.filter((r) => r.groundTruth === 'ATTACK');
    const benign = this.results.filter((r) => r.groundTruth === 'BENIGN');
    const detected = attacks.filter((r) => MetricsCollector.isDetected(r));
    const fps = benign.filter((r) => MetricsCollector.isFalsePositive(r));
    const misclass = benign.filter((r) => MetricsCollector.isBenignMisclassified(r));
    const filesLost = attacks.map((r) => r.filesLost ?? 0);
    // Detection latency is defined ONLY for detected attacks (keep genuine 0ms; do not drop via >0).
    const latencies = detected
      .map((r) => r.detectLatencyMs)
      .filter((n): n is number => typeof n === 'number');
    return {
      attacks: attacks.length,
      detected: detected.length,
      detectionRate: attacks.length ? detected.length / attacks.length : 0,
      benign: benign.length,
      falsePositives: fps.length,
      destructiveFalsePositiveRate: benign.length ? fps.length / benign.length : 0,
      benignMisclassifications: misclass.length,
      benignMisclassificationRate: benign.length ? misclass.length / benign.length : 0,
      allowlistSuppressions: benign.filter((r) => r.suppressedByAllowlist === true).length,
      coverageInsufficient: benign.length < minBenignForRate,
      modesCovered: [...new Set(attacks.map((r) => r.mode).filter((m): m is string => !!m))],
      familiesCovered: [...new Set(attacks.map((r) => r.family).filter((m): m is string => !!m))],
      filesLost: { max: filesLost.length ? Math.max(...filesLost) : 0, p95: percentile(filesLost, 95) },
      detectLatencyMs: {
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        n: latencies.length,
      },
    };
  }
}
