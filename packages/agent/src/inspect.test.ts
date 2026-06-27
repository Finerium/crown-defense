import { describe, expect, it } from 'vitest';
import { entropy, formatValid, inferType, magicChanged } from './inspect.js';

// The agent's OWN validators (independent of the test oracle). These prove the agent computes structural
// validity / entropy / magic-change honestly from real bytes.

function validPng(): Uint8Array {
  // PNG sig + IHDR + IDAT + IEND, all with correct CRC32 (built independently here).
  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++)
      c = ((TABLE[(c ^ (b[i] as number)) & 0xff] as number) ^ (c >>> 8)) >>> 0;
    return (c ^ 0xffffffff) >>> 0;
  };
  const be = (n: number) => Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
  const chunk = (type: string, data: Uint8Array) => {
    const td = new Uint8Array([...type].map((c) => c.charCodeAt(0)).concat([...data]));
    return new Uint8Array([...be(data.length), ...td, ...be(crc(td))]);
  };
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return new Uint8Array([
    ...sig,
    ...chunk('IHDR', new Uint8Array(13)),
    ...chunk(
      'IDAT',
      Uint8Array.from({ length: 64 }, (_, i) => (i * 37) & 255)
    ),
    ...chunk('IEND', new Uint8Array(0)),
  ]);
}

describe('agent inspect module (independent validators)', () => {
  it('validates a structurally-valid PNG and rejects interior corruption (magic intact)', () => {
    const png = validPng();
    expect(inferType(png)).toBe('png');
    expect(formatValid(png)).toBe(true);
    // Corrupt an interior IDAT byte but leave the 8-byte magic intact => CRC fails => invalid, magic same.
    const corrupted = png.slice();
    corrupted[40] = (corrupted[40] as number) ^ 0xff;
    expect(magicChanged(png, corrupted)).toBe(false);
    expect(formatValid(corrupted)).toBe(false); // structural validation catches it (the intermittent counter)
  });

  it('text validity + non-ASCII corruption', () => {
    const txt = new TextEncoder().encode('hello, crown defense\nrow,1,2,3\n');
    expect(inferType(txt)).toBe('text');
    expect(formatValid(txt)).toBe(true);
    const bin = txt.slice();
    bin[2] = 0xff;
    expect(formatValid(bin)).toBe(false);
  });

  it('flags OPAQUE high-entropy output as invalid (ciphertext signature — catches full encryption of any type)', () => {
    // No recognizable magic + near-maximal uniform entropy => opaque => structurally INVALID. This is the
    // fix for the bulk-rewrite evasion (encrypting already-high-entropy mp4/jpg gives ~0 entropy delta, but
    // the opaque result is still caught structurally).
    const cipher = new Uint8Array(4096);
    let s = 12345;
    for (let i = 0; i < cipher.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      cipher[i] = (s >>> 24) & 0xff;
    }
    expect(inferType(cipher)).toBe('opaque');
    expect(formatValid(cipher)).toBe(false);
  });

  it('returns null (unknown), never a stamped pass, for a LOW-entropy unidentifiable type', () => {
    const lowBinary = new Uint8Array(256).fill(0x01); // no magic, not text, low entropy => genuinely unknown
    expect(inferType(lowBinary)).toBe('unknown');
    expect(formatValid(lowBinary)).toBeNull();
  });

  it('recognizes benign high-entropy containers (webp/gzip) as VALID, not opaque', () => {
    const webp = new Uint8Array([
      0x52,
      0x49,
      0x46,
      0x46,
      1,
      2,
      3,
      4,
      0x57,
      0x45,
      0x42,
      0x50,
      ...new Array(2000).fill(7),
    ]);
    const gzip = new Uint8Array([0x1f, 0x8b, ...new Array(2000).fill(9)]);
    expect(formatValid(webp)).toBe(true); // a real conversion output must not be flagged as encryption
    expect(formatValid(gzip)).toBe(true);
  });

  it('recognizes modern compression magics (zstd/lz4/zlib) so benign compression is not a false positive', () => {
    // High-entropy bodies, but valid recognized magics — must NOT be flagged opaque (the Lens-A fix).
    const body = (seed: number) => {
      const b = new Uint8Array(2000);
      let s = seed >>> 0;
      for (let i = 0; i < b.length; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        b[i] = (s >>> 24) & 0xff;
      }
      return b;
    };
    const zstd = new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, ...body(1)]);
    const lz4 = new Uint8Array([0x04, 0x22, 0x4d, 0x18, ...body(2)]);
    const zlib = new Uint8Array([0x78, 0x9c, ...body(3)]); // 0x789c % 31 == 0
    expect(inferType(zstd)).toBe('zstd');
    expect(inferType(lz4)).toBe('lz4');
    expect(inferType(zlib)).toBe('zlib');
    for (const c of [zstd, lz4, zlib]) expect(formatValid(c)).toBe(true);
  });

  it('entropy: low for text, high for random', () => {
    const txt = new TextEncoder().encode('a'.repeat(2000));
    const rnd = Uint8Array.from({ length: 2000 }, (_, i) => (i * 2654435761) & 255);
    expect(entropy(txt)).toBeLessThan(1);
    expect(entropy(rnd)).toBeGreaterThan(7);
  });

  it('magicChanged detects a smashed header', () => {
    const a = validPng();
    const b = a.slice();
    b[0] = 0x00;
    expect(magicChanged(a, b)).toBe(true);
  });
});
