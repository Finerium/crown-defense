import { type FamilyProfile, familyByName } from '@crown/simulator';
import type { ScenarioSummary } from './types';

/**
 * The demo scenario catalogue: 4 attacks and 4 legitimate workloads.
 *
 * Data only, on purpose. This module imports @crown/simulator and nothing else, so the console request
 * path (which imports it to validate scenarioId) can never reach the detection engine, the containment
 * module or the runner. See ./API.md, "the console cannot alert".
 *
 * Attack parameters are RESOLVED from the real @crown/simulator family battery via familyByName(), never
 * typed here as literals. Benign scenarios name a @crown/test-infra workload; the runner produces their
 * telemetry by calling runBenignSuite() and selecting the matching BenignRun.
 */

export type ScenarioGroup = 'serangan' | 'sah';

export interface AttackScenario {
  kind: 'serangan';
  id: string;
  labelId: string;
  labelEn: string;
  host: string;
  segment: string;
  technique: string;
  descId: string;
  family: FamilyProfile;
  /** Plant a decoy file so the canary fast-path is exercised. Only the flagship attack does. */
  plantCanary: boolean;
  /** Files the simulator seeds and then encrypts (reversibly, in its own temp dir). */
  seeds: number;
  noteId: string | null;
}

export interface BenignScenario {
  kind: 'sah';
  id: string;
  labelId: string;
  labelEn: string;
  host: string;
  segment: string;
  descId: string;
  /** A @crown/test-infra BenignWorkload name. Validated against the real suite output at run time. */
  workload: string;
  expectedNonIsolationReasonId: string;
}

export type Scenario = AttackScenario | BenignScenario;

/** Resolve a family from the real battery. A miss is a wiring bug, so it fails loudly at module load. */
function family(name: string): FamilyProfile {
  const f = familyByName(name);
  if (!f) {
    throw new Error(
      `scenario catalogue: familyByName('${name}') returned nothing. The @crown/simulator family battery no longer contains this family, so the scenario cannot be produced by the real oracle.`
    );
  }
  return f;
}

const ATTACKS: AttackScenario[] = [
  {
    kind: 'serangan',
    id: 'rad-ws-radiologi',
    labelId: 'Serangan pada workstation radiologi',
    labelEn: 'Attack on a radiology workstation',
    host: 'mrh-rad-ws-07',
    segment: 'Radiology',
    technique: 'T1486',
    descId:
      'Enkripsi massal penuh pada workstation radiologi. Berkas umpan (decoy) ikut disentuh, sehingga jalur cepat kanari aktif.',
    family: family('BrainCipher'),
    plantCanary: true,
    seeds: 36,
    noteId: null,
  },
  {
    kind: 'serangan',
    id: 'ehr-lateral',
    labelId: 'Penyebaran lateral ke EHR Core',
    labelEn: 'Lateral spread into EHR Core',
    host: 'mrh-ehr-app-01',
    segment: 'EHR Core',
    technique: 'T1486',
    descId:
      'Enkripsi penuh berkecepatan tinggi pada server aplikasi rekam medis. Tanpa umpan, jadi vonis harus lahir dari fusi minimal dua sinyal.',
    family: family('LockBit-3.0'),
    plantCanary: false,
    seeds: 36,
    noteId: null,
  },
  {
    kind: 'serangan',
    id: 'pacs-terputus',
    labelId: 'Enkripsi terputus pada arsip citra',
    labelEn: 'Intermittent encryption on the imaging archive',
    host: 'mrh-pacs-srv-01',
    segment: 'Radiology',
    technique: 'T1486',
    descId:
      'Enkripsi terputus (setiap 64 byte) untuk menekan lonjakan entropi. Validasi format yang menjadi pembeda, bukan entropi.',
    family: family('BlackCat-ALPHV'),
    plantCanary: false,
    seeds: 36,
    noteId: null,
  },
  {
    kind: 'serangan',
    id: 'backup-lumpuh',
    labelId: 'Upaya pelumpuhan backup',
    labelEn: 'Attempt to cripple backup',
    host: 'mrh-bk-srv-01',
    segment: 'Infrastructure',
    technique: 'T1486',
    descId:
      'Enkripsi lambat dan terukur pada server backup untuk menghindari ambang laju. Penghitung kumulatif yang menangkapnya.',
    family: family('Rhysida'),
    plantCanary: false,
    seeds: 36,
    noteId:
      'Catatan kejujuran: simulator aman hanya memodelkan perilaku enkripsi massal di server backup, bukan penghapusan Volume Shadow Copy itu sendiri. Simulator ini hanya mengenkripsi secara reversibel di satu direktori sementara, jadi teknik penghancuran salinan bayangan tidak dijalankan dan tidak boleh diklaim terdeteksi.',
  },
];

