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
  llm_advisory: { en: 'LLM · advisory', id: 'LLM · saran' },
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
  // chrome / a11y labels / tooltips (AC-I18N: nothing user-facing hardcoded)
  a11y_screens: { en: 'Screens', id: 'Layar' },
  tip_open_incident: { en: 'Open active incident', id: 'Buka insiden aktif' },
  tip_language: { en: 'Language', id: 'Bahasa' },
  aria_toggle_language: { en: 'Toggle language', id: 'Ganti bahasa' },
  aria_toggle_theme: { en: 'Toggle theme', id: 'Ganti tema' },
  close: { en: 'Close', id: 'Tutup' },
  a11y_threat_chart: {
    en: 'Threat activity, events per minute',
    id: 'Aktivitas ancaman, peristiwa per menit',
  },
  chart_detected: { en: 'DETECTED', id: 'TERDETEKSI' },
  a11y_blast_map: {
    en: 'Blast-radius map: compromised, contained and safe hosts with lateral-movement edges',
    id: 'Peta radius dampak: host terkompromi, terkontainmen, dan aman dengan jalur pergerakan lateral',
  },
  dial_shipped_default: { en: '✓ shipped + pilot default', id: '✓ default rilis + pilot' },
  dial_gated_note: {
    en: '⚠ destructive actions gated by the action matrix',
    id: '⚠ aksi destruktif digerbang oleh matriks aksi',
  },
  sub_events_min: { en: 'events/min', id: 'peristiwa/mnt' },
  recovery_plan_intro: {
    en: 'On-contained-incident, the on-prem LLM generates a faithfulness-gated, playbook-cited recovery plan.',
    id: 'Saat insiden terkontainmen, LLM on-prem membuat rencana pemulihan bergerbang-kesetiaan dan bersitasi playbook.',
  },
  plan_cite: { en: 'cite', id: 'sitasi' },
  live_live: { en: 'LIVE', id: 'LANGSUNG' },
  live_fallback: { en: 'fallback', id: 'cadangan' },
  model_line: {
    en: 'model {model} · {live} · advisory only (never emits an action)',
    id: 'model {model} · {live} · hanya saran (tidak pernah mengeluarkan aksi)',
  },
  col_host: { en: 'Host', id: 'Host' },
  col_status: { en: 'Status', id: 'Status' },
  col_role: { en: 'Role', id: 'Peran' },
  col_ip: { en: 'IP', id: 'IP' },
  col_segment: { en: 'Segment', id: 'Segmen' },
  col_risk: { en: 'Risk', id: 'Risiko' },
  col_component: { en: 'Component', id: 'Komponen' },
  col_detail: { en: 'Detail', id: 'Rincian' },
  fleet_state: {
    en: 'FleetState: {total} hosts · {online} online (aggregate, bounded)',
    id: 'StatusArmada: {total} host · {online} daring (agregat, terbatas)',
  },
  fleet_match_page: { en: '{n} match · page {cur}/{pages}', id: '{n} cocok · halaman {cur}/{pages}' },
  btn_prev: { en: 'Prev', id: 'Sebelumnya' },
  btn_next: { en: 'Next', id: 'Berikutnya' },
  drawer_host: { en: 'Host {name}', id: 'Host {name}' },
  kv_host_id: { en: 'Host ID', id: 'ID Host' },
  kv_os: { en: 'OS', id: 'OS' },
  kv_ip: { en: 'IP', id: 'IP' },
  kv_status: { en: 'Status', id: 'Status' },
  kv_criticality: { en: 'Criticality', id: 'Kritikalitas' },
  kv_risk: { en: 'Risk', id: 'Risiko' },
  kv_last_seen: { en: 'Last seen', id: 'Terakhir terlihat' },
  effective_autonomy_note: {
    en: 'effective_autonomy: {mode} — reflects the fail-safe override (drops toward MONITOR if a dependency is impaired).',
    id: 'otonomi_efektif: {mode} — mencerminkan override fail-safe (turun ke MONITOR jika dependensi terganggu).',
  },
  kpi_enrolled: { en: 'Enrolled', id: 'Terdaftar' },
  kpi_online: { en: 'Online', id: 'Daring' },
  kpi_offline: { en: 'Offline', id: 'Luring' },
  dual_control_sub: { en: 'HUMAN_GATED — dual control', id: 'HUMAN_GATED — kontrol ganda' },
  no_pending_approvals: { en: 'No pending approvals.', id: 'Tidak ada persetujuan tertunda.' },
  time_box: { en: 'time-box →', id: 'batas-waktu →' },
  label_signals: { en: 'signals', id: 'sinyal' },
  label_confidence: { en: 'confidence', id: 'keyakinan' },
  label_mode: { en: 'mode', id: 'mode' },
  approver_two: { en: '(approver #2)', id: '(pemberi persetujuan #2)' },
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, lang: Lang): string {
  return STRINGS[key][lang];
}

/** Interpolating lookup: `tf('model_line', lang, { model, live })` fills `{model}`/`{live}` placeholders. */
export function tf(key: StringKey, lang: Lang, vars: Record<string, string | number>): string {
  return STRINGS[key][lang].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
