import { z } from 'zod';
import { AutonomyMode, Id, SchemaVersion, Timestamp } from './common.js';

/**
 * C6 — Control Plane → Endpoint Agent (command / actuation channel). The most security-sensitive path.
 * Distinct from C1 (telemetry). Every command is authenticated, authorized, and bound to an audit record.
 */

export const CommandType = z.enum([
  'ISOLATE_HOST',
  'RELEASE_HOST',
  'KILL_PROCESS',
  'LOCK_SHARES',
  'UNLOCK_SHARES',
  'PLANT_CANARY',
  'REFRESH_CONFIG',
  'APPLY_UPDATE',
  'PING',
]);
export type CommandType = z.infer<typeof CommandType>;

export const DESTRUCTIVE_COMMANDS = ['ISOLATE_HOST', 'KILL_PROCESS', 'LOCK_SHARES'] as const;
export function isDestructiveCommand(t: z.infer<typeof CommandType>): boolean {
  return (DESTRUCTIVE_COMMANDS as readonly string[]).includes(t);
}

export const AgentCommand = z.object({
  schema_version: SchemaVersion,
  command_id: Id,
  issued_at: Timestamp,
  target_agent_id: Id,
  target_host_id: Id,
  command_type: CommandType,
  params: z.object({
    pid: z.number().int().nullable(),
    share_paths: z.array(z.string()).nullable(),
    update_ref: z.string().nullable(),
  }),
  authorization: z.object({
    autonomy_mode: AutonomyMode,
    verdict_id: Id.nullable(),
    approver_id: Id.nullable(), // present for HUMAN_GATED destructive commands
    // requestor_id: the principal that REQUESTED the action. Needed to enforce C6's "distinct approver"
    // rule at the actuation boundary (you cannot verify distinctness without the requestor). Added as a
    // nullable refinement of the frozen C6 contract — surfaced as a blueprint-conflict (see Report/notes):
    // "distinct approver" is unenforceable by the agent without it; this is the most defensible reading.
    requestor_id: Id.nullable(),
    action_record_id: Id, // the audit record this command is bound to (audit precedes action)
  }),
  rollback_deadline: Timestamp.nullable(),
});
export type AgentCommand = z.infer<typeof AgentCommand>;

export const AgentCommandResult = z.object({
  schema_version: SchemaVersion,
  command_id: Id,
  agent_id: Id,
  completed_at: Timestamp,
  outcome: z.enum(['EXECUTED', 'REJECTED', 'FAILED', 'QUEUED']),
  reason: z.string().nullable(),
});
export type AgentCommandResult = z.infer<typeof AgentCommandResult>;

/**
 * Authorization check an agent applies before executing a command (AC-ACT-01). Returns null if allowed,
 * or a rejection reason. FAIL-CLOSED ALLOW-LIST: a destructive command is permitted ONLY in two explicit
 * shapes (FULL_AUTO + verdict_id, or HUMAN_GATED + a distinct approver); any other mode (incl. an
 * unrecognized one) is denied. Distinct approver is enforced here when the requestor is known.
 */
export function rejectionReason(cmd: z.infer<typeof AgentCommand>): string | null {
  const a = cmd.authorization;
  // Audit-precedes-action: a command must reference an audit record (presence here; the issuer/agent
  // additionally verify it RESOLVES to a persisted record — see control-plane issuer-auth + AgentContainment).
  if (!a.action_record_id) return 'command is not bound to an audit ActionRecord (audit must precede action)';

  if (!isDestructiveCommand(cmd.command_type)) return null;

  // Destructive: allow-list, deny-by-default.
  if (a.autonomy_mode === 'FULL_AUTO') {
    if (!a.verdict_id) return 'FULL_AUTO destructive command requires a justifying verdict_id';
    return null;
  }
  if (a.autonomy_mode === 'HUMAN_GATED') {
    if (!a.approver_id) return 'HUMAN_GATED destructive command requires an approver_id (dual control)';
    // Distinctness: the approver must NOT be the requestor. If the requestor is unknown we cannot prove
    // distinctness, so we require it for a HUMAN_GATED destructive execution (fail-closed).
    if (!a.requestor_id)
      return 'HUMAN_GATED destructive command requires a known requestor_id to prove dual control';
    if (a.requestor_id === a.approver_id)
      return 'dual control violated: the approver must be DISTINCT from the requestor';
    return null;
  }
  return `destructive command not permitted in ${a.autonomy_mode}`; // MONITOR_ONLY, ALERT_RECOMMEND, unknown
}
