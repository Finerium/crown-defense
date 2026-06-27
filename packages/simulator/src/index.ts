/**
 * @crown/simulator — the SAFE ransomware simulator INTERFACE (Phase 0 stub; implemented in Phase 1).
 *
 * SAFETY BOUNDARY (non-negotiable): this is a benign, reversible, key-retaining, single-directory,
 * non-propagating, no-network test generator. It NEVER handles real/live malware. Detection and the
 * test harness reference this interface from line one; the full parametric implementation lands in Phase 1
 * and is authored by the main-thread orchestrator (it is the graded oracle, so workers cannot write it).
 */

/** Evasion modes the parametric simulator must produce (AC-DET-01..03, AC-DET-06 ≥4 modes). */
export type EvasionMode =
  | 'FULL' // encrypt entire file contents
  | 'INTERMITTENT_EVERY_N_BYTES' // encrypt every Nth block (LockFile-class; defeats entropy-only)
  | 'HEADER_ONLY' // corrupt only the file header/magic bytes
  | 'FIRST_4KB' // encrypt only the first 4 KiB
  | 'LOW_AND_SLOW'; // throttled, below naive op-frequency thresholds

export interface SimulatorConfig {
  targetDir: string; // single directory; the simulator never escapes it
  mode: EvasionMode;
  filesPerSecond: number; // speed (throttle for LOW_AND_SLOW)
  fileTypes: string[]; // e.g. ['docx', 'xlsx', 'pdf', 'jpg']
  intermittentBlockBytes?: number; // for INTERMITTENT_EVERY_N_BYTES
  encryptedExtension: string; // e.g. '.vntr' (appended; reversible)
  keepKey: true; // ALWAYS true — reversible by construction (benign)
  durationMs?: number;
}

export interface SimulatorRunSummary {
  mode: EvasionMode;
  filesTouched: number;
  bytesRewritten: number;
  startedAt: string;
  endedAt: string;
  reversible: true;
}

export interface Simulator {
  /** Plant benign target files in targetDir (idempotent). */
  seed(count: number): Promise<void>;
  /** Run the simulated encryption per config; resolves with a summary. Never propagates, never networks. */
  run(): Promise<SimulatorRunSummary>;
  /** Restore every touched file from the retained key (proves benign/reversible). */
  restore(): Promise<{ restored: number }>;
  stop(): void;
}

export const ALL_EVASION_MODES: EvasionMode[] = [
  'FULL',
  'INTERMITTENT_EVERY_N_BYTES',
  'HEADER_ONLY',
  'FIRST_4KB',
  'LOW_AND_SLOW',
];

/** Phase 0 marker — replaced by the real implementation in Phase 1. */
export function createSimulator(_config: SimulatorConfig): Simulator {
  throw new Error('NotImplemented: the safe simulator is built in Phase 1 (main-thread oracle).');
}
