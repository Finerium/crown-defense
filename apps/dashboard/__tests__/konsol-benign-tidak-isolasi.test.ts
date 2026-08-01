import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentContainment } from '@crown/agent';
import { type AuditSink, type CommandIssuer, ContainmentModule } from '@crown/containment';
import type { ActionRecord, AgentCommand, AutonomyMode, DetectionVerdict } from '@crown/contracts';
import { DetectionEngine, ENV_KEYS, loadConfig } from '@crown/detection';
import { DEFAULT_ALLOWLIST, runBenignSuite } from '@crown/test-infra';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The two claims the team will make on stage, tested against the REAL packages with no mock of the engine
 * and no mock of the containment module:
 *
 *   1. None of the four legitimate workloads in the console catalogue is isolated by the detection engine.
 *   2. The dial gates containment. At MONITOR_ONLY a genuine MASS_ENCRYPTION verdict issues NO containment
 *      command and the containment module's own decision says so. At FULL_AUTO the same verdict does
 *      isolate.
 *
 * If either claim is false the test fails. Nothing here is softened to keep a demo green.
 *
 * Both claims are exercised through lib/server/runner.runScenario, which is the exact code path the
 * telemetry stream runs, so a passing test is about the shipped path and not a reimplementation of it.
 */

const BENIGN_SCENARIOS = ['backup-terjadwal', 'konversi-citra', 'kompaksi-log', 'enkripsi-arsip'] as const;
const ATTACK_SCENARIO = 'rad-ws-radiologi'; // the flagship attack, canary planted

interface Captured {
  type: string;
  [k: string]: unknown;
}

/** The runner's own detection config policy, reproduced for the direct-engine cross-checks below. */
function runnerConfig() {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (!env[ENV_KEYS.allowlist]) env[ENV_KEYS.allowlist] = DEFAULT_ALLOWLIST.join(',');
  return loadConfig(env);
}

async function run(scenarioId: string, dial: AutonomyMode) {
  const { runScenario } = await import('../lib/server/runner.js');
  const events: Captured[] = [];
  const result = await runScenario(scenarioId, dial, (e) => events.push(e as unknown as Captured));
  return { events, result };
}

const pick = (events: Captured[], type: string) => events.filter((e) => e.type === type);

beforeAll(() => {
  // Remove the delivery pacing so the suite is fast. Pacing changes delivery speed only, never the data.
  process.env.CROWN_DEMO_RUN_WINDOW_MS = '0';
  process.env.CROWN_DEMO_TICK_MIN_MS = '0';
});

/* ========================================================================== */
/* CLAIM 1: no legitimate workload is isolated                                */
/* ========================================================================== */

