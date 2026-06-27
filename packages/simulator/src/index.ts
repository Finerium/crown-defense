/**
 * @crown/simulator — the SAFE ransomware simulator (the primary detection oracle, Phase 1).
 *
 * SAFETY BOUNDARY (non-negotiable): benign, reversible, key-retaining, single-directory, non-propagating,
 * no network, no child process. It NEVER downloads, handles, builds, stores, or executes real/live malware.
 * It performs real (reversible) file I/O and emits the ground-truth C1 telemetry the detection engine grades.
 * Once frozen, this package is a TEST ORACLE: worker subagents are hook-denied from writing it.
 */
export { shannonEntropy, windowEntropy } from './entropy.js';
export { deriveKey, xorRange } from './crypto.js';
export {
  ALL_FILE_TYPES,
  CRC_PROTECTED_TYPES,
  type FileType,
  crc32,
  generateFile,
  magicBytes,
  validateFormat,
} from './formats.js';
export { ALL_EVASION_MODES, type EvasionMode, type ModeResult, applyMode } from './modes.js';
export {
  FAMILY_COUNT,
  FAMILY_PROFILES,
  type FamilyProfile,
  MODES_COVERED,
  familyByName,
} from './families.js';
export {
  type GroundTruth,
  SafeSimulator,
  type SimulatorConfig,
  type SimulatorRunSummary,
} from './simulator.js';

import { SafeSimulator, type SimulatorConfig } from './simulator.js';

/** Construct a safe simulator. Call seed(n) then run(); restore() proves reversibility. */
export function createSimulator(config: SimulatorConfig): SafeSimulator {
  return new SafeSimulator(config);
}
