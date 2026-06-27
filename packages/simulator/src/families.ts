import type { FileType } from './formats.js';
import type { EvasionMode } from './modes.js';

/**
 * Ransomware BEHAVIOR battery (AC-DET-06: >=20 behaviors/families, >=4 evasion modes). These are
 * parametric presets reproducing the published *encryption behavior* of each family — NEVER the malware
 * itself. The simulator stays benign/reversible; only the file-touch pattern, speed, and target types
 * mirror the reference family. Sources: public threat-intel reporting + MITRE ATT&CK T1486.
 */
export interface FamilyProfile {
  name: string;
  mode: EvasionMode;
  filesPerSecond: number;
  fileTypes: FileType[];
  blockBytes?: number;
  note: string;
}

const DOCS: FileType[] = ['docx', 'xlsx', 'pdf'];
const MEDIA: FileType[] = ['png', 'jpg'];
const MIXED: FileType[] = ['docx', 'xlsx', 'pdf', 'png', 'jpg', 'txt', 'csv'];

export const FAMILY_PROFILES: FamilyProfile[] = [
  { name: 'LockBit-3.0', mode: 'FULL', filesPerSecond: 280, fileTypes: MIXED, note: 'fast full encryptor' },
  {
    name: 'BrainCipher',
    mode: 'FULL',
    filesPerSecond: 250,
    fileTypes: MIXED,
    note: 'LockBit 3.0 variant (PDNS 2024)',
  },
  { name: 'Conti', mode: 'FULL', filesPerSecond: 200, fileTypes: DOCS, note: 'multithreaded full' },
  { name: 'Ryuk', mode: 'FULL', filesPerSecond: 120, fileTypes: DOCS, note: 'targeted full' },
  { name: 'REvil-Sodinokibi', mode: 'FULL', filesPerSecond: 160, fileTypes: MIXED, note: 'RaaS full' },
  { name: 'WannaCry', mode: 'FULL', filesPerSecond: 90, fileTypes: DOCS, note: 'worm-class full' },
  { name: 'Maze', mode: 'FULL', filesPerSecond: 140, fileTypes: MIXED, note: 'double-extortion full' },
  { name: 'DarkSide', mode: 'FULL', filesPerSecond: 150, fileTypes: MIXED, note: 'RaaS full' },
  { name: 'Cuba', mode: 'FULL', filesPerSecond: 110, fileTypes: DOCS, note: 'full' },
  { name: 'Babuk', mode: 'FULL', filesPerSecond: 130, fileTypes: MEDIA, note: 'full' },

  {
    name: 'LockFile',
    mode: 'INTERMITTENT_EVERY_N_BYTES',
    filesPerSecond: 180,
    fileTypes: ['docx', 'xlsx', 'png'],
    blockBytes: 16,
    note: 'every-other-16-bytes; the entropy-evasion archetype',
  },
  {
    name: 'BlackCat-ALPHV',
    mode: 'INTERMITTENT_EVERY_N_BYTES',
    filesPerSecond: 220,
    fileTypes: ['docx', 'xlsx', 'png'],
    blockBytes: 64,
    note: 'configurable intermittent',
  },
  {
    name: 'Play',
    mode: 'INTERMITTENT_EVERY_N_BYTES',
    filesPerSecond: 170,
    fileTypes: ['docx', 'png'],
    blockBytes: 32,
    note: 'intermittent',
  },
  {
    name: 'Royal',
    mode: 'INTERMITTENT_EVERY_N_BYTES',
    filesPerSecond: 190,
    fileTypes: ['docx', 'xlsx'],
    blockBytes: 128,
    note: 'partial/percentage encryption',
  },
  {
    name: 'Agenda-Qilin',
    mode: 'INTERMITTENT_EVERY_N_BYTES',
    filesPerSecond: 160,
    fileTypes: ['xlsx', 'png'],
    blockBytes: 48,
    note: 'intermittent (skip/step)',
  },
  {
    name: 'BlackBasta',
    mode: 'INTERMITTENT_EVERY_N_BYTES',
    filesPerSecond: 200,
    fileTypes: ['docx', 'png'],
    blockBytes: 64,
    note: 'intermittent',
  },

  {
    name: 'Phobos',
    mode: 'HEADER_ONLY',
    filesPerSecond: 100,
    fileTypes: DOCS,
    note: 'header/metadata corruption',
  },
  {
    name: 'Dharma-CrySiS',
    mode: 'HEADER_ONLY',
    filesPerSecond: 95,
    fileTypes: DOCS,
    note: 'header corruption',
  },

  { name: 'Hive', mode: 'FIRST_4KB', filesPerSecond: 150, fileTypes: MIXED, note: 'first-N-bytes partial' },
  {
    name: 'BlackMatter',
    mode: 'FIRST_4KB',
    filesPerSecond: 175,
    fileTypes: MIXED,
    note: 'first-megabyte/4KB partial',
  },
  {
    name: 'Akira',
    mode: 'FIRST_4KB',
    filesPerSecond: 165,
    fileTypes: ['docx', 'pdf'],
    note: 'partial head encryption',
  },

  {
    name: 'Medusa',
    mode: 'LOW_AND_SLOW',
    filesPerSecond: 3,
    fileTypes: DOCS,
    note: 'throttled to evade rate thresholds',
  },
  { name: 'Rhysida', mode: 'LOW_AND_SLOW', filesPerSecond: 4, fileTypes: MIXED, note: 'slow targeted' },
  { name: 'ViceSociety', mode: 'LOW_AND_SLOW', filesPerSecond: 2, fileTypes: DOCS, note: 'low-and-slow' },
];

export function familyByName(name: string): FamilyProfile | undefined {
  return FAMILY_PROFILES.find((f) => f.name === name);
}

export const FAMILY_COUNT = FAMILY_PROFILES.length;
export const MODES_COVERED = new Set(FAMILY_PROFILES.map((f) => f.mode)).size;
