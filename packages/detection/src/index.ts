/**
 * @crown/detection — deterministic multi-signal detection engine (Phase 2, no LLM). Consumes C1 telemetry,
 * produces C2 DetectionVerdicts. Enforces the >=2-corroboration rule for destructive recommendations and
 * the auditable allow-list suppression. Decides ONLY from C1 — never from oracle ground truth.
 */
export { type DetectionConfig, DEFAULT_CONFIG, ENV_KEYS, loadConfig } from './config.js';
export {
  evalCanary,
  evalEntropyDelta,
  evalFormatValidation,
  evalOpFrequency,
  evalTypeHeader,
  evaluateSignals,
} from './signals.js';
export { type DecisionContext, type DecisionResult, decide } from './fusion.js';
export { DetectionEngine } from './engine.js';
