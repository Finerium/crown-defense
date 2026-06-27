import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TelemetryEvent } from '@crown/contracts';
import { describe, expect, it } from 'vitest';
import { BENIGN_WORKLOADS, DEFAULT_ALLOWLIST, runBenignSuite } from './benign.js';
import { MetricsCollector, type ScenarioResult, percentile } from './metrics.js';

describe('benign-but-suspicious suite (FP oracle)', () => {
  it('runs all 5 workloads and emits only contract-valid C1 telemetry', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crown-benign-'));
    const runs = await runBenignSuite(dir);
    expect(runs.map((r) => r.workload).sort()).toEqual([...BENIGN_WORKLOADS].sort());
    for (const r of runs) {
      expect(r.groundTruth.kind).toBe('BENIGN');
      expect(r.events.length).toBeGreaterThan(0);
      for (const e of r.events) {
        expect(() => TelemetryEvent.parse(e)).not.toThrow();
        expect(e.canary).toBeNull(); // benign workloads never touch canaries
        expect(typeof e.process.signed).toBe('boolean');
      }
    }
  });

  it('signing is NOT a free attack/benign discriminator (some benign workloads run unsigned)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crown-benign-'));
    const runs = await runBenignSuite(dir);
    const signedFlags = new Set(runs.map((r) => r.signed));
    // At least one benign workload is unsigned, so a detector cannot use signed=true to whitelist benign.
    expect(signedFlags.has(false)).toBe(true);
  });

  it('most workloads keep files format-valid (only legitimate-FDE corrupts, defended by allow-list)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crown-benign-'));
    const runs = await runBenignSuite(dir);
    const fde = runs.find((r) => r.workload === 'legitimate-fde');
    const others = runs.filter((r) => r.workload !== 'legitimate-fde');
    for (const r of others) {
      for (const e of r.events) expect(e.file.format_valid).not.toBe(false);
    }
    // FDE genuinely looks malicious (invalid format) and must be allow-list-defended.
    expect(fde?.requiresAllowlist).toBe(true);
    expect(fde?.events.some((e) => e.file.format_valid === false)).toBe(true);
    expect(DEFAULT_ALLOWLIST).toContain(fde?.processPath);
  });

  it('backup/compression create files (no in-place entropy delta to fire ENTROPY_DELTA)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crown-benign-'));
    const runs = await runBenignSuite(dir);
    for (const w of ['backup-agent', 'compression-7zip'] as const) {
      const r = runs.find((x) => x.workload === w);
      for (const e of r?.events ?? []) expect(e.file.entropy_read).toBeNull();
    }
  });
});

describe('metrics collector', () => {
  it('computes detection rate and FP rate against ground truth', () => {
    const m = new MetricsCollector();
    const attack = (id: string, detected: boolean): ScenarioResult => ({
      id,
      groundTruth: 'ATTACK',
      verdict: detected ? 'MASS_ENCRYPTION' : 'SUSPICIOUS',
      recommendedAction: detected ? 'ISOLATE_HOST' : 'ALERT',
      mode: 'FULL',
      family: 'LockBit-3.0',
    });
    const benign = (id: string, fp: boolean): ScenarioResult => ({
      id,
      groundTruth: 'BENIGN',
      verdict: fp ? 'MASS_ENCRYPTION' : 'BENIGN',
      recommendedAction: fp ? 'ISOLATE_HOST' : 'MONITOR',
      workload: 'backup-agent',
    });
    m.record(attack('a1', true));
    m.record(attack('a2', true));
    m.record(attack('a3', false));
    for (let i = 0; i < 199; i++) m.record(benign(`b${i}`, false));
    m.record(benign('b-bad', true));
    const s = m.summary();
    expect(s.detectionRate).toBeCloseTo(2 / 3, 5);
    expect(s.benign).toBe(200);
    expect(s.falsePositives).toBe(1);
    expect(s.destructiveFalsePositiveRate).toBeCloseTo(1 / 200, 5); // 0.5%
    expect(s.coverageInsufficient).toBe(false); // 200 benign >= floor
  });

  it('flags coverage-insufficient FP rate and counts verdict-level benign misclassification', () => {
    const m = new MetricsCollector();
    // BENIGN, verdicted MASS_ENCRYPTION but action-gated to ALERT (not destructive): a misclassification
    // that is NOT a destructive FP — must be counted separately, not hidden.
    m.record({ id: 'b1', groundTruth: 'BENIGN', verdict: 'MASS_ENCRYPTION', recommendedAction: 'ALERT' });
    const s = m.summary();
    expect(s.coverageInsufficient).toBe(true); // 1 benign < floor
    expect(s.falsePositives).toBe(0); // not destructive
    expect(s.benignMisclassifications).toBe(1); // but still a misclassification
  });

  it('percentile is correct', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([], 95)).toBe(0);
  });
});
