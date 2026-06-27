import { DetectionVerdict } from '@crown/contracts';
import { DetectionEngine, loadConfig } from '@crown/detection';
import { ALL_EVASION_MODES, FAMILY_PROFILES, familyByName } from '@crown/simulator';
import { describe, expect, it } from 'vitest';
import { attackTelemetry, runAttackBattery, runBenignBattery, runDetection } from './detection-harness.js';
import { MetricsCollector } from './metrics.js';

const cfg = loadConfig({}); // 12-factor defaults
const cfgAllow = { ...cfg, allowlist: ['/usr/sbin/cryptsetup', '/usr/bin/veracrypt'] };

describe('AC-DET: detection correctness against the safe-simulator battery', () => {
  it('AC-DET-01: full encryption => MASS_ENCRYPTION verdict', async () => {
    const events = await attackTelemetry(familyByName('LockBit-3.0') as FamilyProfileT);
    const r = runDetection('full', events, 'ATTACK', cfg);
    expect(r.verdict).toBe('MASS_ENCRYPTION');
    expect(r.recommendedAction).toBe('ISOLATE_HOST');
  });

  it('AC-DET-02: intermittent detected, and FORMAT-VALIDATION is load-bearing (not entropy)', async () => {
    // Intermittent, IN-PLACE (no rename): entropy is flat, magic preserved, no type-change. The only
    // structural tell is format_valid=false. With it, detection succeeds (format + op-frequency).
    const events = await attackTelemetry(familyByName('LockFile') as FamilyProfileT, { rename: false });
    const withFormat = runDetection('intermittent', events, 'ATTACK', cfg);
    expect(withFormat.verdict).toBe('MASS_ENCRYPTION');

    // Ablate the format signal (pretend every file stayed structurally valid). Entropy is flat and there
    // is no rename/type-change, so only op-frequency remains => 1 signal => NOT a destructive verdict.
    const ablated = events.map((e) => ({ ...e, file: { ...e.file, format_valid: true } }));
    const withoutFormat = runDetection('intermittent-ablated', ablated, 'ATTACK', cfg);
    expect(withoutFormat.verdict).not.toBe('MASS_ENCRYPTION'); // proves format-validation carried it
  });

  it('AC-DET-03: low-and-slow detected within the file-loss budget (<=10)', async () => {
    for (const name of ['Medusa', 'Rhysida', 'ViceSociety']) {
      const events = await attackTelemetry(familyByName(name) as FamilyProfileT);
      const r = runDetection(`slow-${name}`, events, 'ATTACK', cfg);
      expect(r.detected).toBe(true);
      expect(r.filesLost).toBeLessThanOrEqual(10);
    }
  });

  it('AC-DET-04: canary touch => high-confidence fast-path', async () => {
    const events = await attackTelemetry(familyByName('LockBit-3.0') as FamilyProfileT, {
      plantCanary: true,
    });
    const r = runDetection('canary', events, 'ATTACK', cfg);
    expect(r.fastPath).toBe(true);
    expect(r.verdict).toBe('MASS_ENCRYPTION');
  });

  it('AC-DET-05: every ISOLATE_HOST verdict has corroborating_count>=2 OR fast_path', async () => {
    // Construct verdicts through the real engine across several families and validate the C2 invariant.
    let isolateVerdicts = 0;
    for (const fam of FAMILY_PROFILES.slice(0, 10)) {
      const events = await attackTelemetry(fam);
      const engine = new DetectionEngine(cfg);
      for (const e of events) {
        const res = engine.ingest(e);
        // Every verdict must pass the frozen C2 refine (which encodes the >=2-or-fast-path rule).
        expect(DetectionVerdict.safeParse(res.verdict).success).toBe(true);
        if (res.verdict.recommended_action === 'ISOLATE_HOST') {
          isolateVerdicts++;
          expect(res.verdict.corroborating_count >= 2 || res.verdict.fast_path).toBe(true);
        }
      }
    }
    expect(isolateVerdicts).toBeGreaterThan(0); // the invariant was actually exercised
  });

  it('AC-DET-06: battery covers >=20 families and >=4 evasion modes; detection rate reported', async () => {
    const { scenarios } = await runAttackBattery(cfg);
    const m = new MetricsCollector();
    for (const s of scenarios) m.record(s);
    const sum = m.summary();
    expect(sum.familiesCovered.length).toBeGreaterThanOrEqual(20);
    expect(sum.modesCovered.length).toBeGreaterThanOrEqual(4);
    expect(ALL_EVASION_MODES.length).toBe(5);
    // Detection rate is REPORTED, not asserted as a fixed %. We do assert the battery is strong:
    expect(sum.detectionRate).toBeGreaterThan(0.9);
  }, 30000);
});

