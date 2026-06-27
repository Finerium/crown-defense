import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ActionRecord } from '@crown/contracts';

/**
 * The tamper-evidence core of the audit subsystem (ADR-004 / AC-AUDIT-02).
 * Every ActionRecord is HMAC-hashed over its canonical content (including prev_hash + chain_seq,
 * excluding record_hash itself) and chained to its predecessor. Any mutation breaks the chain and
 * is detectable on verification. The HMAC key (AUDIT_INTEGRITY_KEY) makes forgery require the secret,
 * not merely recomputation — a plain hash chain is tamper-EVIDENT only if the attacker can't recompute it.
 */

export const GENESIS_PREV_HASH = '0'.repeat(64);

/** Deterministic, key-sorted JSON so the same record always hashes identically. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortDeep((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

/** Compute the record_hash over everything except record_hash. */
export function computeRecordHash(record: ActionRecord, integrityKey: string): string {
  const { record_hash: _omit, ...rest } = record;
  return createHmac('sha256', integrityKey).update(canonicalize(rest)).digest('hex');
}

/** Build the next record's chain fields given the prior tail (null tail => genesis). */
export function sealRecord(
  record: Omit<ActionRecord, 'chain_seq' | 'prev_hash' | 'record_hash'>,
  tail: { chain_seq: number; record_hash: string } | null,
  integrityKey: string
): ActionRecord {
  const chain_seq = tail ? tail.chain_seq + 1 : 0;
  const prev_hash = tail ? tail.record_hash : GENESIS_PREV_HASH;
  const withChain = { ...record, chain_seq, prev_hash, record_hash: '' } as ActionRecord;
  return { ...withChain, record_hash: computeRecordHash(withChain, integrityKey) };
}

function hashEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export interface ChainVerification {
  valid: boolean;
  /** seq of the first broken record, or null if the chain is intact. */
  brokenAt: number | null;
  reason: string | null;
  count: number;
}

/**
 * Verify a contiguous run of records (must be in ascending chain_seq order).
 * Detects: recomputed-hash mismatch (content mutated), prev_hash mismatch (record removed/reordered),
 * and seq gaps (record deleted). Fail-closed: anything off => valid:false with the first offending seq.
 */
export function verifyChain(records: ActionRecord[], integrityKey: string): ChainVerification {
  let prev: ActionRecord | null = null;
  for (const r of records) {
    const expectedSeq = prev ? prev.chain_seq + 1 : (records[0]?.chain_seq ?? 0);
    if (r.chain_seq !== expectedSeq) {
      return {
        valid: false,
        brokenAt: r.chain_seq,
        reason: 'chain_seq gap or reorder',
        count: records.length,
      };
    }
    const expectedPrev = prev ? prev.record_hash : r.prev_hash; // first record trusts its own prev_hash anchor
    if (prev && !hashEq(r.prev_hash, expectedPrev)) {
      return { valid: false, brokenAt: r.chain_seq, reason: 'prev_hash mismatch', count: records.length };
    }
    const recomputed = computeRecordHash(r, integrityKey);
    if (!hashEq(r.record_hash, recomputed)) {
      return {
        valid: false,
        brokenAt: r.chain_seq,
        reason: 'record_hash mismatch (content tampered)',
        count: records.length,
      };
    }
    prev = r;
  }
  return { valid: true, brokenAt: null, reason: null, count: records.length };
}
