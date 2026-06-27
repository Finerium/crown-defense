import {
  type ActionRecord,
  type ActionType,
  type AgentCommand,
  type AgentCommandResult,
  type AutonomyMode,
  type CommandType,
  type DetectionVerdict,
  SCHEMA_VERSION,
} from '@crown/contracts';
import { type ContainmentDecision, decideContainment } from './policy.js';

/** Append-only audit binding (a subset of @crown/audit's AuditStore; the store computes chain fields). */
export interface AuditSink {
  append(rec: Omit<ActionRecord, 'chain_seq' | 'prev_hash' | 'record_hash'>): Promise<ActionRecord>;
}

/** The actuation transport (the mTLS control-plane channel in production; a mock in unit tests). */
export interface CommandIssuer {
  issue(cmd: AgentCommand): Promise<AgentCommandResult>;
}

export interface ContainmentDeps {
  audit: AuditSink;
  issuer: CommandIssuer;
  now?: () => string;
  newId?: (prefix: string) => string;
  actorId?: string;
  rollbackSeconds?: number;
}

export interface ContainmentOutcome {
  decision: ContainmentDecision;
  actionRecordId: string | null;
  command: AgentCommand | null;
  result: AgentCommandResult | null;
  /** Proof of ordering for AC-ACT-02: the audit append happened at this step BEFORE the command issue. */
  auditPrecededCommand: boolean;
}

let COUNTER = 0;

/**
 * Containment Module (Phase 3). Consumes a C2 verdict, applies the C5 dial policy (the dial is built IN,
 * not bolted on), and for an authorized destructive action BINDS A C4 ACTION RECORD TO THE IMMUTABLE AUDIT
 * LOG BEFORE ISSUING THE C6 COMMAND (audit precedes action, AC-ACT-02). Fail-safe: on control-plane loss it
 * denies new destructive actions (deny-by-default) while existing containment is maintained by the agent.
 */
export class ContainmentModule {
  private audit: AuditSink;
  private issuer: CommandIssuer;
  private now: () => string;
  private newId: (prefix: string) => string;
  private actorId: string;
  private rollbackSeconds: number;

  constructor(deps: ContainmentDeps) {
    this.audit = deps.audit;
    this.issuer = deps.issuer;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.newId = deps.newId ?? ((p) => `${p}-${Date.now().toString(36)}-${(COUNTER++).toString(36)}`);
    this.actorId = deps.actorId ?? 'system-containment';
    this.rollbackSeconds = deps.rollbackSeconds ?? 300;
  }

  async handleVerdict(
    verdict: DetectionVerdict,
    configuredMode: AutonomyMode,
    controlPlaneReachable: boolean,
    opts: { incidentId?: string } = {}
  ): Promise<ContainmentOutcome> {
    const decision = decideContainment(verdict, configuredMode, controlPlaneReachable);
    const incidentId = opts.incidentId ?? null;

    if (decision.disposition === 'EXECUTE' && decision.action) {
      // === AUDIT PRECEDES ACTION ===
      const record = await this.audit.append(
        this.actionRecord(decision.action, 'EXECUTED', decision, verdict, incidentId, true)
      );
      const command = this.command(decision.action, record.action_id, verdict, decision.effectiveMode, true);
      const result = await this.issuer.issue(command);
      return { decision, actionRecordId: record.action_id, command, result, auditPrecededCommand: true };
    }

    if (decision.disposition === 'PROPOSE' && decision.action) {
      // HUMAN_GATED: queue the proposed destructive action for dual-control approval (Phase 7 executes).
      const record = await this.audit.append(
        this.actionRecord(decision.action, 'QUEUED', decision, verdict, incidentId, true)
      );
      return {
        decision,
        actionRecordId: record.action_id,
        command: null,
        result: null,
        auditPrecededCommand: true,
      };
    }

    // ALERT_ONLY / MONITOR_ONLY / DENY_FAILSAFE: no destructive command. Record the decision (auditability).
    const at: ActionType = decision.disposition === 'ALERT_ONLY' ? 'ALERT_RAISED' : 'RECOMMENDATION_MADE';
    const outcome = decision.disposition === 'ALERT_ONLY' ? 'EXECUTED' : 'BLOCKED';
    const record = await this.audit.append(
      this.actionRecord(at, outcome, decision, verdict, incidentId, true)
    );
    return {
      decision,
      actionRecordId: record.action_id,
      command: null,
      result: null,
      auditPrecededCommand: true,
    };
  }

  private actionRecord(
    action: ActionType,
    outcome: ActionRecord['outcome'],
    decision: ContainmentDecision,
    verdict: DetectionVerdict,
    incidentId: string | null,
    reversible: boolean
  ): Omit<ActionRecord, 'chain_seq' | 'prev_hash' | 'record_hash'> {
    const destructive = action === 'ISOLATE_HOST';
    return {
      schema_version: SCHEMA_VERSION,
      action_id: this.newId('act'),
      occurred_at: this.now(),
      incident_id: incidentId,
      host_id: verdict.host_id,
      action_type: action,
      autonomy_mode: decision.effectiveMode,
      classification: decision.classification ?? 'AUTO',
      actor: { actor_type: 'SYSTEM_AUTONOMOUS', actor_id: this.actorId },
      approver: null, // FULL_AUTO autonomous; HUMAN_GATED approver is attached at Phase-7 approval time
      justification: {
        verdict_id: verdict.verdict_id,
        confidence: verdict.confidence,
        signals_summary: decision.reason,
      },
      reversible,
      rollback_deadline: destructive && outcome === 'EXECUTED' ? this.deadline() : null,
      outcome,
      detail: decision.reason,
    };
  }

  private command(
    action: ActionType,
    actionRecordId: string,
    verdict: DetectionVerdict,
    mode: AutonomyMode,
    timeBoxed: boolean
  ): AgentCommand {
    return {
      schema_version: SCHEMA_VERSION,
      command_id: this.newId('cmd'),
      issued_at: this.now(),
      target_agent_id: verdict.agent_id,
      target_host_id: verdict.host_id,
      command_type: action as CommandType,
      params: { pid: null, share_paths: null, update_ref: null },
      authorization: {
        autonomy_mode: mode,
        verdict_id: verdict.verdict_id,
        approver_id: null, // FULL_AUTO needs no approver; HUMAN_GATED would carry one (Phase 7)
        action_record_id: actionRecordId, // bound to the audit record that PRECEDED this command
      },
      rollback_deadline: timeBoxed ? this.deadline() : null,
    };
  }

  private deadline(): string {
    return new Date(Date.parse(this.now()) + this.rollbackSeconds * 1000).toISOString();
  }
}