describe('AC-FP: false positives against the benign-but-suspicious suite', () => {
  it('AC-FP-01: zero destructive false positives across a >=200 benign-decision corpus', async () => {
    const { scenarios } = await runBenignBattery(cfgAllow, 25); // 25 variants x 8 workloads = 200 scenarios
    const m = new MetricsCollector();
    for (const s of scenarios) m.record(s);
    const sum = m.summary();
    expect(sum.benign).toBeGreaterThanOrEqual(200);
    expect(sum.coverageInsufficient).toBe(false); // a MEASURED rate, not a structural zero
    expect(sum.falsePositives).toBe(0);
    expect(sum.destructiveFalsePositiveRate).toBeLessThanOrEqual(0.005);
  }, 60000);

  it('the exact review-flagged FP cases reach 2-3 CONTEXT signals but are NOT isolated', async () => {
    const { scenarios } = await runBenignBattery(cfgAllow, 1);
    for (const w of ['format-converter', 'log-compaction', 'security-scanner'] as const) {
      const s = scenarios.find((x) => x.workload === w);
      expect(s?.recommendedAction).not.toBe('ISOLATE_HOST'); // no destructive verdict on benign
      expect(s?.suppressedByAllowlist ?? false).toBe(false); // saved by the DISCRIMINATING rule, not the allow-list
    }
  }, 30000);

  it('AC-FP-02: allow-list is load-bearing — FDE suppressed WITH it, flagged WITHOUT it', async () => {
    const { scenarios: withAllow } = await runBenignBattery(cfgAllow, 1);
    const { scenarios: without } = await runBenignBattery(cfg, 1);
    const fdeWith = withAllow.find((s) => s.workload === 'legitimate-fde');
    const fdeWithout = without.find((s) => s.workload === 'legitimate-fde');
    // WITH allow-list: not a destructive action (suppressed, auditable).
    expect(fdeWith?.recommendedAction).not.toBe('ISOLATE_HOST');
    expect(fdeWith?.suppressedByAllowlist).toBe(true);
    // WITHOUT allow-list: it genuinely looks malicious and WOULD be isolated (proves the list is load-bearing).
    expect(fdeWithout?.recommendedAction).toBe('ISOLATE_HOST');
  }, 30000);
});

