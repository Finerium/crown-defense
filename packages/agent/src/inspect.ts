/**
 * The endpoint agent's OWN file-inspection module (ADR-001 file-format-validation, the intermittent-
 * encryption counter). PRODUCT code, implemented INDEPENDENTLY of the test oracle's validators.
 *
 * The discrimination that matters (from adversarial review): COMPRESSION and benign format CONVERSION
 * raise entropy and change type, just like encryption. The honest tell is STRUCTURE. So the agent:
 *  - recognizes a broad set of benign container magics (image/audio/video/archive/doc) and trusts them;
 *  - DEEPLY validates the types it can (png/zip via CRC32, text via encoding) — catches intermittent
 *    encryption that keeps the magic but corrupts the body;
 *  - flags as STRUCTURALLY INVALID (format_valid=false) a file that is "opaque": no recognizable magic AND
 *    near-maximal uniform entropy — the signature of ciphertext (catches full encryption of ANY type,
 *    incl. already-high-entropy mp4/jpg, which a naive entropy check would miss).
 */

const OPAQUE_ENTROPY = 7.8; // near-maximal uniform entropy with no structure => ciphertext-like

/** Shannon entropy of a byte window, 0..8 bits/byte. */
export function entropy(buf: Uint8Array, windowBytes = 8192): number {
  const view = buf.subarray(0, Math.min(buf.length, windowBytes));
  if (view.length === 0) return 0;
  const counts = new Uint32Array(256);
  for (let i = 0; i < view.length; i++) {
    const v = view[i] as number;
    counts[v] = (counts[v] as number) + 1;
  }
  let h = 0;
  for (let s = 0; s < 256; s++) {
    const c = counts[s] as number;
    if (c === 0) continue;
    const p = c / view.length;
    h -= p * Math.log2(p);
  }
  return Math.round(h * 1000) / 1000;
}

// CRC32 (IEEE) — standard algorithm, used to verify PNG chunk + ZIP stored-entry integrity.
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++)
    c = ((TABLE[(c ^ (buf[i] as number)) & 0xff] as number) ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

function at(b: Uint8Array, off: number, sig: number[]): boolean {
  if (b.length < off + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[off + i] !== sig[i]) return false;
  return true;
}
function beU32(b: Uint8Array, o: number): number {
  return (
    (((b[o] as number) << 24) |
      ((b[o + 1] as number) << 16) |
      ((b[o + 2] as number) << 8) |
      (b[o + 3] as number)) >>>
    0
  );
}
function leU16(b: Uint8Array, o: number): number {
  return ((b[o] as number) | ((b[o + 1] as number) << 8)) >>> 0;
}
function leU32(b: Uint8Array, o: number): number {
  return (
    ((b[o] as number) |
      ((b[o + 1] as number) << 8) |
      ((b[o + 2] as number) << 16) |
      ((b[o + 3] as number) << 24)) >>>
    0
  );
}
function findSig(b: Uint8Array, sig: number[], from = 0): number {
  outer: for (let i = from; i + sig.length <= b.length; i++) {
    for (let j = 0; j < sig.length; j++) if (b[i + j] !== sig[j]) continue outer;
    return i;
  }
  return -1;
}

// Broad benign-container magic table (the more we recognize, the fewer benign conversions look "opaque").
const MAGICS: Array<{ off: number; sig: number[]; type: string }> = [
  { off: 0, sig: [0x89, 0x50, 0x4e, 0x47], type: 'png' },
  { off: 0, sig: [0xff, 0xd8, 0xff], type: 'jpg' },
  { off: 0, sig: [0x47, 0x49, 0x46, 0x38], type: 'gif' },
  { off: 0, sig: [0x42, 0x4d], type: 'bmp' },
  { off: 0, sig: [0x25, 0x50, 0x44, 0x46], type: 'pdf' },
  { off: 0, sig: [0x50, 0x4b, 0x03, 0x04], type: 'zip' },
  { off: 0, sig: [0x1f, 0x8b], type: 'gzip' },
  { off: 0, sig: [0x42, 0x5a, 0x68], type: 'bzip2' },
  { off: 0, sig: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], type: 'xz' },
  { off: 0, sig: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], type: '7z' },
  { off: 0, sig: [0x52, 0x61, 0x72, 0x21], type: 'rar' },
  { off: 0, sig: [0x52, 0x49, 0x46, 0x46], type: 'riff' }, // webp/wav/avi
  { off: 4, sig: [0x66, 0x74, 0x79, 0x70], type: 'mp4' }, // ftyp
  { off: 0, sig: [0x49, 0x44, 0x33], type: 'mp3' },
  { off: 0, sig: [0x4f, 0x67, 0x67, 0x53], type: 'ogg' },
  { off: 0, sig: [0x66, 0x4c, 0x61, 0x43], type: 'flac' },
  { off: 0, sig: [0x7f, 0x45, 0x4c, 0x46], type: 'elf' },
];

