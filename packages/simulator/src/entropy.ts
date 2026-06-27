/**
 * Shannon entropy over a byte window, 0..8 bits/byte. Oracle-side ground truth for the
 * read-vs-write entropy delta (ADR-011 Redemption method). The detection engine (Phase 2) computes
 * its own entropy independently; this is the oracle's honest measurement of the bytes it actually wrote.
 */
export function shannonEntropy(buf: Uint8Array): number {
  if (buf.length === 0) return 0;
  const counts = new Uint32Array(256);
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] as number;
    counts[v] = (counts[v] as number) + 1;
  }
  let h = 0;
  for (let s = 0; s < 256; s++) {
    const c = counts[s] as number;
    if (c === 0) continue;
    const p = c / buf.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Entropy of a leading window (default first 8 KiB) — what a sampling agent would see (bounded). */
export function windowEntropy(buf: Uint8Array, windowBytes = 8192): number {
  return shannonEntropy(buf.subarray(0, Math.min(buf.length, windowBytes)));
}
