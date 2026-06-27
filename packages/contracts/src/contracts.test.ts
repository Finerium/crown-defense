import { describe, expect, it } from 'vitest';
import {
  ActionRecord,
  AgentCommand,
  type DetectionSignal,
  DetectionVerdict,
  PRODUCT_NAME,
  RecoveryPlan,
  SCHEMA_VERSION,
  boundedLimit,
  classify,
  effectiveAutonomy,
  healthOverall,
  majorVersionAccepted,
  rejectionReason,
} from './index.js';

function firedSignals(n: number): DetectionSignal[] {
  const types = ['CANARY_TAMPER', 'ENTROPY_DELTA', 'OP_FREQUENCY', 'FORMAT_VALIDATION_FAIL'] as const;
  return Array.from({ length: n }, (_, i) => ({
    signal_type: types[i % types.length] as DetectionSignal['signal_type'],
    fired: true,
    score: 0.8,
    detail: 'fired',
  }));
}

const baseVerdict = {
  schema_version: SCHEMA_VERSION,
  verdict_id: 'v1',
  host_id: 'h1',
  agent_id: 'a1',
  decided_at: '2026-06-27T03:14:07.200Z',
  verdict: 'MASS_ENCRYPTION' as const,
  confidence: 0.97,
  fast_path: false,
  signals: firedSignals(2),
  corroborating_count: 2,
  recommended_action: 'ISOLATE_HOST' as const,
  evidence_ref: 'win-1',
};

describe('product + versioning', () => {
  it('exposes a single PRODUCT_NAME constant', () => {
    expect(PRODUCT_NAME).toBe('Crown Defense');
  });
  it('rejects unknown major versions', () => {
    expect(majorVersionAccepted('1.0')).toBe(true);
    expect(majorVersionAccepted('2.0')).toBe(false);
  });
});

describe('C2 corroboration invariant (AC-DET-05)', () => {
  it('accepts ISOLATE_HOST with >=2 corroborating signals', () => {
    expect(DetectionVerdict.safeParse(baseVerdict).success).toBe(true);
  });
  it('accepts ISOLATE_HOST via canary fast-path with <2 signals', () => {
    expect(
      DetectionVerdict.safeParse({
        ...baseVerdict,
        signals: firedSignals(1),
        corroborating_count: 1,
        fast_path: true,
      }).success
    ).toBe(true);
  });
  it('REJECTS ISOLATE_HOST with <2 signals and no fast-path', () => {
    expect(
      DetectionVerdict.safeParse({
        ...baseVerdict,
        signals: firedSignals(1),
        corroborating_count: 1,
        fast_path: false,
      }).success
    ).toBe(false);
  });
  it('REJECTS an INFLATED corroborating_count (count > fired signals)', () => {
    // self-reported count=2 but only 1 signal actually fired => must be rejected
    expect(
      DetectionVerdict.safeParse({ ...baseVerdict, signals: firedSignals(1), corroborating_count: 2 }).success
    ).toBe(false);
  });
});

describe('C4 dual-control invariant (AC-DIAL-02 / AC-AUDIT-05)', () => {
  const base = {
    schema_version: SCHEMA_VERSION,
    action_id: 'act1',
    chain_seq: 1,
    prev_hash: 'p',
    record_hash: 'r',
    occurred_at: '2026-06-27T03:14:07.200Z',
    incident_id: 'i1',
    host_id: 'h1',
    action_type: 'ISOLATE_HOST' as const,
    autonomy_mode: 'HUMAN_GATED' as const,
    classification: 'ASK_TO_ACT' as const,
    actor: { actor_type: 'HUMAN_OPERATOR' as const, actor_id: 'alice' },
    justification: { verdict_id: 'v1', confidence: 0.97, signals_summary: 'canary+entropy' },
    reversible: true,
    rollback_deadline: '2026-06-27T03:19:07.200Z',
    outcome: 'EXECUTED' as const,
    detail: null,
  };
  it('REJECTS executed HUMAN_GATED isolate with no approver', () => {
    expect(ActionRecord.safeParse({ ...base, approver: null }).success).toBe(false);
  });
  it('REJECTS approver identical to actor (not a SECOND approver)', () => {
    expect(
      ActionRecord.safeParse({ ...base, approver: { actor_id: 'alice', approved_at: base.occurred_at } })
        .success
    ).toBe(false);
  });
  it('accepts a distinct second approver', () => {
    expect(
      ActionRecord.safeParse({ ...base, approver: { actor_id: 'bob', approved_at: base.occurred_at } })
        .success
    ).toBe(true);
  });
});

