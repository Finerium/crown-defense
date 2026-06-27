import { type IncidentContext, SCHEMA_VERSION } from '@crown/contracts';
import { IncidentReport as IncidentReportSchema, RecoveryPlan as RecoveryPlanSchema } from '@crown/contracts';
import {
  LLMOrchestrator,
  MockLLM,
  OpenAICompatClient,
  checkFaithfulness,
  llmConfigFromEnv,
  retrieve,
} from '@crown/llm';
import { describe, expect, it } from 'vitest';

function incidentContext(): IncidentContext {
  return {
    schema_version: SCHEMA_VERSION,
    incident_id: 'inc-1',
    opened_at: '2026-06-28T00:00:00.000Z',
    trigger_verdict: {
      schema_version: SCHEMA_VERSION,
      verdict_id: 'vd-1',
      host_id: 'host-1',
      agent_id: 'agent-1',
      decided_at: '2026-06-28T00:00:00.000Z',
      verdict: 'MASS_ENCRYPTION',
      confidence: 0.9,
      fast_path: true,
      signals: [{ signal_type: 'CANARY_TAMPER', fired: true, score: 1, detail: 'decoy modified' }],
      corroborating_count: 1,
      recommended_action: 'ISOLATE_HOST',
      evidence_ref: 'e',
    },
    autonomy_mode: 'FULL_AUTO',
    containment_actions: [],
    affected_hosts: [
      {
        host_id: 'host-1',
        status: 'CONTAINED',
        role: 'workstation',
        first_event_at: '2026-06-28T00:00:00.000Z',
      },
      { host_id: 'host-2', status: 'SCANNING', role: 'file-server', first_event_at: null },
    ],
    topology_edges: [{ from_host: 'host-1', to_host: 'host-2', reachable_service: 'SMB', status: 'BLOCKED' }],
    telemetry_summary: {
      total_files_touched: 1240,
      encryption_rate_est: 80,
      families_indicated: ['LockBit-3.0'],
    },
  };
}

const FAITHFUL_JSON = JSON.stringify({
  summary: 'Confirmed mass-encryption on host-1; decoy tamper and lateral path to host-2 blocked.',
  timeline: [{ phase: 'detection', description: 'canary tamper detected' }],
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
      action: 'Block lateral movement over SMB and disable affected accounts',
      rationale: 'contain lateral movement to the rest of the fleet',
      playbook_ref: 'PB-CONTAIN-LATERAL',
      priority: 'HIGH',
      depends_on: [1],
    },
    {
      order: 3,
      action: 'Restore affected data from known-good immutable backups',
      rationale: 'recover data after eradication; verify backup integrity',
      playbook_ref: 'PB-RECOVER-BACKUP',
      priority: 'HIGH',
      depends_on: [1],
    },
  ],
});

// An unfaithful output: one step cites a FABRICATED passage id; one step cites a real id but is unsupported.
const UNFAITHFUL_JSON = JSON.stringify({
  summary: 'made up',
  timeline: [],
  attributed_technique_ids: ['T9999'],
  citations: [{ claim: 'pay the attacker immediately', playbook_ref: 'PB-DOES-NOT-EXIST' }],
  steps: [
    {
      order: 1,
      action: 'Pay the ransom in bitcoin to recover files quickly',
      rationale: 'fastest path',
      playbook_ref: 'PB-FABRICATED-123',
      priority: 'CRITICAL',
      depends_on: null,
    },
  ],
});

