import {
  type DetectionSignal,
  type DetectionVerdict,
  DetectionVerdict as DetectionVerdictSchema,
  type RecommendedAction,
  SCHEMA_VERSION,
  type TelemetryEvent,
  type Verdict,
} from '@crown/contracts';
import type { DetectionConfig } from './config.js';
import { DISCRIMINATING, evaluateSignals } from './signals.js';

/**
 * Fusion decision (ADR-001, C2). Combines per-signal evaluations into a DetectionVerdict.
 *
 * Bank invariants enforced here (all verified by adversarial review):
 *  - A destructive recommendation (ISOLATE_HOST) requires the decoy fast-path OR >=minCorroboration fired
 *    signals INCLUDING >=1 ENCRYPTION-DISCRIMINATING signal (format-fail / decoy tamper). Context signals
 *    (op-frequency, type/header change, entropy rise) are benign-compatible and cannot alone isolate a host.
 *  - corroborating_count is the count of ACTUALLY-fired signals (never self-reported).
 *  - FAIL-CLOSED: the assembled verdict is validated against the frozen C2 schema (which re-encodes the
 *    >=2-or-fast-path rule); if it does not validate, the action is downgraded to a non-destructive ALERT.
 *  - Allow-list suppression (AC-FP-02): applies ONLY when every signal-bearing mutation event is from an
 *    allow-listed, signed process, and NEVER when the decoy fast-path fired. (Production binds the allow-list
 *    to the mTLS-attested process identity; here it matches telemetry, which is hardened but not unspoofable
 *    without that identity layer — see notes / Phase 7/12.)
 */

export interface DecisionContext {
  host_id: string;
  agent_id: string;
  verdict_id: string;
  evidence_ref: string;
}

export interface DecisionResult {
  verdict: DetectionVerdict;
  suppressedByAllowlist: boolean;
  suppressionReason: string | null; // flows to the C4 ActionRecord.justification at containment time
  attributedProcesses: string[];
}

const MUTATION_EVENTS = new Set([
  'FILE_WRITE',
  'FILE_CREATE',
  'FILE_RENAME',
  'FILE_DELETE',
  'FILE_TYPE_CHANGED',
  'CANARY_TOUCHED',
]);

function mutationProcesses(window: TelemetryEvent[]): string[] {
  const set = new Set<string>();
  for (const e of window) if (MUTATION_EVENTS.has(e.event_type) && e.process.path) set.add(e.process.path);
  return [...set];
}

/** True iff EVERY signal-bearing mutation event is from an allow-listed, signed process (>=1 such event). */
function allMutationsAllowlisted(window: TelemetryEvent[], allowlist: string[]): boolean {
  const allow = new Set(allowlist);
  let any = false;
  for (const e of window) {
    if (!MUTATION_EVENTS.has(e.event_type)) continue;
    any = true;
    if (!e.process.path || !allow.has(e.process.path) || e.process.signed !== true) return false;
  }
  return any;
}

function latestTimestamp(window: TelemetryEvent[]): string {
  let t = window[0]?.emitted_at ?? new Date(0).toISOString();
  for (const e of window) if (e.emitted_at > t) t = e.emitted_at;
  return t;
}

/** Confidence in the chosen verdict LABEL (not "probability of attack"). */
function confidenceFor(verdict: Verdict, fastPath: boolean, count: number): number {
  if (verdict === 'BENIGN') return 0.9;
  if (verdict === 'SUSPICIOUS') return Math.min(0.7, 0.4 + 0.1 * count);
  if (fastPath) return Math.min(1, 0.9 + 0.02 * Math.min(count, 5));
  return Math.min(0.95, 0.6 + 0.1 * Math.min(count, 4));
}

export function decide(window: TelemetryEvent[], cfg: DetectionConfig, ctx: DecisionContext): DecisionResult {
  const signals: DetectionSignal[] = evaluateSignals(window, cfg);
  const fired = signals.filter((s) => s.fired);
  const corroborating_count = fired.length;
  const fast_path = signals.some((s) => s.signal_type === 'CANARY_TAMPER' && s.fired);
  const discriminatingFired = fired.some((s) => DISCRIMINATING.has(s.signal_type));

  // Destructive ONLY if: decoy fast-path, OR >=minCorroboration signals incl. >=1 discriminating one.
  const destructive = fast_path || (corroborating_count >= cfg.minCorroboration && discriminatingFired);

  let verdict: Verdict;
  let recommended_action: RecommendedAction;
  if (destructive) {
    verdict = 'MASS_ENCRYPTION';
    recommended_action = 'ISOLATE_HOST';
  } else if (corroborating_count >= 1) {
    verdict = 'SUSPICIOUS';
    recommended_action = 'ALERT';
  } else {
    verdict = 'BENIGN';
    recommended_action = 'NONE';
  }

  // Allow-list suppression — never overrides the decoy fast-path (a legit encryptor never touches decoys).
  const attributedProcesses = mutationProcesses(window);
  let suppressedByAllowlist = false;
  let suppressionReason: string | null = null;
  if (
    recommended_action === 'ISOLATE_HOST' &&
    !fast_path &&
    cfg.allowlist.length > 0 &&
    allMutationsAllowlisted(window, cfg.allowlist)
  ) {
    suppressedByAllowlist = true;
    suppressionReason = `every signal-bearing event is from an allow-listed signed process (${attributedProcesses.join(', ')}); destructive action suppressed, alert raised`;
    recommended_action = 'ALERT';
  }

  let v: DetectionVerdict = {
    schema_version: SCHEMA_VERSION,
    verdict_id: ctx.verdict_id,
    host_id: ctx.host_id,
    agent_id: ctx.agent_id,
    decided_at: latestTimestamp(window),
    verdict,
    confidence: confidenceFor(verdict, fast_path, corroborating_count),
    fast_path,
    signals,
    corroborating_count,
    recommended_action,
    evidence_ref: ctx.evidence_ref,
  };

  // FAIL-CLOSED backstop. The C2 schema refine encodes the >=2-or-fast-path rule, but NOT the stronger
  // discriminating-signal requirement; so we re-check BOTH here independently of the construction above, so
  // any future code change that emits ISOLATE_HOST without a decoy fast-path or a discriminating signal is
  // caught and downgraded rather than wrongly isolating a host.
  const violatesPolicy = v.recommended_action === 'ISOLATE_HOST' && !(v.fast_path || discriminatingFired);
  const parsed = DetectionVerdictSchema.safeParse(v);
  if (!parsed.success || violatesPolicy) {
    v = {
      ...v,
      recommended_action: 'ALERT',
      verdict: v.verdict === 'MASS_ENCRYPTION' ? 'SUSPICIOUS' : v.verdict,
    };
  }
  return { verdict: v, suppressedByAllowlist, suppressionReason, attributedProcesses };
}
