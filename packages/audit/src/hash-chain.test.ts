import type { ActionRecord } from '@crown/contracts';
import { describe, expect, it } from 'vitest';
import { computeRecordHash, sealRecord, verifyChain } from './hash-chain.js';

const KEY = 'test-integrity-key-0123456789abcdef';

function mkRecord(seq: number, type: ActionRecord['action_type'] = 'ALERT_RAISED') {
  return {
    schema_version: '1.0',
    action_id: `act-${seq}`,
    occurred_at: `2026-06-27T03:14:0${seq % 10}.000Z`,
    incident_id: 'inc-1',
    host_id: 'h1',
    action_type: type,
    autonomy_mode: 'FULL_AUTO' as const,
    classification: 'AUTO' as const,
    actor: { actor_type: 'SYSTEM_AUTONOMOUS' as const, actor_id: 'engine' },
    approver: null,
    justification: { verdict_id: 'v1', confidence: 0.9, signals_summary: 'canary' },
    reversible: false,
    rollback_deadline: null,
    outcome: 'EXECUTED' as const,
    detail: null,
  };
}

function buildChain(n: number): ActionRecord[] {
  const out: ActionRecord[] = [];
  let tail: { chain_seq: number; record_hash: string } | null = null;
  for (let i = 0; i < n; i++) {
    const sealed = sealRecord(mkRecord(i), tail, KEY);
    out.push(sealed);
    tail = { chain_seq: sealed.chain_seq, record_hash: sealed.record_hash };
  }
  return out;
}

/** Definite array access (tsconfig noUncheckedIndexedAccess is on). */
function def<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('expected a defined element');
  return v;
}

describe('audit hash chain (AC-AUDIT-02)', () => {
  it('seals a genesis-anchored, gap-free chain that verifies', () => {
    const chain = buildChain(5);
    expect(def(chain[0]).chain_seq).toBe(0);
    expect(def(chain[0]).prev_hash).toBe('0'.repeat(64));
    expect(def(chain[4]).chain_seq).toBe(4);
    expect(verifyChain(chain, KEY).valid).toBe(true);
  });

  it('detects content tampering of a middle record', () => {
    const chain = buildChain(5);
    // Mutate the persisted content WITHOUT recomputing the hash (what a DB-level attacker would do).
    chain[2] = { ...def(chain[2]), host_id: 'attacker-altered' };
    const v = verifyChain(chain, KEY);
    expect(v.valid).toBe(false);
    expect(v.brokenAt).toBe(2);
    expect(v.reason).toMatch(/record_hash mismatch/);
  });

  it('detects a forged record even if the attacker recomputes its own hash (no key)', () => {
    const chain = buildChain(5);
    const forgedKey = 'attacker-guessed-key';
    const forged = { ...def(chain[2]), host_id: 'evil' };
    forged.record_hash = computeRecordHash(forged, forgedKey); // attacker lacks the real key
    chain[2] = forged;
    expect(verifyChain(chain, KEY).valid).toBe(false);
  });

  it('detects record deletion (seq gap)', () => {
    const chain = buildChain(5);
    chain.splice(2, 1); // remove seq 2
    const v = verifyChain(chain, KEY);
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/gap|prev_hash/);
  });

  it('detects reordering', () => {
    const chain = buildChain(5);
    const a = def(chain[2]);
    const b = def(chain[3]);
    chain[2] = b;
    chain[3] = a;
    expect(verifyChain(chain, KEY).valid).toBe(false);
  });
});
