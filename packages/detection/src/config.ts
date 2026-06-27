/**
 * Detection engine configuration — 12-factor (AC-CONFIG): thresholds are env-driven. SAFETY INVARIANTS
 * are clamped and CANNOT be weakened by config (a destructive verdict always needs >=2 corroborating
 * signals incl. >=1 encryption-discriminating one; the window is always >=1; the host map is bounded).
 * Env var names are the single source of truth in ENV_KEYS so .env.example cannot drift (drift test).
 */
export const ENV_KEYS = {
  entropyDeltaThreshold: 'CROWN_DET_ENTROPY_DELTA',
  entropyLowBase: 'CROWN_DET_ENTROPY_LOW_BASE',
  entropyHigh: 'CROWN_DET_ENTROPY_HIGH',
  opFreqWritesThreshold: 'CROWN_DET_OPFREQ_WRITES',
  opFreqRenamesThreshold: 'CROWN_DET_OPFREQ_RENAMES',
  opFreqCumulativeThreshold: 'CROWN_DET_OPFREQ_CUMULATIVE',
  formatFailMinCount: 'CROWN_DET_FORMAT_FAIL_MIN',
  typeHeaderMinCount: 'CROWN_DET_TYPE_HEADER_MIN',
  entropyDeltaMinCount: 'CROWN_DET_ENTROPY_MIN',
  windowSize: 'CROWN_DET_WINDOW',
  minCorroboration: 'CROWN_DET_MIN_CORROBORATION',
  maxTrackedHosts: 'CROWN_DET_MAX_HOSTS',
  allowlist: 'CROWN_DET_ALLOWLIST',
} as const;

export interface DetectionConfig {
  /** Minimum rise (entropy_write - entropy_read) for the ENTROPY_DELTA signal (context). */
  entropyDeltaThreshold: number;
  /** entropy_read below this = the file was compressible/structured (a low->high rise is meaningful). */
  entropyLowBase: number;
  /** entropy_write at/above this = the file is now opaque/high-entropy. */
  entropyHigh: number;
  opFreqWritesThreshold: number;
  opFreqRenamesThreshold: number;
  /** cumulative file-mutation events in the window that fire op-frequency (low-and-slow counter, CONTEXT). */
  opFreqCumulativeThreshold: number;
  /** Minimum number of structurally-invalid files before FORMAT_VALIDATION_FAIL fires (no single-file trip). */
  formatFailMinCount: number;
  /** Minimum number of type/header changes before TYPE_HEADER_CHANGE fires. */
  typeHeaderMinCount: number;
  /** Minimum number of low->high entropy rises before ENTROPY_DELTA fires. */
  entropyDeltaMinCount: number;
  /** Bounded per-host rolling window (events). SAFETY: clamped to >=1 (0 would fail-open). */
  windowSize: number;
  /** Corroborating signals for a destructive verdict. SAFETY: clamped to >=2 (cannot be weakened). */
  minCorroboration: number;
  /** Maximum hosts tracked at once (fleet memory bound). SAFETY: clamped to >=1; LRU-evicted beyond. */
  maxTrackedHosts: number;
  /** Process paths whose IN-PLACE encryption is authorized (AC-FP-02). Suppression is auditable, and only
   *  applies when EVERY signal-bearing event is from an allow-listed path (never on a window-modal path). */
  allowlist: string[];
}

function num(env: NodeJS.ProcessEnv, key: string, dflt: number): number {
  const v = env[key];
  if (v === undefined || v === '') return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}
function list(env: NodeJS.ProcessEnv, key: string): string[] {
  const v = env[key];
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DetectionConfig {
  return {
    entropyDeltaThreshold: num(env, ENV_KEYS.entropyDeltaThreshold, 1.5),
    entropyLowBase: num(env, ENV_KEYS.entropyLowBase, 6.0),
    entropyHigh: num(env, ENV_KEYS.entropyHigh, 7.5),
    opFreqWritesThreshold: num(env, ENV_KEYS.opFreqWritesThreshold, 50),
    opFreqRenamesThreshold: num(env, ENV_KEYS.opFreqRenamesThreshold, 20),
    opFreqCumulativeThreshold: Math.max(2, num(env, ENV_KEYS.opFreqCumulativeThreshold, 8)),
    formatFailMinCount: Math.max(1, num(env, ENV_KEYS.formatFailMinCount, 2)),
    typeHeaderMinCount: Math.max(1, num(env, ENV_KEYS.typeHeaderMinCount, 2)),
    entropyDeltaMinCount: Math.max(1, num(env, ENV_KEYS.entropyDeltaMinCount, 2)),
    windowSize: Math.max(1, Math.floor(num(env, ENV_KEYS.windowSize, 256))),
    // SAFETY FLOOR: a destructive verdict can never require fewer than 2 corroborating signals.
    minCorroboration: Math.max(2, Math.floor(num(env, ENV_KEYS.minCorroboration, 2))),
    maxTrackedHosts: Math.max(1, Math.floor(num(env, ENV_KEYS.maxTrackedHosts, 5000))),
    allowlist: list(env, ENV_KEYS.allowlist),
  };
}

export const DEFAULT_CONFIG: DetectionConfig = loadConfig({});
