import { AgentContainment } from '@crown/agent';
import { type AuditSink, type CommandIssuer, ContainmentModule } from '@crown/containment';
import {
  type ActionRecord,
  type DetectionVerdict,
  type IncidentContext,
  SCHEMA_VERSION,
} from '@crown/contracts';
import { DetectionEngine, loadConfig } from '@crown/detection';
import { LLMOrchestrator, MockLLM } from '@crown/llm';
import { familyByName } from '@crown/simulator';
import { describe, expect, it } from 'vitest';
import { attackTelemetry } from './detection-harness.js';

/**
 * Gate 6 — the full CLOSED LOOP wired end-to-end through the REAL packages, against the safe simulator:
 *   safe simulator (C1 telemetry) -> detection engine (C2 verdict) -> containment (dial-gated, audit-
 *   precedes-action, C4 record) -> LLM orchestration (C3 in, C7 out, faithfulness-gated, advisory).
 * This is the state the hackathon checkpoint requires: the loop runs end-to-end and is demonstrable.
 */

const FAITHFUL = JSON.stringify({
  summary: 'Mass-encryption confirmed; host isolated; recovery plan generated.',
  timeline: [{ phase: 'detection', description: 'format-validation failures + op-frequency' }],
  attributed_technique_ids: ['T1486'],
  citations: [
    {
      claim: 'A tripped decoy file is high-confidence evidence of mass encryption',
      playbook_ref: 'PB-CANARY',
    },
  ],
  steps: [
    {
      order: 1,
      action: 'Isolate the affected host from the network',
      rationale: 'halt the spread of encryption while preserving the host',
      playbook_ref: 'PB-CONTAIN-ISOLATE',
      priority: 'CRITICAL',
      depends_on: null,
    },
    {
      order: 2,
      action: 'Restore affected data from known-good immutable backups',
      rationale: 'recover after eradication; verify backup integrity',
      playbook_ref: 'PB-RECOVER-BACKUP',
      priority: 'HIGH',
      depends_on: [1],
    },
  ],
});

describe('closed loop: detect -> contain -> audit -> LLM (end-to-end, real packages, safe simulator)', () => {
  it('a simulated attack flows through every stage with the invariants intact', async () => {
    // 1) SAFE SIMULATOR -> C1 telemetry (a full-encryption family, canary planted)
    const fam = familyByName('LockBit-3.0') as NonNullable<ReturnType<typeof familyByName>>;
    const events = await attackTelemetry(fam, { plantCanary: true });
    expect(events.length).toBeGreaterThan(0);

    // 2) DETECTION ENGINE -> C2 verdict (consumes C1 only)
    const engine = new DetectionEngine(loadConfig({}));
    let verdict: DetectionVerdict | null = null;
    for (const e of events) {
      const res = engine.ingest(e);
      if (res.verdict.verdict === 'MASS_ENCRYPTION') {
        verdict = res.verdict;
        break;
      }
    }
    expect(verdict).not.toBeNull();
    expect(verdict?.recommended_action).toBe('ISOLATE_HOST');

    // 3) CONTAINMENT -> dial-gated, audit-precedes-action, agent isolates (over the C6 actuation path)
    const order: string[] = [];
    let seq = 0;
    const records: ActionRecord[] = [];
    const audit: AuditSink = {
      async append(rec) {
        order.push('audit');
        const full = { ...rec, chain_seq: seq++, prev_hash: '0', record_hash: 'h' } as ActionRecord;
        records.push(full);
        return full;
      },
    };
    const agent = new AgentContainment('agent-sim-001');
    const issuer: CommandIssuer = {
      async issue(cmd) {
        order.push('command');
        return agent.execute(cmd);
      },
    };
    const cm = new ContainmentModule({ audit, issuer });
    const out = await cm.handleVerdict(verdict as DetectionVerdict, 'FULL_AUTO', true, {
      incidentId: 'inc-loop-1',
    });
    expect(out.decision.disposition).toBe('EXECUTE');
    expect(out.result?.outcome).toBe('EXECUTED');
    expect(agent.isIsolated((verdict as DetectionVerdict).host_id)).toBe(true);
    expect(order.slice(0, 2)).toEqual(['audit', 'command']); // AUDIT PRECEDES ACTION
    expect(records[0]?.action_type).toBe('ISOLATE_HOST');

    // 4) LLM ORCHESTRATION -> C7 artifacts (advisory; consumes a bounded C3 context)
    const ctx: IncidentContext = {
      schema_version: SCHEMA_VERSION,
      incident_id: 'inc-loop-1',
      opened_at: '2026-06-28T00:00:00.000Z',
      trigger_verdict: verdict as DetectionVerdict,
      autonomy_mode: 'FULL_AUTO',
      containment_actions: records,
      affected_hosts: [
        {
          host_id: (verdict as DetectionVerdict).host_id,
          status: 'CONTAINED',
          role: 'workstation',
          first_event_at: '2026-06-28T00:00:00.000Z',
        },
      ],
      topology_edges: [],
      telemetry_summary: {
        total_files_touched: 1200,
        encryption_rate_est: 80,
        families_indicated: ['LockBit-3.0'],
      },
    };
    const analysis = await new LLMOrchestrator(new MockLLM(() => FAITHFUL), { topK: 12 }).analyze(ctx);
    expect(analysis.status).toBe('OK');
    expect(analysis.faithfulness?.passed).toBe(true);
    expect(analysis.blast_radius.nodes.length).toBe(1); // derived from context
    expect(analysis.plan?.steps.every((s) => s.playbook_ref.length > 0)).toBe(true);
    // the LLM is ADVISORY — it produced only C7 artifacts, never an action/command
    expect(analysis.report).not.toBeNull();
  });

  it('fail-safe in the loop: control-plane loss => no new destructive action, LLM still degrades cleanly', async () => {
    const fam = familyByName('Conti') as NonNullable<ReturnType<typeof familyByName>>;
    const events = await attackTelemetry(fam);
    const engine = new DetectionEngine(loadConfig({}));
    let verdict: DetectionVerdict | null = null;
    for (const e of events) {
      const r = engine.ingest(e);
      if (r.verdict.verdict === 'MASS_ENCRYPTION') {
        verdict = r.verdict;
        break;
      }
    }
    const audit: AuditSink = {
      async append(rec) {
        return { ...rec, chain_seq: 0, prev_hash: '0', record_hash: 'h' } as ActionRecord;
      },
    };
    const issuer: CommandIssuer = {
      async issue() {
        throw new Error('should not be called under partition');
      },
    };
    const cm = new ContainmentModule({ audit, issuer });
    const out = await cm.handleVerdict(verdict as DetectionVerdict, 'FULL_AUTO', false); // control plane DOWN
    expect(out.decision.disposition).toBe('DENY_FAILSAFE');
    expect(out.command).toBeNull();
  });
});
