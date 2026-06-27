import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { AuditStore } from './store.js';

const URL = process.env.AUDIT_DB_URL;
const KEY = process.env.AUDIT_INTEGRITY_KEY ?? 'test-integrity-key';

// DB-backed substrate evidence. Skips cleanly if the local audit DB is not running.
const d = URL ? describe : describe.skip;

d('audit store substrate (live DB)', () => {
  const store = new AuditStore({ connectionString: URL as string, integrityKey: KEY });
  const raw = new pg.Pool({ connectionString: URL });
  afterAll(async () => {
    await store.close();
    await raw.end();
  });

  function alert() {
    return {
      schema_version: '1.0',
      action_id: `act-${randomUUID()}`,
      occurred_at: new Date().toISOString(),
      incident_id: 'inc-substrate-test',
      host_id: 'h-test',
      action_type: 'ALERT_RAISED' as const,
      autonomy_mode: 'MONITOR_ONLY' as const,
      classification: 'AUTO' as const,
      actor: { actor_type: 'SYSTEM_AUTONOMOUS' as const, actor_id: 'engine' },
      approver: null,
      justification: { verdict_id: null, confidence: null, signals_summary: 'substrate test' },
      reversible: false,
      rollback_deadline: null,
      outcome: 'EXECUTED' as const,
      detail: null,
    };
  }

  it('appends records and the full chain verifies', async () => {
    const a = await store.append(alert());
    const b = await store.append(alert());
    expect(b.chain_seq).toBe(a.chain_seq + 1);
    expect(b.prev_hash).toBe(a.record_hash);
    expect((await store.verify()).valid).toBe(true);
  });

  it('DB-level WORM: UPDATE on an audit record is rejected', async () => {
    await expect(
      raw.query(
        "UPDATE action_records SET host_id = 'tampered' WHERE chain_seq = (SELECT max(chain_seq) FROM action_records)"
      )
    ).rejects.toThrow(/append-only|WORM/i);
  });

  it('DB-level WORM: DELETE on an audit record is rejected', async () => {
    await expect(raw.query('DELETE FROM action_records WHERE chain_seq = 0')).rejects.toThrow(
      /append-only|WORM/i
    );
  });
});
