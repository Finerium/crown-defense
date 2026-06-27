/**
 * Gate-4 evidence generator (main-thread). Runs the LLM orchestrator with deterministic mock outputs
 * (faithful / unfaithful / model-down) and writes manifest-conformant AC-LLM artifacts. The LIVE DeepSeek
 * integration is proven separately by packages/test-infra/src/llm.test.ts. Run: `pnpm tsx scripts/gate4-evidence.ts`.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IncidentReport as IncidentReportSchema,
  type IncidentContext,
  RecoveryPlan as RecoveryPlanSchema,
  SCHEMA_VERSION,
} from '@crown/contracts';
import { LLMOrchestrator, MockLLM } from '@crown/llm';
import { evidence, writeReport } from '@crown/test-infra';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REP = (p: string) => resolve(ROOT, 'reports', p);

function ctx(): IncidentContext {
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
      signals: [{ signal_type: 'CANARY_TAMPER', fired: true, score: 1, detail: 'decoy' }],
      corroborating_count: 1,
      recommended_action: 'ISOLATE_HOST',
      evidence_ref: 'e',
    },
    autonomy_mode: 'FULL_AUTO',
    containment_actions: [],
    affected_hosts: [
      { host_id: 'host-1', status: 'CONTAINED', role: 'ws', first_event_at: '2026-06-28T00:00:00.000Z' },
      { host_id: 'host-2', status: 'SCANNING', role: 'fs', first_event_at: null },
    ],
    topology_edges: [{ from_host: 'host-1', to_host: 'host-2', reachable_service: 'SMB', status: 'BLOCKED' }],
    telemetry_summary: { total_files_touched: 1240, encryption_rate_est: 80, families_indicated: ['LockBit-3.0'] },
  };
}

const FAITHFUL = JSON.stringify({
  summary: 'Confirmed mass-encryption on host-1; lateral path to host-2 blocked.',
  timeline: [{ phase: 'detection', description: 'canary tamper detected' }],
  attributed_technique_ids: ['T1486'],
  citations: [{ claim: 'A tripped decoy file is high-confidence evidence of mass encryption', playbook_ref: 'PB-CANARY' }],
  steps: [
    { order: 1, action: 'Isolate the affected host from the network', rationale: 'halt the spread of encryption while preserving the host', playbook_ref: 'PB-CONTAIN-ISOLATE', priority: 'CRITICAL', depends_on: null },
    { order: 2, action: 'Block lateral movement over SMB and disable affected accounts', rationale: 'contain lateral movement to the rest of the fleet', playbook_ref: 'PB-CONTAIN-LATERAL', priority: 'HIGH', depends_on: [1] },
    { order: 3, action: 'Restore affected data from known-good immutable backups', rationale: 'recover data after eradication; verify backup integrity', playbook_ref: 'PB-RECOVER-BACKUP', priority: 'HIGH', depends_on: [1] },
  ],
});
const UNFAITHFUL = JSON.stringify({
  summary: 'made up',
  timeline: [],
  attributed_technique_ids: ['T9999'],
  citations: [{ claim: 'pay attacker now', playbook_ref: 'PB-DOES-NOT-EXIST' }],
  steps: [{ order: 1, action: 'Pay the ransom in bitcoin', rationale: 'fastest', playbook_ref: 'PB-FABRICATED', priority: 'CRITICAL', depends_on: null }],
});

async function main() {
  const results: Record<string, boolean> = {};

  const faithful = await new LLMOrchestrator(new MockLLM(() => FAITHFUL), { topK: 12, now: () => '2026-06-28T00:00:00.000Z' }).analyze(ctx());
  const unfaithful = await new LLMOrchestrator(new MockLLM(() => UNFAITHFUL), { topK: 12 }).analyze(ctx());
  const down = await new LLMOrchestrator(new MockLLM(() => { throw new Error('down'); })).analyze(ctx());

  // AC-LLM-01
  const ac01 = faithful.status === 'OK' && faithful.faithfulness?.passed === true && faithful.faithfulness.unsupported_claims.length === 0;
  results['AC-LLM-01'] = ac01;
  await writeReport(REP('llm/faithfulness.json'), evidence('AC-LLM-01', 4, ac01, { status: faithful.status, score: faithful.faithfulness?.score, unsupported: faithful.faithfulness?.unsupported_claims.length, traceable_steps: faithful.plan?.steps.map((s) => s.playbook_ref) }));

  // AC-LLM-02
  const ac02 = IncidentReportSchema.safeParse(faithful.report).success && RecoveryPlanSchema.safeParse(faithful.plan).success;
  results['AC-LLM-02'] = ac02;
  await writeReport(REP('llm/schema.json'), evidence('AC-LLM-02', 4, ac02, { report_conforms: IncidentReportSchema.safeParse(faithful.report).success, plan_conforms: RecoveryPlanSchema.safeParse(faithful.plan).success }));

  // AC-LLM-03
  const ac03 = unfaithful.status === 'BLOCKED_LOW_FAITHFULNESS' && unfaithful.routed_to_human && unfaithful.faithfulness?.passed === false;
  results['AC-LLM-03'] = ac03;
  await writeReport(REP('llm/negative.json'), evidence('AC-LLM-03', 4, ac03, { status: unfaithful.status, routed_to_human: unfaithful.routed_to_human, faithfulness_passed: unfaithful.faithfulness?.passed, unsupported: unfaithful.faithfulness?.unsupported_claims }));

  // AC-LLMART-01
  const everyStepCited = (faithful.plan?.steps ?? []).every((s) => s.playbook_ref.trim().length > 0);
  const blastDerived = faithful.blast_radius.nodes.length === 2 && faithful.blast_radius.edges[0]?.reachable_service === 'SMB';
  const ac_art = everyStepCited && blastDerived && faithful.plan !== null;
  results['AC-LLMART-01'] = ac_art;
  await writeReport(REP('llm/artifacts.json'), evidence('AC-LLMART-01', 4, ac_art, { every_step_has_playbook_ref: everyStepCited, blast_radius_derived_from_context: blastDerived, nodes: faithful.blast_radius.nodes.length }));

  // AC-FAIL-01
  const acFail = down.status === 'LLM_UNAVAILABLE' && down.degraded && down.report === null && down.blast_radius.nodes.length === 2;
  results['AC-FAIL-01'] = acFail;
  await writeReport(REP('resilience/llm_down.json'), evidence('AC-FAIL-01', 4, acFail, { status: down.status, degraded: down.degraded, no_crash: true, blast_radius_still_returned: down.blast_radius.nodes.length === 2, note: 'detection + containment are unaffected by LLM loss (the LLM is advisory and runs after containment)' }));

  const all = Object.values(results).every(Boolean);
  // biome-ignore lint/suspicious/noConsole: evidence status output
  console.log(JSON.stringify({ gate: 4, results, all_pass: all }, null, 2));
  process.exit(all ? 0 : 1);
}

main().catch((e) => {
  // biome-ignore lint/suspicious/noConsole: evidence error output
  console.error(e);
  process.exit(1);
});
