import { z } from 'zod';
import type { ActionType } from './c4-audit.js';
import { AutonomyMode, type Classification } from './common.js';

/** C5 — Autonomy Dial state machine + action-classification matrix. The policy contract. */

export const AutonomyDial = z.object({
  position: AutonomyMode,
});
export type AutonomyDial = z.infer<typeof AutonomyDial>;

/** Ordering of autonomy (least → most). MONITOR_ONLY is least autonomous. */
export const AUTONOMY_ORDER: Record<z.infer<typeof AutonomyMode>, number> = {
  MONITOR_ONLY: 0,
  ALERT_RECOMMEND: 1,
  HUMAN_GATED: 2,
  FULL_AUTO: 3,
};

/** A change toward a MORE autonomous position is itself an audited, dual-control DIAL_CHANGED action. */
export function isMoreAutonomous(
  from: z.infer<typeof AutonomyMode>,
  to: z.infer<typeof AutonomyMode>
): boolean {
  return AUTONOMY_ORDER[to] > AUTONOMY_ORDER[from];
}

export const DEFAULT_DIAL: z.infer<typeof AutonomyMode> = 'MONITOR_ONLY';

/**
 * Action-classification matrix: per action_type, the classification at a given dial position.
 * Destructive actions (ISOLATE_HOST, KILL_PROCESS, LOCK_SHARES): NEVER_AUTO below FULL_AUTO;
 * ASK_TO_ACT in HUMAN_GATED; recommend/none below. NEVER_AUTO never auto-executes even in FULL_AUTO
 * (there are none classified NEVER_AUTO at FULL_AUTO here, but the engine must honor it if added).
 */
export function classify(
  action: z.infer<typeof ActionType>,
  position: z.infer<typeof AutonomyMode>
): z.infer<typeof Classification> {
  const destructive = action === 'ISOLATE_HOST' || action === 'KILL_PROCESS' || action === 'LOCK_SHARES';
  if (destructive) {
    if (position === 'FULL_AUTO') return 'AUTO';
    if (position === 'HUMAN_GATED') return 'ASK_TO_ACT';
    return 'NEVER_AUTO'; // MONITOR_ONLY, ALERT_RECOMMEND
  }
  if (action === 'RELEASE_HOST' || action === 'UNLOCK_SHARES') return 'ASK_TO_ACT'; // reversal still audited
  return 'AUTO'; // ALERT_RAISED, RECOMMENDATION_MADE, DIAL_CHANGED, etc. (subject to position semantics)
}

/**
 * Effective autonomy for GATING NEW DESTRUCTIVE ACTIONS under the fail-safe override (ADR-005).
 * ONLY control/decision-plane loss degrades this to MONITOR_ONLY (deny-by-default: no new destructive
 * action; existing containment is maintained by the agent locally). The ADVISORY LLM being down does
 * NOT lower it — it never authorizes containment, and AC-FAIL-01 requires deterministic detection+
 * containment to CONTINUE when the LLM is down. LLM-down is surfaced via health (healthOverall), not by
 * stopping containment. (Reconciles C5's literal "reasoning layer" clause with ADR-005's detailed text +
 * AC-FAIL-01; the most defensible reading — see docs/architecture.md §6.)
 */
export function effectiveAutonomy(
  configured: z.infer<typeof AutonomyMode>,
  degraded: { controlPlaneReachable: boolean }
): z.infer<typeof AutonomyMode> {
  if (!degraded.controlPlaneReachable) return 'MONITOR_ONLY';
  return configured;
}

/**
 * Health overall (C9 / AC-HEALTH-01): this is where "a reasoning-layer failure degrades the reported
 * reality" (ADR-005) lands — DISTINCT from the destructive-action gate above. DEGRADED whenever a
 * dependency is impaired (LLM down OR control plane impaired). A full health builder (Phase 10) may
 * return UNHEALTHY from component-level status; this helper covers the two fail-safe override conditions.
 */
export function healthOverall(degraded: {
  controlPlaneReachable: boolean;
  reasoningLayerUp: boolean;
}): 'HEALTHY' | 'DEGRADED' {
  if (!degraded.controlPlaneReachable || !degraded.reasoningLayerUp) return 'DEGRADED';
  return 'HEALTHY';
}
