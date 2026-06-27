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
 * Authorization check an agent applies before executing a destructive command (AC-ACT-01).
 * Returns null if allowed, or a rejection reason string.
 */
export function rejectionReason(cmd: z.infer<typeof AgentCommand>): string | null {
  const a = cmd.authorization;
  if (isDestructiveCommand(cmd.command_type)) {
    if (a.autonomy_mode === 'MONITOR_ONLY' || a.autonomy_mode === 'ALERT_RECOMMEND') {
      return `destructive command not permitted in ${a.autonomy_mode}`;
    }
    if (a.autonomy_mode === 'HUMAN_GATED' && !a.approver_id) {
      return 'HUMAN_GATED destructive command requires a distinct approver_id (dual control)';
    }
    if (a.autonomy_mode === 'FULL_AUTO' && !a.verdict_id) {
      return 'FULL_AUTO destructive command requires a justifying verdict_id';
    }
  }
  if (!a.action_record_id) return 'command is not bound to an audit ActionRecord (audit must precede action)';
  return null;
}
