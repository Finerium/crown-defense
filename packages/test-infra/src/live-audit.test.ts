import { AuditStore } from '@crown/audit';
import { type CommandIssuer, ContainmentModule } from '@crown/containment';
import { type AgentCommand, type DetectionVerdict, SCHEMA_VERSION } from '@crown/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * AC-ACT-02 + AC-AUDIT-01/02 against the REAL append-only, hash-chained audit store (not a spy): the
 * containment module must append an immutable, chain-valid ActionRecord to the live audit DB BEFORE the
 * destructive command is issued, and that record must be attributable + tamper-evident.
 */
const url = process.env.AUDIT_DB_URL;
const key = process.env.AUDIT_INTEGRITY_KEY;

function verdict(): DetectionVerdict {
  return {
    schema_version: SCHEMA_VERSION,
    verdict_id: `vd-${Date.now()}`,
    host_id: 'host-live-1',
    agent_id: 'agent-live-1',
    decided_at: new Date().toISOString(),
    verdict: 'MASS_ENCRYPTION',
    confidence: 0.9,
    fast_path: false,
    signals: [
      { signal_type: 'FORMAT_VALIDATION_FAIL', fired: true, score: 1, detail: 'invalid' },
      { signal_type: 'OP_FREQUENCY', fired: true, score: 0.6, detail: 'fast' },
    ],
    corroborating_count: 2,
    recommended_action: 'ISOLATE_HOST',
    evidence_ref: 'e',
  };
}

describe.runIf(!!url && !!key)('live audit binding (immutable record precedes action)', () => {
  let store: AuditStore;
  beforeAll(() => {
    store = new AuditStore({ connectionString: url as string, integrityKey: key as string });
  });
  afterAll(async () => {
    await store.close();
  });

  it('appends a chain-valid ActionRecord to the live DB BEFORE issuing the bound command', async () => {
    const order: string[] = [];
    const issuer: CommandIssuer = {
      async issue(cmd: AgentCommand) {
        order.push('command');
        // the command must reference the record that was already persisted
        expect(cmd.authorization.action_record_id).toBeTruthy();
        return {
          schema_version: SCHEMA_VERSION,
          command_id: cmd.command_id,
          agent_id: cmd.target_agent_id,
          completed_at: new Date().toISOString(),
          outcome: 'EXECUTED' as const,
          reason: null,
        };
      },
    };
    const audit = {
      async append(rec: Parameters<AuditStore['append']>[0]) {
        order.push('audit');
        return store.append(rec);
      },
    };
    const cm = new ContainmentModule({ audit, issuer });
    const out = await cm.handleVerdict(verdict(), 'FULL_AUTO', true, { incidentId: 'inc-live-1' });

    expect(order).toEqual(['audit', 'command']); // AUDIT PRECEDES ACTION
    expect(out.command?.authorization.action_record_id).toBe(out.actionRecordId);

    // the persisted record is real, attributable, and the whole chain still verifies (tamper-evident)
    const chain = await store.verify();
    expect(chain.valid).toBe(true);
    const records = await store.readChain(null);
    const mine = records.find((r) => r.action_id === out.actionRecordId);
    expect(mine).toBeDefined();
    expect(mine?.action_type).toBe('ISOLATE_HOST');
    expect(mine?.actor.actor_type).toBe('SYSTEM_AUTONOMOUS');
    expect(mine?.justification.verdict_id).toBeTruthy();
  });
});