describe('C5 dial classification + fail-safe', () => {
  it('classifies destructive actions per dial position', () => {
    expect(classify('ISOLATE_HOST', 'MONITOR_ONLY')).toBe('NEVER_AUTO');
    expect(classify('ISOLATE_HOST', 'HUMAN_GATED')).toBe('ASK_TO_ACT');
    expect(classify('ISOLATE_HOST', 'FULL_AUTO')).toBe('AUTO');
  });
  it('deny-by-default on control-plane loss (ADR-005)', () => {
    expect(effectiveAutonomy('FULL_AUTO', { controlPlaneReachable: false })).toBe('MONITOR_ONLY');
  });
  it('LLM down does NOT stop deterministic containment (AC-FAIL-01)', () => {
    expect(effectiveAutonomy('FULL_AUTO', { controlPlaneReachable: true })).toBe('FULL_AUTO');
  });
  it('health reflects degradation: LLM down => DEGRADED, CP lost => DEGRADED (AC-HEALTH-01)', () => {
    expect(healthOverall({ controlPlaneReachable: true, reasoningLayerUp: true })).toBe('HEALTHY');
    expect(healthOverall({ controlPlaneReachable: true, reasoningLayerUp: false })).toBe('DEGRADED');
    expect(healthOverall({ controlPlaneReachable: false, reasoningLayerUp: true })).toBe('DEGRADED');
  });
});

describe('C6 command authorization (AC-ACT-01)', () => {
  const cmd = {
    schema_version: SCHEMA_VERSION,
    command_id: 'c1',
    issued_at: '2026-06-27T03:14:07.200Z',
    target_agent_id: 'a1',
    target_host_id: 'h1',
    command_type: 'ISOLATE_HOST' as const,
    params: { pid: null, share_paths: null, update_ref: null },
    authorization: {
      autonomy_mode: 'FULL_AUTO' as const,
      verdict_id: 'v1',
      approver_id: null,
      requestor_id: null,
      action_record_id: 'act1',
    },
    rollback_deadline: null,
  };
  it('parses a valid command', () => {
    expect(AgentCommand.safeParse(cmd).success).toBe(true);
  });
  it('rejects destructive command in MONITOR_ONLY', () => {
    expect(
      rejectionReason({ ...cmd, authorization: { ...cmd.authorization, autonomy_mode: 'MONITOR_ONLY' } })
    ).toMatch(/not permitted/);
  });
  it('rejects HUMAN_GATED destructive without approver', () => {
    expect(
      rejectionReason({ ...cmd, authorization: { ...cmd.authorization, autonomy_mode: 'HUMAN_GATED' } })
    ).toMatch(/dual control/);
  });
  it('rejects HUMAN_GATED destructive where the approver is NOT distinct from the requestor (self-approval)', () => {
    expect(
      rejectionReason({
        ...cmd,
        authorization: {
          ...cmd.authorization,
          autonomy_mode: 'HUMAN_GATED',
          approver_id: 'analyst-1',
          requestor_id: 'analyst-1',
        },
      })
    ).toMatch(/DISTINCT/);
  });
  it('allows HUMAN_GATED destructive with a DISTINCT approver', () => {
    expect(
      rejectionReason({
        ...cmd,
        authorization: {
          ...cmd.authorization,
          autonomy_mode: 'HUMAN_GATED',
          approver_id: 'analyst-2',
          requestor_id: 'analyst-1',
        },
      })
    ).toBeNull();
  });
  it('rejects destructive in an UNRECOGNIZED mode (fail-closed allow-list)', () => {
    expect(
      rejectionReason({
        ...cmd,
        // biome-ignore lint/suspicious/noExplicitAny: deliberately exercising an out-of-enum value
        authorization: { ...cmd.authorization, autonomy_mode: 'SOMETHING_ELSE' as any },
      })
    ).toMatch(/not permitted/);
  });
  it('allows authorized FULL_AUTO command', () => {
    expect(rejectionReason(cmd)).toBeNull();
  });
});

describe('C7 recovery plan attribution (AC-LLMART-01)', () => {
  const plan = {
    schema_version: SCHEMA_VERSION,
    incident_id: 'i1',
    steps: [
      {
        order: 1,
        action: 'Isolate',
        rationale: 'stop spread',
        playbook_ref: 'NIST-800-61:3.2',
        priority: 'CRITICAL' as const,
        depends_on: null,
      },
    ],
    faithfulness: { score: 0.9, passed: true },
  };
  it('accepts a plan whose every step cites the playbook', () => {
    expect(RecoveryPlan.safeParse(plan).success).toBe(true);
  });
  it('REJECTS a plan with an unattributed step', () => {
    const bad = { ...plan, steps: [{ ...plan.steps[0], playbook_ref: '' }] };
    expect(RecoveryPlan.safeParse(bad).success).toBe(false);
  });
});

describe('C10 bounded results (AC-PERF-03 / AC-DATA-01)', () => {
  it('caps page size at MAX_PAGE_SIZE', () => {
    expect(boundedLimit(10000)).toBe(200);
    expect(boundedLimit(undefined)).toBe(50);
    expect(boundedLimit(25)).toBe(25);
  });
});