const BENIGN: BenignScenario[] = [
  {
    kind: 'sah',
    id: 'backup-terjadwal',
    labelId: 'Backup terjadwal',
    labelEn: 'Scheduled backup',
    host: 'mrh-bk-srv-01',
    segment: 'Infrastructure',
    descId: 'Agen backup menulis arsip baru berentropi tinggi dengan frekuensi operasi tinggi.',
    workload: 'backup-agent',
    expectedNonIsolationReasonId:
      'Arsip ditulis sebagai berkas BARU, bukan menimpa di tempat, sehingga tidak ada kenaikan entropi pada offset yang sama dan validasi format tetap lulus. Tidak ada sinyal pembeda enkripsi yang menyala.',
  },
  {
    kind: 'sah',
    id: 'konversi-citra',
    labelId: 'Konversi citra radiologi',
    labelEn: 'Radiology image conversion',
    host: 'mrh-rad-srv-02',
    segment: 'Radiology',
    descId: 'Konversi batch PNG ke WebP di tempat: tipe dan header berubah, frekuensi operasi naik.',
    workload: 'format-converter',
    expectedNonIsolationReasonId:
      'Perubahan tipe dan header hanyalah sinyal konteks. Keluarannya tetap kontainer yang dikenali dan lulus validasi struktur, jadi sinyal pembeda enkripsi tidak menyala dan isolasi tidak diusulkan.',
  },
  {
    kind: 'sah',
    id: 'kompaksi-log',
    labelId: 'Kompaksi log',
    labelEn: 'Log compaction',
    host: 'mrh-web-srv-01',
    segment: 'Infrastructure',
    descId:
      'Kompresi log di tempat: entropi naik dari rendah ke tinggi, header berubah, frekuensi tulis tinggi.',
    workload: 'log-compaction',
    expectedNonIsolationReasonId:
      'Tiga sinyal konteks memang menyala, tetapi hasil kompresi tetap gzip yang valid secara struktur. Aturan minimal dua sinyal dengan sekurangnya satu sinyal pembeda menahan verdik destruktif.',
  },
  {
    kind: 'sah',
    id: 'enkripsi-arsip',
    labelId: 'Enkripsi arsip sah',
    labelEn: 'Legitimate archive encryption',
    host: 'mrh-nas-01',
    segment: 'Infrastructure',
    descId:
      'Enkripsi disk penuh yang sah di tempat. Terlihat persis seperti ransomware pada setiap sumbu sinyal.',
    workload: 'legitimate-fde',
    expectedNonIsolationReasonId:
      'Kasus terberat: format menjadi tidak valid dan entropi melonjak, sehingga verdik memang MASS_ENCRYPTION. Yang menahan isolasi adalah daftar izin proses operator (AC-FP-02), dan penekanan itu dicatat sebagai alasan yang dapat diaudit, bukan disembunyikan.',
  },
];

export const SCENARIOS: Scenario[] = [...ATTACKS, ...BENIGN];

export const SCENARIO_IDS: string[] = SCENARIOS.map((s) => s.id);

export function scenarioById(id: string): Scenario | null {
  return SCENARIOS.find((s) => s.id === id) ?? null;
}

/** Public projection: what the console and the stream publish. No verdict, no severity, no action. */
export function summarize(s: Scenario): ScenarioSummary {
  if (s.kind === 'serangan') {
    return {
      id: s.id,
      group: 'serangan',
      labelId: s.labelId,
      labelEn: s.labelEn,
      host: s.host,
      segment: s.segment,
      technique: s.technique,
      descId: s.descId,
      family: s.family.name,
      mode: s.family.mode,
      filesPerSecond: s.family.filesPerSecond,
      blockBytes: s.family.blockBytes ?? null,
      plantCanary: s.plantCanary,
      workload: null,
      expectedNonIsolationReasonId: null,
      noteId: s.noteId,
    };
  }
  return {
    id: s.id,
    group: 'sah',
    labelId: s.labelId,
    labelEn: s.labelEn,
    host: s.host,
    segment: s.segment,
    technique: null,
    descId: s.descId,
    family: null,
    mode: null,
    filesPerSecond: null,
    blockBytes: null,
    plantCanary: null,
    workload: s.workload,
    expectedNonIsolationReasonId: s.expectedNonIsolationReasonId,
    noteId: null,
  };
}

export const CATALOGUE: ScenarioSummary[] = SCENARIOS.map(summarize);
