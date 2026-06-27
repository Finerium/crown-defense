import { type IncidentContext, SCHEMA_VERSION } from '@crown/contracts';
import { LLMOrchestrator, MockLLM, OpenAICompatClient, llmConfigFromEnv } from '@crown/llm';
import { NextResponse } from 'next/server';

/**
 * Serverless function: generates a GENUINELY LIVE incident report by calling the on-prem-equivalent LLM
 * (DeepSeek for the demo) SERVER-SIDE. The API key never leaves the server (it is read from env here, never
 * shipped to the client). Reuses the verified @crown/llm orchestrator: RAG over the IR playbook + the
 * faithfulness gate + C7 output. If the LLM is unconfigured/unreachable, it degrades gracefully (honest).
 */
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function incidentContext(): IncidentContext {
  return {
    schema_version: SCHEMA_VERSION,
    incident_id: 'INC-2026-0612-004',
    opened_at: '2026-06-12T03:14:07.200Z',
    trigger_verdict: {
      schema_version: SCHEMA_VERSION,
      verdict_id: 'vd-inc-004',
      host_id: 'h-0000',
      agent_id: 'agent-h-0000',
      decided_at: '2026-06-12T03:14:07.200Z',
      verdict: 'MASS_ENCRYPTION',
      confidence: 0.92,
      fast_path: true,
      signals: [
        { signal_type: 'CANARY_TAMPER', fired: true, score: 1, detail: '2 decoy files modified' },
        {
          signal_type: 'FORMAT_VALIDATION_FAIL',
          fired: true,
          score: 0.9,
          detail: '6 files structurally invalid',
        },
        { signal_type: 'OP_FREQUENCY', fired: true, score: 0.7, detail: 'peak 280 writes/s' },
        { signal_type: 'TYPE_HEADER_CHANGE', fired: true, score: 0.6, detail: 'extension -> .brain' },
      ],
      corroborating_count: 4,
      recommended_action: 'ISOLATE_HOST',
      evidence_ref: 'evt-window-004',
    },
    autonomy_mode: 'FULL_AUTO',
    containment_actions: [],
    affected_hosts: [
      {
        host_id: 'h-0000',
        status: 'COMPROMISED',
        role: 'workstation',
        first_event_at: '2026-06-12T03:13:55.000Z',
      },
      {
        host_id: 'h-0001',
        status: 'CONTAINED',
        role: 'file-server',
        first_event_at: '2026-06-12T03:14:10.000Z',
      },
      { host_id: 'h-0002', status: 'CONTAINED', role: 'domain-controller', first_event_at: null },
      { host_id: 'h-0003', status: 'SCANNING', role: 'db-server', first_event_at: null },
    ],
    topology_edges: [
      { from_host: 'h-0000', to_host: 'h-0001', reachable_service: 'SMB', status: 'BLOCKED' },
      { from_host: 'h-0000', to_host: 'h-0002', reachable_service: 'RDP', status: 'BLOCKED' },
      { from_host: 'h-0001', to_host: 'h-0003', reachable_service: 'SMB', status: 'ACTIVE' },
    ],
    telemetry_summary: {
      total_files_touched: 1240,
      encryption_rate_est: 80,
      families_indicated: ['BrainCipher', 'LockBit-3.0'],
    },
  };
}

const FALLBACK = JSON.stringify({
  summary:
    'LLM not configured in this environment — showing a faithfulness-gated fallback. Configure DEEPSEEK_API_KEY for a live on-prem-equivalent generation.',
  timeline: [{ phase: 'detection', description: 'canary tamper + format-validation failures' }],
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
      rationale: 'recover after eradication; verify backup integrity',
      playbook_ref: 'PB-RECOVER-BACKUP',
      priority: 'HIGH',
      depends_on: [1],
    },
  ],
});

export async function POST() {
  const cfg = llmConfigFromEnv();
  const llm = cfg ? new OpenAICompatClient(cfg) : new MockLLM(() => FALLBACK, 'fallback-unconfigured');
  const orch = new LLMOrchestrator(llm, { topK: 8 });
  const a = await orch.analyze(incidentContext());
  return NextResponse.json({
    live: !!cfg,
    status: a.status,
    degraded: a.degraded,
    routed_to_human: a.routed_to_human,
    model_id: a.report?.model_id ?? (cfg ? cfg.model : 'fallback'),
    faithfulness: a.faithfulness,
    report: a.report,
    plan: a.plan,
    blast_radius: a.blast_radius,
  });
}
