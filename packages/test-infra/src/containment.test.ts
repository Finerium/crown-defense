import { AgentContainment } from '@crown/agent';
import { type AuditSink, type CommandIssuer, ContainmentModule, decideContainment } from '@crown/containment';
import {
  type ActionRecord,
  type AgentCommand,
  type AgentCommandResult,
  type DetectionVerdict,
  SCHEMA_VERSION,
} from '@crown/contracts';
import { describe, expect, it } from 'vitest';

/** A valid C2 ISOLATE_HOST verdict (passes the frozen refine: corroborating_count>=2). */
function isolateVerdict(over: Partial<DetectionVerdict> = {}): DetectionVerdict {
  return {
    schema_version: SCHEMA_VERSION,
    verdict_id: 'vd-1',
    host_id: 'host-1',
    agent_id: 'agent-1',
    decided_at: '2026-06-28T00:00:00.000Z',
    verdict: 'MASS_ENCRYPTION',
    confidence: 0.8,
    fast_path: false,
    signals: [
      { signal_type: 'FORMAT_VALIDATION_FAIL', fired: true, score: 1, detail: 'invalid' },
      { signal_type: 'OP_FREQUENCY', fired: true, score: 0.5, detail: 'fast' },
    ],
    corroborating_count: 2,
    recommended_action: 'ISOLATE_HOST',
    evidence_ref: 'evt-1',
    ...over,
  };
}

/** Order-recording audit sink + command issuer (proves audit precedes the command). */
function spyDeps() {
  const order: string[] = [];
  let seq = 0;
  const audit: AuditSink = {
    async append(rec) {
      order.push(`audit:${rec.action_type}`);
      return { ...rec, chain_seq: seq++, prev_hash: '0', record_hash: 'h' } as ActionRecord;
    },
  };
  const agent = new AgentContainment('agent-1', () => '2026-06-28T00:00:00.000Z');
  const issued: AgentCommand[] = [];
  const issuer: CommandIssuer = {
    async issue(cmd) {
      order.push(`command:${cmd.command_type}`);
      issued.push(cmd);
      return agent.execute(cmd) as AgentCommandResult;
    },
  };
  return { order, audit, issuer, agent, issued };
}

const idGen = () => {
  let n = 0;
  return (p: string) => `${p}-${n++}`;
};

describe('AC-ACT: actuation authorization + audit-precedes-action', () => {
  it('AC-ACT-02: the audit record is appended BEFORE the command is issued', async () => {
    const { order, audit, issuer } = spyDeps();
    const cm = new ContainmentModule({
      audit,
      issuer,
      newId: idGen(),
      now: () => '2026-06-28T00:00:00.000Z',
    });
    const out = await cm.handleVerdict(isolateVerdict(), 'FULL_AUTO', true);
    expect(out.decision.disposition).toBe('EXECUTE');
    // two-phase: QUEUED intent (audit) precedes the command; a terminal audit record follows the result.
    expect(order.slice(0, 2)).toEqual(['audit:ISOLATE_HOST', 'command:ISOLATE_HOST']); // audit FIRST
    // the command is bound to the audit record that preceded it
    expect(out.command?.authorization.action_record_id).toBe(out.actionRecordId);
  });

  it('AC-ACT-01: a destructive command in MONITOR_ONLY is REJECTED by the agent (and auditable)', () => {
    const agent = new AgentContainment('agent-1');
    const cmd: AgentCommand = {
      schema_version: SCHEMA_VERSION,
      command_id: 'c1',
      issued_at: '2026-06-28T00:00:00.000Z',
      target_agent_id: 'agent-1',
      target_host_id: 'host-1',
      command_type: 'ISOLATE_HOST',
      params: { pid: null, share_paths: null, update_ref: null },
      authorization: {
        autonomy_mode: 'MONITOR_ONLY',
        verdict_id: 'v',
        approver_id: null,
        requestor_id: null,
        action_record_id: 'a',
      },
      rollback_deadline: null,
    };
    const r = agent.execute(cmd);
    expect(r.outcome).toBe('REJECTED');
    expect(agent.isIsolated('host-1')).toBe(false);
  });

  it('AC-ACT-01: HUMAN_GATED destructive WITHOUT a distinct approver is REJECTED (dual control)', () => {
    const agent = new AgentContainment('agent-1');
    const base: AgentCommand = {
      schema_version: SCHEMA_VERSION,
      command_id: 'c2',
      issued_at: '2026-06-28T00:00:00.000Z',
      target_agent_id: 'agent-1',
      target_host_id: 'host-1',
      command_type: 'ISOLATE_HOST',
      params: { pid: null, share_paths: null, update_ref: null },
      authorization: {
        autonomy_mode: 'HUMAN_GATED',
        verdict_id: 'v',
        approver_id: null,
        requestor_id: 'analyst-1', // the operator who requested the action
        action_record_id: 'a',
      },
      rollback_deadline: null,
    };
    expect(agent.execute(base).outcome).toBe('REJECTED'); // no approver
    // self-approval (approver == requestor) is rejected — dual control requires a DISTINCT approver
    const selfApproved = { ...base, authorization: { ...base.authorization, approver_id: 'analyst-1' } };
    expect(agent.execute(selfApproved).outcome).toBe('REJECTED');
    // a DISTINCT second approver is allowed
    const approved = { ...base, authorization: { ...base.authorization, approver_id: 'analyst-2' } };
    expect(agent.execute(approved).outcome).toBe('EXECUTED');
  });

  it('AC-CONT-04: process termination + share lockdown execute and are recorded', () => {
    const agent = new AgentContainment('agent-1');
    const mk = (t: AgentCommand['command_type'], over: Partial<AgentCommand['params']>): AgentCommand => ({
      schema_version: SCHEMA_VERSION,
      command_id: `c-${t}`,
      issued_at: '2026-06-28T00:00:00.000Z',
      target_agent_id: 'agent-1',
      target_host_id: 'host-1',
      command_type: t,
      params: { pid: null, share_paths: null, update_ref: null, ...over },
      authorization: {
        autonomy_mode: 'FULL_AUTO',
        verdict_id: 'v',
        approver_id: null,
        requestor_id: null,
        action_record_id: 'a',
      },
      rollback_deadline: null,
    });
    expect(agent.execute(mk('KILL_PROCESS', { pid: 6660 })).outcome).toBe('EXECUTED');
    expect(agent.execute(mk('LOCK_SHARES', { share_paths: ['/srv/share'] })).outcome).toBe('EXECUTED');
    expect(agent.killedCount()).toBe(1);
    expect(agent.lockedShareCount()).toBe(1);
  });
});

