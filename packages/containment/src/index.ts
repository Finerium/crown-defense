/**
 * @crown/containment — dial-gated host containment (Phase 3). The autonomy dial is built INTO the
 * containment decision (ADR-003); every authorized destructive action binds an immutable C4 audit record
 * BEFORE the C6 command is issued (audit precedes action); control-plane loss denies new destructive action
 * (fail-safe, deny-by-default) while the agent maintains existing containment locally.
 */
export { type ContainmentDecision, type Disposition, decideContainment } from './policy.js';
export {
  type AuditSink,
  type CommandIssuer,
  ContainmentModule,
  type ContainmentDeps,
  type ContainmentOutcome,
} from './containment.js';
