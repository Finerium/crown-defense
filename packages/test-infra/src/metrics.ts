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

export interface MetricsSummary {
  attacks: number;
  detected: number;
  detectionRate: number;
  benign: number;
  falsePositives: number;
  falsePositiveRate: number;
  modesCovered: string[];
  familiesCovered: string[];
  filesLost: { max: number; p95: number };
  detectLatencyMs: { p50: number; p95: number };
}

export class MetricsCollector {
  private results: ScenarioResult[] = [];

  record(r: ScenarioResult): void {
    this.results.push(r);
  }

  all(): ScenarioResult[] {
    return this.results;
  }

  /** A BENIGN scenario is a false positive iff it produced a destructive recommendation. */
  static isFalsePositive(r: ScenarioResult): boolean {
    return r.groundTruth === 'BENIGN' && r.recommendedAction === 'ISOLATE_HOST';
  }

  /** An ATTACK scenario is detected iff the engine reached MASS_ENCRYPTION. */
  static isDetected(r: ScenarioResult): boolean {
    return r.groundTruth === 'ATTACK' && r.verdict === 'MASS_ENCRYPTION';
  }

  summary(): MetricsSummary {
    const attacks = this.results.filter((r) => r.groundTruth === 'ATTACK');
    const benign = this.results.filter((r) => r.groundTruth === 'BENIGN');
    const detected = attacks.filter((r) => MetricsCollector.isDetected(r));
    const fps = benign.filter((r) => MetricsCollector.isFalsePositive(r));
    const filesLost = attacks.map((r) => r.filesLost ?? 0);
    const latencies = attacks.map((r) => r.detectLatencyMs ?? 0).filter((n) => n > 0);
    return {
      attacks: attacks.length,
      detected: detected.length,
      detectionRate: attacks.length ? detected.length / attacks.length : 0,
      benign: benign.length,
      falsePositives: fps.length,
      falsePositiveRate: benign.length ? fps.length / benign.length : 0,
      modesCovered: [...new Set(attacks.map((r) => r.mode).filter((m): m is string => !!m))],
      familiesCovered: [...new Set(attacks.map((r) => r.family).filter((m): m is string => !!m))],
      filesLost: { max: filesLost.length ? Math.max(...filesLost) : 0, p95: percentile(filesLost, 95) },
      detectLatencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
    };
  }
}