describe('AC-CONT-02 + fail-safe: containment persists on partition; no new destructive action', () => {
  it('isolation persists when the control plane is unreachable (agent never auto-releases)', async () => {
    const { audit, issuer, agent } = spyDeps();
    const cm = new ContainmentModule({ audit, issuer, newId: idGen() });
    await cm.handleVerdict(isolateVerdict(), 'FULL_AUTO', true); // isolate while reachable
    expect(agent.isIsolated('host-1')).toBe(true);
    // control plane drops: a new destructive verdict must NOT initiate a new action, and the existing
    // isolation must REMAIN (no auto-release).
    const out = await cm.handleVerdict(
      isolateVerdict({ host_id: 'host-2', verdict_id: 'vd-2' }),
      'FULL_AUTO',
      false
    );
    expect(out.decision.disposition).toBe('DENY_FAILSAFE');
    expect(out.command).toBeNull(); // no new destructive command issued
    expect(agent.isIsolated('host-1')).toBe(true); // existing containment maintained
    expect(agent.isIsolated('host-2')).toBe(false); // no new isolation during partition
  });

  it('the agent never self-initiates a destructive action', () => {
    const agent = new AgentContainment('a');
    expect(agent.canSelfInitiate('ISOLATE_HOST')).toBe(false);
    expect(agent.canSelfInitiate('PING')).toBe(true);
  });
});

describe('AC-DIAL behavior: the dial is built into containment', () => {
  it('each dial position yields the correct disposition for a destructive verdict', () => {
    const v = isolateVerdict();
    expect(decideContainment(v, 'MONITOR_ONLY', true).disposition).toBe('MONITOR_ONLY');
    expect(decideContainment(v, 'ALERT_RECOMMEND', true).disposition).toBe('ALERT_ONLY');
    expect(decideContainment(v, 'HUMAN_GATED', true).disposition).toBe('PROPOSE');
    expect(decideContainment(v, 'FULL_AUTO', true).disposition).toBe('EXECUTE');
    // fail-safe override regardless of configured position:
    expect(decideContainment(v, 'FULL_AUTO', false).disposition).toBe('DENY_FAILSAFE');
  });

  it('a non-destructive verdict never proposes or executes containment', () => {
    const v = isolateVerdict({
      recommended_action: 'ALERT',
      verdict: 'SUSPICIOUS',
      corroborating_count: 1,
      signals: [{ signal_type: 'OP_FREQUENCY', fired: true, score: 0.5, detail: 'x' }],
    });
    expect(decideContainment(v, 'FULL_AUTO', true).disposition).toBe('ALERT_ONLY');
    expect(decideContainment(v, 'MONITOR_ONLY', true).disposition).toBe('MONITOR_ONLY');
  });
});

