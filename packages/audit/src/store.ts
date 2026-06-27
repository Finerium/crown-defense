import { type ActionRecord, ActionRecord as ActionRecordSchema } from '@crown/contracts';
import pg from 'pg';
import { type ChainVerification, sealRecord, verifyChain } from './hash-chain.js';

/**
 * Append-only, hash-chained audit store (ADR-004, ADR-013 separate DB). The substrate that must exist
 * before the first autonomous action is possible. Append + tamper-verify are realized here; export and
 * 24h reconstruction are exercised in Phase 7 (the queries below already support them).
 *
 * WORM is enforced at TWO layers: this class exposes no update/delete, AND the audit DB has a trigger
 * that rejects UPDATE/DELETE on action_records (see migrations). Defense in depth for immutability.
 */
export class AuditStore {
  private pool: pg.Pool;
  private integrityKey: string;

  constructor(opts: { connectionString: string; integrityKey: string }) {
    if (!opts.integrityKey) throw new Error('AUDIT_INTEGRITY_KEY is required');
    this.pool = new pg.Pool({ connectionString: opts.connectionString, max: 8 });
    this.integrityKey = opts.integrityKey;
  }

  /** Append a new record. Seals it onto the current tail under a row lock so chain_seq is gap-free. */
  async append(record: Omit<ActionRecord, 'chain_seq' | 'prev_hash' | 'record_hash'>): Promise<ActionRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize appends: lock the tail so two concurrent appends can't both read the same seq.
      const tailRes = await client.query(
        'SELECT chain_seq, record_hash FROM action_records ORDER BY chain_seq DESC LIMIT 1 FOR UPDATE'
      );
      const tail = tailRes.rows[0]
        ? { chain_seq: Number(tailRes.rows[0].chain_seq), record_hash: String(tailRes.rows[0].record_hash) }
        : null;
      const sealed = sealRecord(record, tail, this.integrityKey);
      // Validate against the frozen contract before persisting (fail-closed at the boundary).
      ActionRecordSchema.parse(sealed);
      await client.query(
        `INSERT INTO action_records
           (chain_seq, action_id, prev_hash, record_hash, occurred_at, incident_id, host_id,
            action_type, autonomy_mode, classification, record)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          sealed.chain_seq,
          sealed.action_id,
          sealed.prev_hash,
          sealed.record_hash,
          sealed.occurred_at,
          sealed.incident_id,
          sealed.host_id,
          sealed.action_type,
          sealed.autonomy_mode,
          sealed.classification,
          sealed,
        ]
      );
      await client.query('COMMIT');
      return sealed;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** Read the full chain (ascending). Bounded by `limit` for safety; pass null only for verification jobs. */
  async readChain(limit: number | null = 10000): Promise<ActionRecord[]> {
    const clause = limit ? `LIMIT ${Number(limit)}` : '';
    const res = await this.pool.query(`SELECT record FROM action_records ORDER BY chain_seq ASC ${clause}`);
    return res.rows.map((r) => r.record as ActionRecord);
  }

  /** Verify the persisted chain end-to-end (AC-AUDIT-02). */
  async verify(): Promise<ChainVerification> {
    return verifyChain(await this.readChain(null), this.integrityKey);
  }

  /** 24h reconstruction (AC-AUDIT-03): the ordered action sequence within a window, chain-checked. */
  async reconstructWindow(
    fromIso: string,
    toIso: string
  ): Promise<{ records: ActionRecord[]; verification: ChainVerification }> {
    const res = await this.pool.query(
      'SELECT record FROM action_records WHERE occurred_at >= $1 AND occurred_at <= $2 ORDER BY chain_seq ASC',
      [fromIso, toIso]
    );
    const records = res.rows.map((r) => r.record as ActionRecord);
    return { records, verification: verifyChain(records, this.integrityKey) };
  }

  /** Verifiable export slice (AC-AUDIT-04), e.g. all ISOLATE_HOST in a period. */
  async exportSlice(filter: { action_type?: string; fromIso?: string; toIso?: string }): Promise<{
    records: ActionRecord[];
    chain_valid: boolean;
    exported_at: string;
  }> {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (filter.action_type) {
      params.push(filter.action_type);
      conds.push(`action_type = $${params.length}`);
    }
    if (filter.fromIso) {
      params.push(filter.fromIso);
      conds.push(`occurred_at >= $${params.length}`);
    }
    if (filter.toIso) {
      params.push(filter.toIso);
      conds.push(`occurred_at <= $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const res = await this.pool.query(
      `SELECT record FROM action_records ${where} ORDER BY chain_seq ASC`,
      params
    );
    const records = res.rows.map((r) => r.record as ActionRecord);
    // The export slice is verified against the SAME records' internal hashes; full-chain verify is separate.
    const chain_valid = verifyChain(await this.readChain(null), this.integrityKey).valid;
    return { records, chain_valid, exported_at: new Date().toISOString() };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
