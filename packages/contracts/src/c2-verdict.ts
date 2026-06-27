import { z } from 'zod';
import { Id, SchemaVersion, Timestamp } from './common.js';

/** C2 — Detection Engine → Containment Module (verdict). Containment consumes only this. */

export const Verdict = z.enum(['BENIGN', 'SUSPICIOUS', 'MASS_ENCRYPTION']);
export type Verdict = z.infer<typeof Verdict>;

export const SignalType = z.enum([
  'CANARY_TAMPER',
  'ENTROPY_DELTA',
  'OP_FREQUENCY',
  'TYPE_HEADER_CHANGE',
  'FORMAT_VALIDATION_FAIL',
  'ML_CLASSIFIER',
]);
export type SignalType = z.infer<typeof SignalType>;

export const RecommendedAction = z.enum(['NONE', 'MONITOR', 'ALERT', 'ISOLATE_HOST']);
export type RecommendedAction = z.infer<typeof RecommendedAction>;

export const DetectionSignal = z.object({
  signal_type: SignalType,
  fired: z.boolean(),
  score: z.number().nullable(),
  detail: z.string().nullable(), // human/audit-readable explanation (explainability)
});
export type DetectionSignal = z.infer<typeof DetectionSignal>;

export const DetectionVerdict = z
  .object({
    schema_version: SchemaVersion,
    verdict_id: Id,
    host_id: Id,
    agent_id: Id,
    decided_at: Timestamp,
    verdict: Verdict,
    confidence: z.number().min(0).max(1),
    fast_path: z.boolean(), // canary-tamper shortcut
    signals: z.array(DetectionSignal),
    corroborating_count: z.number().int().min(0),
    recommended_action: RecommendedAction,
    evidence_ref: z.string(),
  })
  // INVARIANT (C2): corroborating_count is "the number of independent signals fired" (blueprint C2).
  // Bind it to the ACTUAL fired signals so a producer cannot self-report inflated corroboration to
  // smuggle a destructive verdict past the ≥2 rule. (Closes the self-reported-count gap.)
  .refine((v) => v.corroborating_count === v.signals.filter((s) => s.fired).length, {
    message: 'corroborating_count must equal the number of fired signals (no self-reported inflation)',
    path: ['corroborating_count'],
  })
  // INVARIANT (C2/AC-DET-05): a destructive recommendation requires ≥2 corroborating signals
  // UNLESS the canary fast-path fired. Encoded here so every producer is checked at the boundary.
  .refine(
    (v) => v.recommended_action !== 'ISOLATE_HOST' || v.corroborating_count >= 2 || v.fast_path === true,
    {
      message: 'ISOLATE_HOST requires corroborating_count >= 2 OR fast_path === true',
      path: ['recommended_action'],
    }
  );
export type DetectionVerdict = z.infer<typeof DetectionVerdict>;