describe('safety regressions (adversarial-review fixes)', () => {
  const mk = (over: Partial<TelemEvent>, i: number): TelemEvent => ({
    schema_version: '1.0',
    event_id: `r-${i}`,
    agent_id: 'a',
    host_id: 'h',
    emitted_at: new Date(Date.parse('2026-06-28T00:00:00Z') + i * 100).toISOString(),
    event_type: 'FILE_WRITE',
    process: { pid: 1, path: '/evil/ransom', user: 'v', signed: false },
    file: {
      path: `/d/f${i}`,
      prev_type: 'docx',
      new_type: 'docx',
      size_bytes: 9,
      entropy_read: 7.9,
      entropy_write: 7.9,
      header_changed: false,
      format_valid: true,
    },
    canary: null,
    op_window: { writes_per_sec: 200, renames_per_sec: 0, distinct_types_touched: 1 },
    ...over,
  });

  it('a destructive verdict NEVER arises from context signals alone (op-freq + type-change, no discriminator)', () => {
    const eng = new DetectionEngine(cfg);
    let res = null;
    for (let i = 0; i < 20; i++) {
      // op-frequency (200 w/s) + type-change (docx->webp) but format stays VALID => no discriminating signal.
      res = eng.ingest(
        mk(
          {
            file: {
              path: `/d/f${i}`,
              prev_type: 'docx',
              new_type: 'webp',
              size_bytes: 9,
              entropy_read: 7.9,
              entropy_write: 7.9,
              header_changed: true,
              format_valid: true,
            },
          },
          i
        )
      );
    }
    expect(res?.verdict.recommended_action).not.toBe('ISOLATE_HOST');
  });

  it('a canary READ never fires the destructive fast-path (benign scanner)', () => {
    const eng = new DetectionEngine(cfg);
    let res = null;
    for (let i = 0; i < 10; i++) {
      res = eng.ingest(
        mk(
          {
            event_type: 'CANARY_TOUCHED',
            canary: { canary_id: `c${i}`, directory: '/p', operation: 'READ' },
          },
          i
        )
      );
    }
    expect(res?.verdict.fast_path).toBe(false);
    expect(res?.verdict.recommended_action).not.toBe('ISOLATE_HOST');
  });

  it('the allow-list cannot be ridden: a non-allow-listed attacker is isolated even amid allow-listed activity', () => {
    const eng = new DetectionEngine({ ...cfg, allowlist: ['/usr/sbin/cryptsetup'] });
    let res = null;
    for (let i = 0; i < 10; i++) {
      // attacker events from /evil/ransom with structural loss; allow-listed cryptsetup also active.
      const evil = mk(
        {
          file: {
            path: `/d/e${i}`,
            prev_type: 'docx',
            new_type: 'x',
            size_bytes: 9,
            entropy_read: 7.9,
            entropy_write: 7.99,
            header_changed: true,
            format_valid: false,
          },
        },
        i * 2
      );
      const fde = mk(
        {
          process: { pid: 2, path: '/usr/sbin/cryptsetup', user: 'v', signed: true },
          file: {
            path: `/d/g${i}`,
            prev_type: 'txt',
            new_type: 'x',
            size_bytes: 9,
            entropy_read: 2,
            entropy_write: 7.99,
            header_changed: true,
            format_valid: false,
          },
        },
        i * 2 + 1
      );
      eng.ingest(evil);
      res = eng.ingest(fde);
    }
    expect(res?.suppressedByAllowlist).toBe(false); // NOT all mutations are allow-listed => no suppression
    expect(res?.verdict.recommended_action).toBe('ISOLATE_HOST');
  });

  it('minCorroboration cannot be weakened below 2 by config (safety floor)', () => {
    expect(loadConfig({ CROWN_DET_MIN_CORROBORATION: '1' }).minCorroboration).toBe(2);
    expect(loadConfig({ CROWN_DET_MIN_CORROBORATION: '0' }).minCorroboration).toBe(2);
    expect(loadConfig({ CROWN_DET_WINDOW: '0' }).windowSize).toBeGreaterThanOrEqual(1);
  });

  it('the host map is bounded (LRU eviction) under a large/churning fleet', () => {
    const eng = new DetectionEngine({ ...cfg, maxTrackedHosts: 100 });
    for (let i = 0; i < 1000; i++) eng.ingest(mk({ host_id: `host-${i}` }, i));
    expect(eng.trackedHosts()).toBeLessThanOrEqual(100);
  });
});

// Local aliases so the test reads cleanly without importing the types by name.
type FamilyProfileT = (typeof FAMILY_PROFILES)[number];
type TelemEvent = import('@crown/contracts').TelemetryEvent;