/** Coarse type tag from magic bytes (NOT the extension). 'opaque' = no magic + maximal entropy; 'unknown'
 *  = no magic + neither text nor opaque; 'text' = printable ASCII. */
export function inferType(b: Uint8Array): string {
  for (const m of MAGICS) if (at(b, m.off, m.sig)) return m.type;
  // text?
  let printable = 0;
  const n = Math.min(b.length, 512);
  for (let i = 0; i < n; i++) {
    const c = b[i] as number;
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) printable++;
  }
  if (n > 0 && printable / n > 0.95) return 'text';
  return entropy(b) >= OPAQUE_ENTROPY ? 'opaque' : 'unknown';
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const EOCD = [0x50, 0x4b, 0x05, 0x06];

function validatePng(b: Uint8Array): boolean {
  for (let i = 0; i < 8; i++) if (b[i] !== PNG[i]) return false;
  let off = 8;
  let ihdr = false;
  while (off + 12 <= b.length) {
    const len = beU32(b, off);
    const dataEnd = off + 8 + len;
    if (len > b.length || dataEnd + 4 > b.length) return false;
    if (crc32(b, off + 4, dataEnd) !== beU32(b, dataEnd)) return false; // interior CRC
    const type = String.fromCharCode(...b.subarray(off + 4, off + 8));
    if (type === 'IHDR') ihdr = true;
    if (type === 'IEND') return ihdr;
    off = dataEnd + 4;
  }
  return false;
}
function validateZip(b: Uint8Array): boolean {
  if (leU16(b, 8) !== 0) return findSig(b, EOCD) !== -1; // not stored => magic + EOCD level
  const crc = leU32(b, 14);
  const csize = leU32(b, 18);
  const dataStart = 30 + leU16(b, 26) + leU16(b, 28);
  const dataEnd = dataStart + csize;
  if (dataEnd > b.length) return false;
  if (crc32(b, dataStart, dataEnd) !== crc) return false; // stored-entry integrity
  return findSig(b, EOCD, dataEnd) !== -1;
}

/**
 * Structural validity. false = corrupted/opaque (the encryption tell). true = a recognized, structurally
 * intact file. null = genuinely unidentifiable but NOT opaque (low-entropy unknown) — never a stamped pass.
 */
export function formatValid(b: Uint8Array): boolean | null {
  const t = inferType(b);
  switch (t) {
    case 'png':
      return validatePng(b);
    case 'zip':
      return validateZip(b);
    case 'pdf':
      return findSig(b, [0x25, 0x25, 0x45, 0x4f, 0x46]) !== -1; // %%EOF
    case 'jpg':
      return b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9; // EOI
    case 'text': {
      for (let i = 0; i < b.length; i++) if ((b[i] as number) >= 0x80) return false;
      return true;
    }
    case 'opaque':
      return false; // no structure + near-maximal entropy => ciphertext-like (full-encryption catch)
    case 'unknown':
      return null; // genuinely unidentifiable, not opaque
    default:
      return true; // a recognized benign container (gif/bmp/webp/gzip/mp4/...) we trust by magic
  }
}

/** Did the leading magic bytes change between two versions of a file? */
export function magicChanged(before: Uint8Array, after: Uint8Array, n = 8): boolean {
  const m = Math.min(n, before.length, after.length);
  for (let i = 0; i < m; i++) if (before[i] !== after[i]) return true;
  return before.length < n || after.length < n ? before.length !== after.length : false;
}