describe('AC-LLM / AC-LLMART: faithfulness-gated incident analysis', () => {
  it('AC-LLM-02 + AC-LLMART-01: a faithful generation conforms to C7 and every step cites a playbook_ref', async () => {
    const orch = new LLMOrchestrator(new MockLLM(() => FAITHFUL_JSON), {
      topK: 12,
      now: () => '2026-06-28T00:00:00.000Z',
    });
    const a = await orch.analyze(incidentContext());
    expect(a.status).toBe('OK');
    expect(a.report).not.toBeNull();
    expect(a.plan).not.toBeNull();
    // C7 schema conformance (the refine requires a non-empty playbook_ref on every step)
    expect(IncidentReportSchema.safeParse(a.report).success).toBe(true);
    expect(RecoveryPlanSchema.safeParse(a.plan).success).toBe(true);
    expect(a.plan?.steps.every((s) => s.playbook_ref.trim().length > 0)).toBe(true);
  });

  it('AC-LLM-01: every recommendation is traceable to a retrieved playbook passage', async () => {
    const orch = new LLMOrchestrator(new MockLLM(() => FAITHFUL_JSON), { topK: 12 });
    const a = await orch.analyze(incidentContext());
    expect(a.faithfulness?.passed).toBe(true);
    expect(a.faithfulness?.unsupported_claims.length).toBe(0);
    expect(a.routed_to_human).toBe(false);
  });

  it('AC-LLM-03: an unfaithful (fabricated/unsupported) generation is BLOCKED and routed to a human', async () => {
    const orch = new LLMOrchestrator(new MockLLM(() => UNFAITHFUL_JSON), { topK: 12 });
    const a = await orch.analyze(incidentContext());
    expect(a.status).toBe('BLOCKED_LOW_FAITHFULNESS');
    expect(a.faithfulness?.passed).toBe(false);
    expect(a.routed_to_human).toBe(true);
  });

  it('the blast-radius map is DERIVED from the incident context, not the model', async () => {
    const orch = new LLMOrchestrator(new MockLLM(() => '{"summary":"x","steps":[],"citations":[]}'), {
      topK: 12,
    });
    const a = await orch.analyze(incidentContext());
    expect(a.blast_radius.nodes.map((n) => n.host_id).sort()).toEqual(['host-1', 'host-2']);
    expect(a.blast_radius.edges[0]?.reachable_service).toBe('SMB');
  });

  it('AC-FAIL-01: when the model is down, the layer degrades gracefully (no crash; blast-radius still returned)', async () => {
    const downLLM = new MockLLM(() => {
      throw new Error('model unavailable');
    });
    const orch = new LLMOrchestrator(downLLM);
    const a = await orch.analyze(incidentContext());
    expect(a.status).toBe('LLM_UNAVAILABLE');
    expect(a.degraded).toBe(true);
    expect(a.report).toBeNull();
    expect(a.blast_radius.nodes.length).toBe(2); // detection/containment-derived facts survive
  });

  it('the RAG retriever surfaces relevant playbook passages', () => {
    const ids = retrieve('isolate the host and contain lateral movement over SMB', 4).map((p) => p.id);
    expect(ids).toContain('PB-CONTAIN-ISOLATE');
  });

  it('the faithfulness checker is unit-correct (real ref + support => faithful; fake ref => not)', () => {
    const r = checkFaithfulness(
      { summary: '', citations: [] },
      {
        steps: [
          {
            order: 1,
            action: 'isolate the affected host from the network',
            rationale: 'halt encryption spread',
            playbook_ref: 'PB-CONTAIN-ISOLATE',
            priority: 'CRITICAL',
            depends_on: null,
          },
        ],
      },
      retrieve('isolate host', 12)
    );
    expect(r.passed).toBe(true);
  });
});

// Live integration (gated on the DeepSeek dev/test API config). Proves the model-agnostic abstraction
// actually talks to a real OpenAI-compatible endpoint and the pipeline survives real output. ADR-002:
// cloud is DEV/TEST ONLY; production swaps to the self-hosted model behind the same interface.
const cfg = llmConfigFromEnv();
describe.runIf(!!cfg)('live DeepSeek integration (dev/test only)', () => {
  it('produces a real analysis (OK or routed-to-human); never crashes; blast-radius present', async () => {
    const orch = new LLMOrchestrator(new OpenAICompatClient(cfg as NonNullable<typeof cfg>), { topK: 8 });
    const a = await orch.analyze(incidentContext());
    expect(['OK', 'BLOCKED_LOW_FAITHFULNESS', 'MALFORMED_OUTPUT']).toContain(a.status);
    expect(a.degraded).toBe(false); // the model answered
    expect(a.blast_radius.nodes.length).toBe(2);
  }, 60000);
});
