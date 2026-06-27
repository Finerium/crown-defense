import { z } from 'zod';
import { AutonomyMode, Classification, Id, SchemaVersion, Timestamp } from './common.js';

/** C4 — Action Record → Audit Subsystem. The single immutable record + unit of the hash chain. */

export const ActionType = z.enum([
  'ISOLATE_HOST',
  'RELEASE_HOST',
  'KILL_PROCESS',
  'LOCK_SHARES',
  'UNLOCK_SHARES',
  'ALERT_RAISED',
  'RECOMMENDATION_MADE',
  'DIAL_CHANGED',
  'APPROVAL_GRANTED',
  'APPROVAL_DENIED',
  'ROLLBACK_EXECUTED',
  'LLM_REPORT_GENERATED',
]);
export type ActionType = z.infer<typeof ActionType>;

export const ActorType = z.enum(['SYSTEM_AUTONOMOUS', 'HUMAN_APPROVER', 'HUMAN_OPERATOR']);
export const ActionOutcome = z.enum(['EXECUTED', 'QUEUED', 'BLOCKED', 'ROLLED_BACK', 'FAILED']);
export type ActionOutcome = z.infer<typeof ActionOutcome>;

/** Destructive action types — used by the dial/policy and to enforce dual-control auditing. */
export const DESTRUCTIVE_ACTIONS = ['ISOLATE_HOST', 'KILL_PROCESS', 'LOCK_SHARES'] as const;
export function isDestructive(t: z.infer<typeof ActionType>): boolean {
  return (DESTRUCTIVE_ACTIONS as readonly string[]).includes(t);
}

export const ActionRecord = z
  .object({
    schema_version: SchemaVersion,
    action_id: Id,
    chain_seq: z.number().int().min(0), // monotonic per audit chain
    prev_hash: z.string(), // hash of the previous record (tamper-evidence)
    record_hash: z.string(), // hash of this record's canonical content
    occurred_at: Timestamp,
    incident_id: Id.nullable(),
    host_id: Id.nullable(),
    action_type: ActionType,
    autonomy_mode: AutonomyMode,
    classification: Classification,
    actor: z.object({ actor_type: ActorType, actor_id: Id }),
    approver: z.object({ actor_id: Id, approved_at: Timestamp }).nullable(),
    justification: z.object({
      verdict_id: Id.nullable(),
      confidence: z.number().min(0).max(1).nullable(),
      signals_summary: z.string().nullable(),
    }),
    reversible: z.boolean(),
    rollback_deadline: Timestamp.nullable(),
    outcome: ActionOutcome,
    detail: z.string().nullable(),
  })
  // INVARIANT (C4/AC-DIAL-02/AC-AUDIT-05): a destructive action in HUMAN_GATED mode MUST carry a
  // distinct approver (dual control / non-repudiation). Single-approver records are rejected.
  .refine(
    (r) =>
      !(r.autonomy_mode === 'HUMAN_GATED' && isDestructive(r.action_type) && r.outcome === 'EXECUTED') ||
      (r.approver !== null && r.approver.actor_id !== r.actor.actor_id),
    {
      message: 'HUMAN_GATED destructive action requires an approver distinct from the actor (dual control)',
      path: ['approver'],
    }
  );
export type ActionRecord = z.infer<typeof ActionRecord>;
