import type { DetectionSignal, SignalType, TelemetryEvent } from '@crown/contracts';
import type { DetectionConfig } from './config.js';

/**
 * Multi-signal evaluators (ADR-001). Each is a PURE function of a bounded window of C1 telemetry.
 *
 * The key correctness insight (from adversarial review): COMPRESSION and ENCRYPTION both raise entropy and
 * op-frequency, and benign format CONVERSION changes type/header. Only loss of STRUCTURAL VALIDITY (or a
 * decoy MODIFICATION) actually discriminates encryption. So signals are split into:
 *   - DISCRIMINATING: CANARY_TAMPER (decoy write/rename/delete), FORMAT_VALIDATION_FAIL (structural loss).
 *   - CONTEXT: ENTROPY_DELTA, OP_FREQUENCY, TYPE_HEADER_CHANGE (corroborate, but benign-compatible).
 * Fusion requires >=2 fired signals INCLUDING >=1 discriminating one before a destructive verdict.
 *
 * Context signals are gated on a MINIMUM count (not a single event), so one anomalous benign file plus
 * ambient op-frequency cannot reach a destructive verdict.
 */

export const DISCRIMINATING: ReadonlySet<SignalType> = new Set<SignalType>([
  'CANARY_TAMPER',
  'FORMAT_VALIDATION_FAIL',
]);

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

const MUTATION_EVENTS = new Set([
  'FILE_WRITE',
  'FILE_CREATE',
  'FILE_RENAME',
  'FILE_DELETE',
  'FILE_TYPE_CHANGED',
  'CANARY_TOUCHED',
]);

/** Decoy tamper — DISCRIMINATING fast-path. Fires only on MODIFICATION (write/rename/delete), never READ
 *  (a benign scanner/backup/AV routinely READS decoy files; reading one must not isolate a host). */
export function evalCanary(window: TelemetryEvent[]): DetectionSignal {
  const mods = window.filter(
    (e) =>
      e.event_type === 'CANARY_TOUCHED' &&
      (e.canary?.operation === 'WRITE' ||
        e.canary?.operation === 'RENAME' ||
        e.canary?.operation === 'DELETE')
  );
  return {
    signal_type: 'CANARY_TAMPER',
    fired: mods.length > 0,
    score: mods.length > 0 ? 1 : 0,
    detail: mods.length > 0 ? `${mods.length} decoy file(s) modified (fast-path)` : null,
  };
}

/** Entropy rose from a LOW base to HIGH on multiple files (CONTEXT — compression does this too). */
export function evalEntropyDelta(window: TelemetryEvent[], cfg: DetectionConfig): DetectionSignal {
  let maxDelta = 0;
  let n = 0;
  for (const e of window) {
    const r = e.file.entropy_read;
    const w = e.file.entropy_write;
    if (r === null || w === null) continue; // CREATE => no same-offset delta
    const d = w - r;
    if (d > maxDelta) maxDelta = d;
    // Meaningful only as a low->high transition (already-high files have ~0 delta; that is normal).
    if (d >= cfg.entropyDeltaThreshold && r < cfg.entropyLowBase && w >= cfg.entropyHigh) n++;
  }
  return {
    signal_type: 'ENTROPY_DELTA',
    fired: n >= cfg.entropyDeltaMinCount,
    score: clamp01(maxDelta / 8),
    detail:
      n >= cfg.entropyDeltaMinCount ? `${n} file(s) rose low->high (max delta ${maxDelta.toFixed(2)})` : null,
  };
}

/** Op-frequency — CONTEXT. Fires on instantaneous RATE or cumulative window ACTIVITY (low-and-slow). */
export function evalOpFrequency(window: TelemetryEvent[], cfg: DetectionConfig): DetectionSignal {
  let maxW = 0;
  let maxR = 0;
  let cumulative = 0;
  for (const e of window) {
    const w = e.op_window?.writes_per_sec ?? 0;
    const r = e.op_window?.renames_per_sec ?? 0;
    if (w > maxW) maxW = w;
    if (r > maxR) maxR = r;
    if (MUTATION_EVENTS.has(e.event_type)) cumulative++;
  }
  const fired =
    maxW >= cfg.opFreqWritesThreshold ||
    maxR >= cfg.opFreqRenamesThreshold ||
    cumulative >= cfg.opFreqCumulativeThreshold;
  return {
    signal_type: 'OP_FREQUENCY',
    fired,
    score: clamp01(Math.max(maxW / 200, maxR / 100, cumulative / 32)),
    detail: fired ? `peak ${maxW.toFixed(0)} w/s, ${maxR.toFixed(0)} r/s, ${cumulative} mutations` : null,
  };
}

/** Type/header change on multiple files — CONTEXT (a benign batch converter changes type too). */
export function evalTypeHeader(window: TelemetryEvent[], cfg: DetectionConfig): DetectionSignal {
  let header = 0;
  let typeChange = 0;
  for (const e of window) {
    if (e.file.header_changed === true) header++;
    const p = e.file.prev_type;
    const nt = e.file.new_type;
    if (p !== null && nt !== null && p !== nt) typeChange++;
  }
  const total = Math.max(header, typeChange);
  return {
    signal_type: 'TYPE_HEADER_CHANGE',
    fired: total >= cfg.typeHeaderMinCount,
    score: clamp01(total / Math.max(1, window.length)),
    detail: total >= cfg.typeHeaderMinCount ? `${header} header, ${typeChange} type change(s)` : null,
  };
}

/** Structural-validity loss on multiple files — DISCRIMINATING (the encryption tell + intermittent counter).
 *  null format_valid ("not validated" — e.g. an unrecognized type) is NOT a failure; only explicit false. */
export function evalFormatValidation(window: TelemetryEvent[], cfg: DetectionConfig): DetectionSignal {
  const fails = window.filter((e) => e.file.format_valid === false).length;
  return {
    signal_type: 'FORMAT_VALIDATION_FAIL',
    fired: fails >= cfg.formatFailMinCount,
    score: clamp01(fails / Math.max(1, window.length)),
    detail: fails >= cfg.formatFailMinCount ? `${fails} file(s) structurally invalid after write` : null,
  };
}

export function evaluateSignals(window: TelemetryEvent[], cfg: DetectionConfig): DetectionSignal[] {
  return [
    evalCanary(window),
    evalEntropyDelta(window, cfg),
    evalOpFrequency(window, cfg),
    evalTypeHeader(window, cfg),
    evalFormatValidation(window, cfg),
  ];
}