describe('AC-CONT-01: containment pipeline latency p95 < 10s', () => {
  it('verdict -> bound audit record -> issued command completes fast (in-process build pipeline)', async () => {
    const lat: number[] = [];
    for (let i = 0; i < 200; i++) {
      const { audit, issuer } = spyDeps();
      const cm = new ContainmentModule({ audit, issuer, newId: idGen() });
      const t0 = performance.now();
      await cm.handleVerdict(isolateVerdict({ verdict_id: `vd-${i}`, host_id: `h-${i}` }), 'FULL_AUTO', true);
      lat.push(performance.now() - t0);
    }
    lat.sort((a, b) => a - b);
    const p95 = lat[Math.floor(0.95 * lat.length)] as number;
    expect(p95).toBeLessThan(10000); // 10s budget; the build pipeline is sub-millisecond
  });
});

describe('control-plane review fixes: endpoint hardening', () => {
  it('target binding: a command addressed to a DIFFERENT agent is rejected', () => {
    const agent = new AgentContainment('agent-1');
    const cmd: AgentCommand = {
      schema_version: SCHEMA_VERSION,
      command_id: 'c',
      issued_at: '2026-06-28T00:00:00.000Z',
      target_agent_id: 'some-other-agent',
      target_host_id: 'host-1',
      command_type: 'ISOLATE_HOST',
      params: { pid: null, share_paths: null, update_ref: null },
      authorization: {
        autonomy_mode: 'FULL_AUTO',
        verdict_id: 'v',
        approver_id: null,
        requestor_id: null,
        action_record_id: 'a',
      },
      rollback_deadline: null,
    };
    expect(agent.execute(cmd).outcome).toBe('REJECTED');
    expect(agent.isIsolated('host-1')).toBe(false);
  });

  it('audit-record verifiability: a destructive command bound to an UNRESOLVABLE record is rejected', () => {
    const agent = new AgentContainment('agent-1', undefined, { auditVerifier: (id) => id === 'real-record' });
    const mk = (recId: string): AgentCommand => ({
      schema_version: SCHEMA_VERSION,
      command_id: `c-${recId}`,
      issued_at: '2026-06-28T00:00:00.000Z',
      target_agent_id: 'agent-1',
      target_host_id: 'host-1',
      command_type: 'ISOLATE_HOST',
      params: { pid: null, share_paths: null, update_ref: null },
      authorization: {
        autonomy_mode: 'FULL_AUTO',
        verdict_id: 'v',
        approver_id: null,
        requestor_id: null,
        action_record_id: recId,
      },
      rollback_deadline: null,
    });
    expect(agent.execute(mk('fabricated')).outcome).toBe('REJECTED'); // record does not resolve
    expect(agent.execute(mk('real-record')).outcome).toBe('EXECUTED'); // record resolves
  });

  it('the containment boundary rejects a verdict that fails the C2 invariant (defense in depth)', async () => {
    const order: string[] = [];
    let seq = 0;
    const audit: AuditSink = {
      async append(rec) {
        return { ...rec, chain_seq: seq++, prev_hash: '0', record_hash: 'h' } as ActionRecord;
      },
    };
    const issuer: CommandIssuer = {
      async issue(cmd) {
        order.push('command');
        return {
          schema_version: SCHEMA_VERSION,
          command_id: cmd.command_id,
          agent_id: cmd.target_agent_id,
          completed_at: '2026-06-28T00:00:00.000Z',
          outcome: 'EXECUTED',
          reason: null,
        };
      },
    };
    const cm = new ContainmentModule({ audit, issuer });
    // ISOLATE_HOST recommended but only 1 corroborating signal and no fast-path => violates C2.
    const bad = {
      ...isolateVerdict(),
      corroborating_count: 1,
      fast_path: false,
      signals: [{ signal_type: 'OP_FREQUENCY' as const, fired: true, score: 0.5, detail: 'x' }],
    };
    const out = await cm.handleVerdict(bad as DetectionVerdict, 'FULL_AUTO', true);
    expect(out.decision.disposition).not.toBe('EXECUTE'); // not actioned
    expect(out.command).toBeNull();
    expect(order).toEqual([]); // no command ever issued
  });
});