describe('claim 1: none of the four legitimate console workloads is isolated by the real engine', () => {
  for (const scenarioId of BENIGN_SCENARIOS) {
    it(`${scenarioId}: the engine never recommends ISOLATE_HOST, and no containment command is issued`, async () => {
      // FULL_AUTO deliberately: the dial is given every chance to isolate. If a benign workload only
      // survives because the dial happened to be down, the claim is worthless.
      const { events, result } = await run(scenarioId, 'FULL_AUTO');

      const ticks = pick(events, 'tik');
      expect(ticks.length, 'the benign workload produced no telemetry at all').toBeGreaterThan(0);

      const isolating = ticks.filter((t) => t.recommendedAction === 'ISOLATE_HOST');
      expect(
        isolating.length,
        `${scenarioId} recommended ISOLATE_HOST on ${isolating.length} of ${ticks.length} events`
      ).toBe(0);

      // No command reached an agent, and nothing was executed, even at FULL_AUTO.
      for (const k of pick(events, 'kontainmen')) {
        expect(k.command, `${scenarioId} issued a containment command`).toBeNull();
        expect(k.executed, `${scenarioId} executed containment`).toBe(false);
        expect(['MONITOR_ONLY', 'ALERT_ONLY']).toContain((k.decision as Record<string, unknown>).disposition);
      }
      expect(result.summary.containmentExecuted).toBe(false);
      expect(result.summary.disposition === 'EXECUTE').toBe(false);

      // Record the ACTUAL reason from the engine's own output, not an assumed one.
      const last = ticks[ticks.length - 1] as Captured;
      const fired = (last.signals as Array<{ signal_type: string; fired: boolean }>)
        .filter((s) => s.fired)
        .map((s) => s.signal_type);
      console.log(
        `[claim 1] ${scenarioId}: verdict=${String(last.verdict)} action=${String(last.recommendedAction)} ` +
          `corroborating=${String(last.corroboratingCount)} fastPath=${String(last.fastPath)} ` +
          `firedSignals=[${fired.join(', ')}] suppressedByAllowlist=${String(last.suppressedByAllowlist)} ` +
          `reason=${String(last.suppressionReason ?? 'none, held back by signal fusion')}`
      );
    }, 120000);
  }

  it('three of the four are held back by signal fusion, and only the legitimate FDE needs the allow-list', async () => {
    // This distinguishes real detection quality from an allow-list crutch. If a scenario that is
    // supposed to be caught by fusion silently starts relying on the allow-list instead, this fails.
    const suppressed: Record<string, boolean> = {};
    for (const scenarioId of BENIGN_SCENARIOS) {
      const { events } = await run(scenarioId, 'FULL_AUTO');
      const ticks = pick(events, 'tik');
      suppressed[scenarioId] = ticks.some((t) => t.suppressedByAllowlist === true);
    }
    expect(suppressed).toEqual({
      'backup-terjadwal': false,
      'konversi-citra': false,
      'kompaksi-log': false,
      'enkripsi-arsip': true,
    });
  }, 180000);

  it('the legitimate FDE reaches a MASS_ENCRYPTION verdict and is held back ONLY by the allow-list', async () => {
    // Stated plainly because the stage claim must not overstate it: this scenario DOES produce a
    // MASS_ENCRYPTION verdict label. What is suppressed, auditably, is the destructive ACTION.
    const { events, result } = await run('enkripsi-arsip', 'FULL_AUTO');
    const putusan = pick(events, 'putusan');
    expect(putusan.length, 'enkripsi-arsip no longer reaches a MASS_ENCRYPTION verdict').toBe(1);
    const v = (putusan[0] as Captured).verdict as Record<string, unknown>;
    expect(v.verdict).toBe('MASS_ENCRYPTION');
    expect(v.recommended_action).toBe('ALERT');
    expect(result.summary.containmentExecuted).toBe(false);

    const suppressedTick = pick(events, 'tik').find((t) => t.suppressedByAllowlist === true) as Captured;
    expect(suppressedTick).toBeDefined();
    expect(String(suppressedTick.suppressionReason)).toContain('allow-listed');
    expect(String(suppressedTick.suppressionReason)).toContain('cryptsetup');
    console.log(`[claim 1] enkripsi-arsip suppression reason: ${String(suppressedTick.suppressionReason)}`);
  }, 120000);

  it('FRAGILITY: with the allow-list unset the legitimate FDE WOULD be isolated, so the seeding is load bearing', async () => {
    // The runner seeds CROWN_DET_ALLOWLIST from the FP oracle's canonical list when the operator has not
    // set one. This test pins what that seeding is actually buying, so nobody removes it by accident.
    const dir = await mkdtemp(join(tmpdir(), 'crown-fp-'));
    try {
      const runs = await runBenignSuite(dir, 0);
      const fde = runs.find((r) => r.workload === 'legitimate-fde');
      expect(fde).toBeDefined();

      const withList = new DetectionEngine(runnerConfig());
      const without = new DetectionEngine(loadConfig({ ...process.env, [ENV_KEYS.allowlist]: '' }));
      let isolatedWith = false;
      let isolatedWithout = false;
      for (const e of (fde as { events: unknown[] }).events) {
        const relabelled = { ...(e as object), host_id: 'mrh-nas-01', agent_id: 'agent-mrh-nas-01' };
        if (withList.ingest(relabelled as never).verdict.recommended_action === 'ISOLATE_HOST') {
          isolatedWith = true;
        }
        if (without.ingest(relabelled as never).verdict.recommended_action === 'ISOLATE_HOST') {
          isolatedWithout = true;
        }
      }
      expect(isolatedWith, 'with the allow-list configured the legitimate FDE must not isolate').toBe(false);
      expect(
        isolatedWithout,
        'the allow-list is no longer what defends the legitimate FDE; the reason on the scenario card is now wrong'
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);
});

/* ========================================================================== */
/* CLAIM 2: the dial gates containment                                        */
/* ========================================================================== */

describe('claim 2: the dial gates containment on a genuine destructive verdict', () => {
  it('MONITOR_ONLY: a real MASS_ENCRYPTION verdict issues NO containment command', async () => {
    const { events, result } = await run(ATTACK_SCENARIO, 'MONITOR_ONLY');

    const putusan = pick(events, 'putusan');
    expect(putusan.length, 'the attack scenario produced no destructive verdict to gate').toBe(1);
    const v = (putusan[0] as Captured).verdict as Record<string, unknown>;
    expect(v.verdict).toBe('MASS_ENCRYPTION');
    expect(v.recommended_action).toBe('ISOLATE_HOST');

    const kontainmen = pick(events, 'kontainmen');
    expect(kontainmen.length).toBe(1);
    const k = kontainmen[0] as Captured;
    const decision = k.decision as Record<string, unknown>;

    // The containment module's OWN decision, verbatim.
    expect(decision.configuredMode).toBe('MONITOR_ONLY');
    expect(decision.effectiveMode).toBe('MONITOR_ONLY');
    expect(decision.action).toBe('ISOLATE_HOST');
    expect(decision.classification).toBe('NEVER_AUTO');
    expect(decision.disposition).toBe('MONITOR_ONLY');
    expect(String(decision.reason)).toContain('NEVER_AUTO');
    console.log(`[claim 2] MONITOR_ONLY decision reason: ${String(decision.reason)}`);

    // No C6 command. Not issued, not executed, not sent to an agent.
    expect(k.command, 'a containment command was issued at MONITOR_ONLY').toBeNull();
    expect(k.executed).toBe(false);
    expect(k.outcome).toBeNull();
    expect(result.summary.containmentExecuted).toBe(false);
    expect(result.summary.disposition).toBe('MONITOR_ONLY');

    // The decision is still audited: suppression is recorded, never hidden.
    const audits = pick(events, 'audit');
    expect(audits.length).toBe(1);
    const rec = (audits[0] as Captured).record as Record<string, unknown>;
    expect(rec.action_type).toBe('RECOMMENDATION_MADE');
    expect(rec.outcome).toBe('BLOCKED');
    expect(rec.autonomy_mode).toBe('MONITOR_ONLY');
    // The audit chain must not contain a single ISOLATE_HOST record.
    expect(result.chain.some((r) => r.action_type === 'ISOLATE_HOST')).toBe(false);
  }, 120000);

  it('FULL_AUTO: the same scenario DOES isolate, and the audit record precedes the command', async () => {
    const { events, result } = await run(ATTACK_SCENARIO, 'FULL_AUTO');

    const putusan = pick(events, 'putusan');
    expect(putusan.length).toBe(1);
    const v = (putusan[0] as Captured).verdict as Record<string, unknown>;
    expect(v.verdict).toBe('MASS_ENCRYPTION');
    expect(v.recommended_action).toBe('ISOLATE_HOST');

    const k = pick(events, 'kontainmen')[0] as Captured;
    const decision = k.decision as Record<string, unknown>;
    expect(decision.configuredMode).toBe('FULL_AUTO');
    expect(decision.effectiveMode).toBe('FULL_AUTO');
    expect(decision.classification).toBe('AUTO');
    expect(decision.disposition).toBe('EXECUTE');
    console.log(`[claim 2] FULL_AUTO decision reason: ${String(decision.reason)}`);

    // A real C6 command was issued to the agent and executed.
    const command = k.command as Record<string, unknown> | null;
    expect(command, 'FULL_AUTO did not issue a containment command').not.toBeNull();
    expect((command as Record<string, unknown>).command_type).toBe('ISOLATE_HOST');
    expect((command as Record<string, unknown>).target_host_id).toBe('mrh-rad-ws-07');
    expect(k.executed).toBe(true);
    expect(k.outcome).toBe('EXECUTED');
    expect(result.summary.containmentExecuted).toBe(true);
    expect(result.summary.disposition).toBe('EXECUTE');

    // AUDIT PRECEDES ACTION: the QUEUED intent record is emitted before the containment event that
    // carries the command, and the command is bound to that record's id.
    const auditIdx = events.findIndex((e) => e.type === 'audit');
    const kontainmenIdx = events.findIndex((e) => e.type === 'kontainmen');
    expect(auditIdx).toBeGreaterThanOrEqual(0);
    expect(auditIdx).toBeLessThan(kontainmenIdx);
    const first = (events[auditIdx] as Captured).record as Record<string, unknown>;
    expect(first.action_type).toBe('ISOLATE_HOST');
    expect(first.outcome).toBe('QUEUED');
    expect((command as Record<string, unknown>).action_record_id).toBe(first.action_id);
    expect(k.actionRecordId).toBe(first.action_id);

    // Two records: the QUEUED intent, then the EXECUTED terminal.
    expect(result.chain.map((r: ActionRecord) => r.outcome)).toEqual(['QUEUED', 'EXECUTED']);
  }, 120000);

  it('the ONLY difference between the two runs is the dial: the verdict itself is identical', async () => {
    const monitor = await run(ATTACK_SCENARIO, 'MONITOR_ONLY');
    const full = await run(ATTACK_SCENARIO, 'FULL_AUTO');
    const a = (pick(monitor.events, 'putusan')[0] as Captured).verdict as Record<string, unknown>;
    const b = (pick(full.events, 'putusan')[0] as Captured).verdict as Record<string, unknown>;
    for (const field of [
      'verdict',
      'recommended_action',
      'corroborating_count',
      'fast_path',
      'confidence',
      'host_id',
      'verdict_id',
    ]) {
      expect(a[field], `the dial changed the verdict field ${field}, which it must never do`).toEqual(
        b[field]
      );
    }
    expect(JSON.stringify(a.signals)).toEqual(JSON.stringify(b.signals));
    // Same verdict, opposite outcome. That is the dial doing its job and nothing else.
    expect(monitor.result.summary.containmentExecuted).toBe(false);
    expect(full.result.summary.containmentExecuted).toBe(true);
  }, 180000);

  it('every dial position, plus control-plane loss, gated through the real ContainmentModule', async () => {
    const verdict: DetectionVerdict = (
      pick((await run(ATTACK_SCENARIO, 'MONITOR_ONLY')).events, 'putusan')[0] as Captured
    ).verdict as DetectionVerdict;

    async function gate(mode: AutonomyMode, reachable: boolean) {
      const chain: ActionRecord[] = [];
      const issued: AgentCommand[] = [];
      const audit: AuditSink = {
        async append(rec) {
          // Chain fields are stubbed: this test is about the DIAL GATE, and @crown/audit's real sealing is
          // already covered by packages/audit/src/hash-chain.test.ts. The runner-driven tests above use
          // the real sealRecord.
          const sealed = {
            ...rec,
            chain_seq: chain.length,
            prev_hash: chain.length === 0 ? null : 'prev',
            record_hash: `stub-${chain.length}`,
          } as unknown as ActionRecord;
          chain.push(sealed);
          return sealed;
        },
      };
      const agent = new AgentContainment(verdict.agent_id);
      const issuer: CommandIssuer = {
        async issue(cmd) {
          issued.push(cmd);
          return agent.execute(cmd);
        },
      };
      const out = await new ContainmentModule({ audit, issuer }).handleVerdict(verdict, mode, reachable);
      return {
        disposition: out.decision.disposition,
        commands: issued.length,
        executed: out.result?.outcome,
      };
    }

    expect(await gate('MONITOR_ONLY', true)).toEqual({
      disposition: 'MONITOR_ONLY',
      commands: 0,
      executed: undefined,
    });
    expect(await gate('ALERT_RECOMMEND', true)).toEqual({
      disposition: 'ALERT_ONLY',
      commands: 0,
      executed: undefined,
    });
    expect(await gate('HUMAN_GATED', true)).toEqual({
      disposition: 'PROPOSE',
      commands: 0,
      executed: undefined,
    });
    expect(await gate('FULL_AUTO', true)).toEqual({
      disposition: 'EXECUTE',
      commands: 1,
      executed: 'EXECUTED',
    });
    // Fail-safe: control-plane loss denies a NEW destructive action even at FULL_AUTO.
    expect(await gate('FULL_AUTO', false)).toEqual({
      disposition: 'DENY_FAILSAFE',
      commands: 0,
      executed: undefined,
    });
  }, 120000);

  it('the shipped dial default is MONITOR_ONLY when the deployment sets no override', async () => {
    const { getDial } = await import('../lib/server/store.js');
    if (process.env.CROWN_DIAL_DEFAULT === undefined) {
      expect(await getDial()).toBe('MONITOR_ONLY');
    } else {
      expect(await getDial()).toBe(process.env.CROWN_DIAL_DEFAULT);
    }
  });
});
