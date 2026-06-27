import { xorRange } from './crypto.js';

/** Evasion modes the parametric simulator must produce (AC-DET-01..03, AC-DET-06 >=4 modes). */
export type EvasionMode =
  | 'FULL' // encrypt entire file contents
  | 'INTERMITTENT_EVERY_N_BYTES' // encrypt every other block, MAGIC PRESERVED (LockFile-class; defeats entropy-only)
  | 'HEADER_ONLY' // corrupt only the file header/magic bytes
  | 'FIRST_4KB' // encrypt only the first 4 KiB
  | 'LOW_AND_SLOW'; // full content, but throttled below naive op-frequency thresholds

export const ALL_EVASION_MODES: EvasionMode[] = [
  'FULL',
  'INTERMITTENT_EVERY_N_BYTES',
  'HEADER_ONLY',
  'FIRST_4KB',
  'LOW_AND_SLOW',
];

export interface ModeResult {
  /** The byte ranges that were XORed, so restore() re-applies exactly the same transform (reversible). */
  ranges: Array<[number, number]>;
  /** Did the change touch the magic/header bytes? Drives header_changed in C1. */
  headerChanged: boolean;
}

export interface ModeOpts {
  magicLen: number; // bytes of magic to preserve in INTERMITTENT (so header_changed=false there)
  blockBytes: number; // intermittent block size (LockFile encrypts every other 16 bytes)
  headerBytes: number; // HEADER_ONLY corruption length
}

/**
 * Apply an evasion mode to `buf` in place and return the ranges touched. Reversible: calling
 * applyMode again with the same key+ranges restores (XOR is its own inverse) — restore() uses the ranges.
 *
 * Signal signatures by design:
 *  - FULL: whole file random => high entropy delta + invalid format + header changed.
 *  - INTERMITTENT: magic preserved, interior corrupted => entropy ~flat (binary bodies) BUT format invalid
 *    (CRC) and header_changed=false. This is the entropy-evasion case the format-validation signal catches.
 *  - HEADER_ONLY: only magic/header corrupted => header changed + invalid format, small entropy delta.
 *  - FIRST_4KB: first 4 KiB corrupted => header changed + invalid format.
 *  - LOW_AND_SLOW: same bytes as FULL; the throttling lives in the emitter (low writes/sec), not here.
 */
export function applyMode(buf: Uint8Array, key: Uint8Array, mode: EvasionMode, opts: ModeOpts): ModeResult {
  const len = buf.length;
  const ranges: Array<[number, number]> = [];
  const xor = (s: number, e: number) => {
    const lo = Math.max(0, s);
    const hi = Math.min(len, e);
    if (hi > lo) {
      xorRange(buf, key, lo, hi);
      ranges.push([lo, hi]);
    }
  };

  switch (mode) {
    case 'FULL':
    case 'LOW_AND_SLOW':
      xor(0, len);
      return { ranges, headerChanged: true };
    case 'HEADER_ONLY':
      xor(0, Math.min(len, opts.headerBytes));
      return { ranges, headerChanged: true };
    case 'FIRST_4KB':
      xor(0, Math.min(len, 4096));
      return { ranges, headerChanged: true };
    case 'INTERMITTENT_EVERY_N_BYTES': {
      const block = Math.max(8, opts.blockBytes);
      // Start at the first block boundary at/after the preserved magic; XOR every OTHER block.
      const start = Math.max(block, Math.ceil(opts.magicLen / block) * block);
      for (let o = start; o < len; o += block * 2) xor(o, o + block);
      return { ranges, headerChanged: false };
    }
  }
}
