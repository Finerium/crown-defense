import { createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * Reversible, benign "encryption": XOR with a deterministic keystream derived from a retained key.
 * XOR is its own inverse, so re-applying the SAME range with the SAME key restores the original byte
 * for byte. This is what makes the simulator benign by construction (key-retaining + reversible);
 * it is NOT cryptography and never claims to be. No key is ever discarded.
 */

const BLOCK = 32; // sha-256 output size

/** Derive a 32-byte run key from an optional seed (deterministic tests) or random bytes. */
export function deriveKey(seed?: string): Uint8Array {
  if (seed === undefined) return new Uint8Array(randomBytes(32));
  return new Uint8Array(createHash('sha256').update(`crown-sim:${seed}`).digest());
}

/** Keystream block for a given absolute byte offset (offset-addressed so partial ranges restore exactly). */
function keystreamBlock(key: Uint8Array, blockIndex: number): Buffer {
  return createHmac('sha256', Buffer.from(key)).update(`b:${blockIndex}`).digest();
}

/**
 * XOR buf[start,end) in place with the offset-addressed keystream. Calling twice with the same
 * arguments is a no-op (restores). Mutates `buf`.
 */
export function xorRange(buf: Uint8Array, key: Uint8Array, start: number, end: number): void {
  const lo = Math.max(0, start);
  const hi = Math.min(buf.length, end);
  for (let i = lo; i < hi; ) {
    const blockIndex = Math.floor(i / BLOCK);
    const ks = keystreamBlock(key, blockIndex);
    const base = blockIndex * BLOCK;
    for (let j = i - base; j < BLOCK && i < hi; j++, i++) {
      buf[i] = (buf[i] as number) ^ (ks[j] as number);
    }
  }
}
