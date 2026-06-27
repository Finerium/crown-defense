/**
 * Oracle-side file generators + structural format validators.
 *
 * Why real validators matter: the format-validation signal is the product's counter to INTERMITTENT
 * encryption (LockFile-class), where a file stays statistically normal (low entropy delta) but becomes
 * structurally invalid. For that signal to be honest, the oracle must run a REAL structural check, not
 * stamp `format_valid=false` by fiat. PNG and ZIP carry CRC32 integrity, so interior corruption that
 * leaves the magic bytes intact is still genuinely detected (header_changed=false, format_valid=false).
 * The detection engine (Phase 2) ships its own independent validators; this one is the ground truth.
 */

export type FileType = 'txt' | 'csv' | 'pdf' | 'png' | 'jpg' | 'docx' | 'xlsx';

export const ALL_FILE_TYPES: FileType[] = ['txt', 'csv', 'pdf', 'png', 'jpg', 'docx', 'xlsx'];

/** Types whose validator detects INTERIOR corruption (CRC-protected), magic untouched. */
export const CRC_PROTECTED_TYPES: FileType[] = ['png', 'docx', 'xlsx'];

// ---- deterministic PRNG (reproducible oracle; independent of Math.random) ----
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomBytesDet(rng: () => number, n: number): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = Math.floor(rng() * 256) & 0xff;
  return b;
}

