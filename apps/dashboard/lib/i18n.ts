/**
 * i18n — no hardcoded user-facing strings; locale-ready Indonesian + English (Indonesian-market product,
 * AC-I18N). A tiny dictionary + lookup; the active locale is a UI toggle.
 */
export type Lang = 'en' | 'id';

export const STRINGS = {
  nav_overview: { en: 'Overview', id: 'Ringkasan' },
  nav_incident: { en: 'Incident', id: 'Insiden' },
  nav_fleet: { en: 'Fleet & Hosts', id: 'Armada & Host' },
  nav_system: { en: 'System', id: 'Sistem' },
  nav_approvals: { en: 'Approvals', id: 'Persetujuan' },
  brand_sub: { en: 'AUTONOMOUS RANSOMWARE DEFENSE', id: 'PERTAHANAN RANSOMWARE OTONOM' },
  kpi_active_threats: { en: 'Active threats', id: 'Ancaman aktif' },
  kpi_hosts_protected: { en: 'Hosts protected', id: 'Host terlindungi' },
  kpi_auto_contain: { en: 'Auto-containments (24h)', id: 'Kontainmen otomatis (24j)' },
  kpi_mttr: { en: 'Mean time to respond', id: 'Rata-rata waktu respons' },
  dial: { en: 'Autonomy dial', id: 'Dial otonomi' },
  dial_monitor: { en: 'Monitor only', id: 'Hanya pantau' },
  dial_alert: { en: 'Alert & recommend', id: 'Peringatan & rekomendasi' },
  dial_human: { en: 'Human-gated', id: 'Disetujui manusia' },
  dial_auto: { en: 'Full auto', id: 'Otomatis penuh' },
  threat_activity: { en: 'Threat activity', id: 'Aktivitas ancaman' },
  action_feed: { en: 'Autonomous action feed', id: 'Umpan aksi otonom' },
  blast_radius: { en: 'Blast radius', id: 'Radius dampak' },
  incident_timeline: { en: 'Incident timeline', id: 'Lini masa insiden' },
  recovery_plan: { en: 'Recovery plan', id: 'Rencana pemulihan' },
  affected_hosts: { en: 'Affected hosts', id: 'Host terdampak' },
  system_health: { en: 'System health', id: 'Kesehatan sistem' },
  agent_coverage: { en: 'Agent coverage', id: 'Cakupan agen' },
  decision_audit: { en: 'Autonomy decision audit', id: 'Audit keputusan otonomi' },
  approval_queue: { en: 'Approval queue', id: 'Antrian persetujuan' },
  approve: { en: 'Approve', id: 'Setujui' },
  override: { en: 'Override', id: 'Tolak' },
  revert: { en: 'Revert', id: 'Kembalikan' },
  second_approver: {
    en: 'Requires a second distinct approver',
    id: 'Perlu pemberi persetujuan kedua yang berbeda',
  },
  generate_report: { en: 'Generate incident report', id: 'Buat laporan insiden' },
  generating: { en: 'Generating (on-prem LLM)…', id: 'Membuat (LLM on-prem)…' },
  faithfulness: { en: 'Faithfulness', id: 'Kesetiaan' },
  routed_human: { en: 'Routed to human — low faithfulness', id: 'Diteruskan ke manusia — kesetiaan rendah' },
  trigger_scenario: { en: 'Trigger simulated attack', id: 'Picu serangan simulasi' },
  demo_banner: {
    en: 'DEMO — simulated scenario on synthetic data. Not the production agent. The detection/containment/agent run on a host, not here.',
    id: 'DEMO — skenario simulasi pada data sintetis. Bukan agen produksi. Deteksi/kontainmen/agen berjalan di host, bukan di sini.',
  },
  files_lost: { en: 'Files lost before containment', id: 'File hilang sebelum kontainmen' },
  search_hosts: { en: 'Search hosts', id: 'Cari host' },
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, lang: Lang): string {
  return STRINGS[key][lang];
}
