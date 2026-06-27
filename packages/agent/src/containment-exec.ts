import {
  type AgentCommand,
  type AgentCommandResult,
  SCHEMA_VERSION,
  isDestructiveCommand,
  rejectionReason,
} from '@crown/contracts';

/**
 * Agent-side containment executor. The endpoint agent receives a C6 AgentCommand and applies it LOCALLY.
 *
 * Two security invariants live here:
 *  - AC-ACT-01: a destructive command executes ONLY if its authorization is valid for the current dial
 *    position and (HUMAN_GATED) carries a distinct approver; otherwise it is REJECTED (and the rejection is
 *    auditable via the returned result). Enforced by the frozen C6 `rejectionReason`.
 *  - AC-CONT-02: containment PERSISTS across control-plane loss. The agent holds isolation state locally and
 *    NEVER auto-releases; a host is released only by an explicit RELEASE_HOST command — which cannot arrive
 *    while the control plane is unreachable. So a partition leaves existing isolation intact (fail-safe).
 *
 * Production applies real OS-level isolation (firewall/NIC/EDR); this build records intent + local state.
 */
export class AgentContainment {
  private agentId: string;
  private isolated = new Set<string>();
  private lockedShares = new Set<string>();
  private killedPids: number[] = [];
  private now: () => string;

  constructor(agentId: string, now: () => string = () => new Date().toISOString()) {
    this.agentId = agentId;
    this.now = now;
  }

  /** Execute (or reject) a command. Returns the C6 result; the caller audits it. */
  execute(cmd: AgentCommand): AgentCommandResult {
    const reject = rejectionReason(cmd);
    if (reject) return this.result(cmd.command_id, 'REJECTED', reject);

    switch (cmd.command_type) {
      case 'ISOLATE_HOST':
        this.isolated.add(cmd.target_host_id); // local, persistent: survives control-plane loss
        return this.result(cmd.command_id, 'EXECUTED', null);
      case 'RELEASE_HOST':
        this.isolated.delete(cmd.target_host_id);
        return this.result(cmd.command_id, 'EXECUTED', null);
      case 'KILL_PROCESS':
        if (cmd.params.pid !== null) this.killedPids.push(cmd.params.pid);
        return this.result(cmd.command_id, 'EXECUTED', null);
      case 'LOCK_SHARES':
        for (const p of cmd.params.share_paths ?? []) this.lockedShares.add(p);
        return this.result(cmd.command_id, 'EXECUTED', null);
      case 'UNLOCK_SHARES':
        for (const p of cmd.params.share_paths ?? []) this.lockedShares.delete(p);
        return this.result(cmd.command_id, 'EXECUTED', null);
      case 'PING':
      case 'PLANT_CANARY':
      case 'REFRESH_CONFIG':
      case 'APPLY_UPDATE':
        return this.result(cmd.command_id, 'EXECUTED', null);
      default:
        return this.result(cmd.command_id, 'FAILED', `unknown command_type ${cmd.command_type}`);
    }
  }

  /** Fail-safe self-action attempt: the agent NEVER initiates a destructive action on its own. */
  canSelfInitiate(commandType: AgentCommand['command_type']): boolean {
    return !isDestructiveCommand(commandType); // destructive needs an authorized command from the control plane
  }

  isIsolated(hostId: string): boolean {
    return this.isolated.has(hostId);
  }
  lockedShareCount(): number {
    return this.lockedShares.size;
  }
  killedCount(): number {
    return this.killedPids.length;
  }

  private result(
    commandId: string,
    outcome: AgentCommandResult['outcome'],
    reason: string | null
  ): AgentCommandResult {
    return {
      schema_version: SCHEMA_VERSION,
      command_id: commandId,
      agent_id: this.agentId,
      completed_at: this.now(),
      outcome,
      reason,
    };
  }
}