// ---- CRC32 (IEEE; PNG + ZIP) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = ((CRC_TABLE[(c ^ (buf[i] as number)) & 0xff] as number) ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function be32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = (n >>> 24) & 0xff;
  b[1] = (n >>> 16) & 0xff;
  b[2] = (n >>> 8) & 0xff;
  b[3] = n & 0xff;
  return b;
}
function readBE32(buf: Uint8Array, off: number): number {
  return (
    (((buf[off] as number) << 24) |
      ((buf[off + 1] as number) << 16) |
      ((buf[off + 2] as number) << 8) |
      (buf[off + 3] as number)) >>>
    0
  );
}
function le16(n: number): Uint8Array {
  return Uint8Array.from([n & 0xff, (n >>> 8) & 0xff]);
}
function le32(n: number): Uint8Array {
  return Uint8Array.from([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
}
function readLE32(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] as number) |
      ((buf[off + 1] as number) << 8) |
      ((buf[off + 2] as number) << 16) |
      ((buf[off + 3] as number) << 24)) >>>
    0
  );
}
function readLE16(buf: Uint8Array, off: number): number {
  return ((buf[off] as number) | ((buf[off + 1] as number) << 8)) >>> 0;
}
function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
function ascii(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}
function startsWith(buf: Uint8Array, sig: number[]): boolean {
  if (buf.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (buf[i] !== sig[i]) return false;
  return true;
}
function indexOfSig(buf: Uint8Array, sig: number[], from = 0): number {
  outer: for (let i = from; i + sig.length <= buf.length; i++) {
    for (let j = 0; j < sig.length; j++) if (buf[i + j] !== sig[j]) continue outer;
    return i;
  }
  return -1;
}

// ---- PNG (CRC-protected chunks) ----
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeData = concat([ascii(type), data]);
  return concat([be32(data.length), typeData, be32(crc32(typeData))]);
}
function genPng(rng: () => number, size: number): Uint8Array {
  const ihdr = randomBytesDet(rng, 13); // plausible header payload (CRC-valid by construction)
  const idat = randomBytesDet(rng, Math.max(64, size - 60)); // high-entropy image data
  return concat([
    Uint8Array.from(PNG_SIG),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}
function validatePng(buf: Uint8Array): boolean {
  if (!startsWith(buf, PNG_SIG)) return false;
  let off = 8;
  let sawIHDR = false;
  let sawIEND = false;
  while (off + 12 <= buf.length) {
    const len = readBE32(buf, off);
    const typeStart = off + 4;
    const dataEnd = typeStart + 4 + len;
    const crcOff = dataEnd;
    if (len > buf.length || crcOff + 4 > buf.length) return false;
    const expected = readBE32(buf, crcOff);
    if (crc32(buf.subarray(typeStart, dataEnd)) !== expected) return false;
    const type = String.fromCharCode(...buf.subarray(typeStart, typeStart + 4));
    if (type === 'IHDR') sawIHDR = true;
    if (type === 'IEND') {
      sawIEND = true;
      break;
    }
    off = crcOff + 4;
  }
  return sawIHDR && sawIEND;
}

// ---- ZIP stored (docx/xlsx); CRC32 of the stored entry is the integrity check ----
const ZIP_LFH = [0x50, 0x4b, 0x03, 0x04];
const ZIP_EOCD = [0x50, 0x4b, 0x05, 0x06];
function genZip(rng: () => number, size: number): Uint8Array {
  const name = ascii('[Content_Types].xml');
  const data = randomBytesDet(rng, Math.max(32, size - 140)); // "stored" (uncompressed) high-entropy body
  const crc = crc32(data);
  const lfh = concat([
    Uint8Array.from(ZIP_LFH),
    le16(20), // version needed
    le16(0), // flags
    le16(0), // method = stored
    le16(0),
    le16(0), // time, date
    le32(crc),
    le32(data.length), // compressed size
    le32(data.length), // uncompressed size
    le16(name.length),
    le16(0), // name len, extra len
    name,
    data,
  ]);
  // Minimal EOCD (offsets not deeply validated; presence + the LFH CRC are the honest checks).
  const eocd = concat([
    Uint8Array.from(ZIP_EOCD),
    le16(0),
    le16(0),
    le16(1),
    le16(1), // disk numbers, entry counts
    le32(0),
    le32(lfh.length),
    le16(0), // cd size, cd offset, comment len
  ]);
  return concat([lfh, eocd]);
}
function validateZip(buf: Uint8Array): boolean {
  if (!startsWith(buf, ZIP_LFH)) return false;
  const method = readLE16(buf, 8);
  if (method !== 0) return true; // not a stored entry we can integrity-check; accept magic-level validity
  const crc = readLE32(buf, 14);
  const csize = readLE32(buf, 18);
  const nameLen = readLE16(buf, 26);
  const extraLen = readLE16(buf, 28);
  const dataStart = 30 + nameLen + extraLen;
  const dataEnd = dataStart + csize;
  if (dataEnd > buf.length) return false;
  if (crc32(buf.subarray(dataStart, dataEnd)) !== crc) return false; // interior corruption caught here
  return indexOfSig(buf, ZIP_EOCD, dataEnd) !== -1;
}

// ---- JPEG (marker-structural; no CRC, like the real format) ----
function genJpeg(rng: () => number, size: number): Uint8Array {
  const scan = randomBytesDet(rng, Math.max(64, size - 24));
  return concat([
    Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    ascii('JFIF'),
    Uint8Array.from([0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
    Uint8Array.from([0xff, 0xda]), // start of scan
    scan,
    Uint8Array.from([0xff, 0xd9]), // EOI
  ]);
}
function validateJpeg(buf: Uint8Array): boolean {
  return (
    buf.length >= 4 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[buf.length - 2] === 0xff &&
    buf[buf.length - 1] === 0xd9 &&
    indexOfSig(buf, [0xff, 0xe0]) !== -1
  );
}

// ---- PDF (header + xref marker + trailer) ----
function genPdf(rng: () => number, size: number): Uint8Array {
  const filler = randomBytesDet(rng, Math.max(64, size - 80));
  return concat([
    ascii('%PDF-1.7\n'),
    ascii('1 0 obj<<>>stream\n'),
    filler,
    ascii('\nendstream endobj\n'),
    ascii('startxref\n0\n%%EOF\n'),
  ]);
}
function validatePdf(buf: Uint8Array): boolean {
  if (!startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return false; // %PDF-
  return indexOfSig(buf, [...ascii('startxref')]) !== -1 && indexOfSig(buf, [...ascii('%%EOF')]) !== -1;
}

// ---- text/csv (encoding + low entropy) ----
const LOREM =
  'the quick brown fox jumps over the lazy dog. ' +
  'crown defense monitors filesystem activity for mass encryption. ';
function genText(size: number, csv: boolean): Uint8Array {
  let s = '';
  if (csv) {
    s = 'id,name,value,timestamp\n';
    let i = 0;
    while (s.length < size) {
      s += `${i},row${i},${(i * 7) % 1000},2026-06-28T00:00:00.000Z\n`;
      i++;
    }
  } else {
    while (s.length < size) s += LOREM;
  }
  return ascii(s.slice(0, Math.max(size, 16)));
}
function validateText(buf: Uint8Array): boolean {
  if (buf.length === 0) return false;
  let printable = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i] as number;
    if (b >= 0x80) return false; // non-ASCII byte => not the plain-text we generated => corrupted
    if (b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b < 0x7f)) printable++;
  }
  return printable / buf.length > 0.99;
}

/** Generate a structurally-valid benign file of the given type. Deterministic for a given (type,seed). */
export function generateFile(type: FileType, sizeBytes: number, seed = 1): Uint8Array {
  const rng = prng((seed * 2654435761) >>> 0);
  switch (type) {
    case 'png':
      return genPng(rng, sizeBytes);
    case 'docx':
    case 'xlsx':
      return genZip(rng, sizeBytes);
    case 'jpg':
      return genJpeg(rng, sizeBytes);
    case 'pdf':
      return genPdf(rng, sizeBytes);
    case 'csv':
      return genText(sizeBytes, true);
    case 'txt':
      return genText(sizeBytes, false);
  }
}

/** Run the real structural validator for a type. `true` => still a valid file of that type. */
export function validateFormat(type: FileType, buf: Uint8Array): boolean {
  switch (type) {
    case 'png':
      return validatePng(buf);
    case 'docx':
    case 'xlsx':
      return validateZip(buf);
    case 'jpg':
      return validateJpeg(buf);
    case 'pdf':
      return validatePdf(buf);
    case 'csv':
    case 'txt':
      return validateText(buf);
  }
}

/** The magic-byte length per type — the simulator preserves these for the header_changed=false demo. */
export function magicBytes(type: FileType): number {
  switch (type) {
    case 'png':
      return 8;
    case 'docx':
    case 'xlsx':
      return 4;
    case 'jpg':
      return 2;
    case 'pdf':
      return 5;
    default:
      return 0;
  }
}
