import type { ActionType, AutonomyMode, Classification, DetectionVerdict } from '@crown/contracts';
import { classify, effectiveAutonomy } from '@crown/contracts';

/**
 * Containment policy (the DIAL built INTO containment, ADR-003). Maps a detection verdict to a disposition,
 * under the fail-safe override (ADR-005): when the control plane is unreachable the effective autonomy
 * degrades to MONITOR_ONLY, so NO new destructive action is taken (deny-by-default) while existing
 * containment is maintained locally by the agent.
 */

export type Disposition =
  | 'EXECUTE' // FULL_AUTO + AUTO classification: act now (audit precedes the command)
  | 'PROPOSE' // HUMAN_GATED + ASK_TO_ACT: enqueue for dual-control approval (Phase 7 executes)
  | 'ALERT_ONLY' // ALERT_RECOMMEND: alert + recommend, never act
  | 'MONITOR_ONLY' // MONITOR_ONLY: log only
  | 'DENY_FAILSAFE'; // control-plane loss: deny-by-default, maintain existing containment

export interface ContainmentDecision {
  configuredMode: AutonomyMode;
  effectiveMode: AutonomyMode;
  action: ActionType | null; // the destructive action implied by the verdict, or null
  classification: Classification | null;
  disposition: Disposition;
  reason: string;
}

/** Decide what to do with a verdict given the dial and control-plane reachability. Pure + deterministic. */
export function decideContainment(
  verdict: DetectionVerdict,
  configuredMode: AutonomyMode,
  controlPlaneReachable: boolean
): ContainmentDecision {
  const effectiveMode = effectiveAutonomy(configuredMode, { controlPlaneReachable });

  // Non-destructive verdict: never a containment action; alert/monitor per the effective mode.
  if (verdict.recommended_action !== 'ISOLATE_HOST') {
    const disposition: Disposition = effectiveMode === 'MONITOR_ONLY' ? 'MONITOR_ONLY' : 'ALERT_ONLY';
    return {
      configuredMode,
      effectiveMode,
      action: null,
      classification: null,
      disposition,
      reason: `verdict ${verdict.verdict} recommends ${verdict.recommended_action}; no destructive action`,
    };
  }

  const action: ActionType = 'ISOLATE_HOST';

  // FAIL-SAFE: control-plane loss => effectiveMode is MONITOR_ONLY => deny new destructive action.
  if (!controlPlaneReachable) {
    return {
      configuredMode,
      effectiveMode,
      action,
      classification: classify(action, effectiveMode),
      disposition: 'DENY_FAILSAFE',
      reason:
        'control plane unreachable: deny-by-default — no new destructive action; existing containment maintained',
    };
  }

  const classification = classify(action, effectiveMode);
  let disposition: Disposition;
  let reason: string;
  switch (classification) {
    case 'AUTO': // FULL_AUTO
      disposition = 'EXECUTE';
      reason = `FULL_AUTO: ${action} auto-authorized (confidence ${verdict.confidence}, ${verdict.corroborating_count} signals${verdict.fast_path ? ', fast-path' : ''})`;
      break;
    case 'ASK_TO_ACT': // HUMAN_GATED
      disposition = 'PROPOSE';
      reason = `HUMAN_GATED: ${action} proposed — requires a second distinct approver (dual control)`;
      break;
    default: // NEVER_AUTO (MONITOR_ONLY, ALERT_RECOMMEND)
      disposition = effectiveMode === 'ALERT_RECOMMEND' ? 'ALERT_ONLY' : 'MONITOR_ONLY';
      reason = `${effectiveMode}: ${action} is NEVER_AUTO here — ${disposition === 'ALERT_ONLY' ? 'alert + recommend only' : 'log only'}`;
  }
  return { configuredMode, effectiveMode, action, classification, disposition, reason };
}
