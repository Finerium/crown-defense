/**
 * Demo data layer — ported from the Claude Design handoff (crown-defense-design/talos-data.js, the visual
 * truth). Fictional org: Meridian Regional Health (mrh-*) · 1,291 enrolled hosts. Scenario: VANTAR ransomware
 * (LockBit-class), detected 03:14:07 UTC, containment active. DEMO MODE: this synthetic scenario + the
 * serverless /api/analyze (live on-prem-equivalent LLM) drive the UI with NO running backend.
 *
 * Field names mirror the design data so the 4 design screens read it 1:1. The ONE deliberate substitution:
 * the design's detection-engine token "TALOS-DE" is replaced by ENGINE_ID ("CROWN-DE") because "TALOS" is an
 * internal codename that must never be user-facing (product.md / OQ-5). The product/brand name is PRODUCT_NAME.
 */
import { PRODUCT_NAME } from '@crown/contracts';

export { PRODUCT_NAME };

/**
 * Crown Defense detection-engine attribution token. The design surfaces the engine as "TALOS-DE"; "TALOS" is an
 * internal codename, so the engine surfaces user-facing as this Crown Defense token everywhere the design used
 * "TALOS-DE" (feed source, audit `by`, engine model, autonomous-phase host). Compare audit rows with `by === ENGINE_ID`.
 */
export const ENGINE_ID = 'CROWN-DE';

/* ---------------- enums (the design's lowercase status/kind vocabularies) ---------------- */
export type HostStatus = 'compromised' | 'contained' | 'isolated' | 'scanning' | 'protected';
export type SevLevel = 'critical' | 'high' | 'medium' | 'low' | 'talos';
export type SegmentState = 'ok' | 'watch' | 'contained';
export type FeedKind = 'detect' | 'contain' | 'scan' | 'intel' | 'policy';
export type PlanStatus = 'done' | 'active' | 'approval' | 'queued' | 'held';
export type EdgeKind = 'lateral' | 'blocked' | 'watch';
export type IntegrationStatus = 'online' | 'degraded' | 'offline';
export type PolicyMode = 'FULL AUTO' | 'APPROVAL REQUIRED';

/* ---------------- types ---------------- */
export interface DemoHost {
  name: string;
  ip: string;
  seg: string;
  os: string;
  status: HostStatus;
  risk: number;
  ver: string;
  seen: string;
}

export interface IncidentInfo {
  id: string;
  family: string;
  classify: string;
  sev: SevLevel;
  status: string;
  containment: number;
  confidence: number;
  detectedAt: string;
  detectLatency: string;
  patientZero: string;
  vector: string;
  cve: string;
  filesEncrypted: number;
  hostsAffected: number;
  hostsIsolated: number;
  started: string;
  extension: string;
}

export interface TimelineEvent {
  t: string;
  sev: SevLevel;
  title: string;
  host: string;
  detail: string;
  conf: number | null;
}

export interface AttackPhase {
  name: string;
  tactic: string;
  talos: boolean;
  events: TimelineEvent[];
}

export interface PlanStep {
  n: number;
  status: PlanStatus;
  t: string | null;
  eta?: string;
  title: string;
  detail: string;
}

export interface AffectedHost {
  name: string;
  ip: string;
  seg: string;
  status: HostStatus;
  first: string;
  last: string;
  risk: number;
  files: number;
}

export interface BlastNode {
  name: string;
  status: HostStatus;
  ring: number;
  ang: number;
}
export interface BlastEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}
export interface BlastGraph {
  center: { name: string; status: HostStatus; tag: string };
  nodes: BlastNode[];
  edges: BlastEdge[];
}

export interface FeedItem {
  t?: string; // assigned on inject for queued items; present on the initial feed
  kind: FeedKind;
  text: string;
  host: string | null;
  meta: string; // attribution line, e.g. "CROWN-DE · AUTO"
}

export interface Segment {
  name: string;
  hosts: number;
  state: SegmentState;
}

export interface EngineInfo {
  model: string;
  updated: string;
  uptime: string;
  p50: string;
  p95: string;
  eps: string;
  falsePos: string;
}

export interface AgentVersion {
  ver: string;
  pct: number;
}
export interface AgentCoverage {
  enrolled: number;
  online: number;
  offline: number;
  coveragePct: number;
  poweredDown: number;
  pendingEnroll: number;
  unenrolledDetected: number;
  versions: AgentVersion[];
}

export interface Integration {
  name: string;
  kind: string;
  status: IntegrationStatus;
  meta: string;
}

export interface PolicyRule {
  action: string;
  mode: PolicyMode;
  note: string;
}

export interface AuditEntry {
  t: string;
  action: string;
  target: string;
  by: string; // ENGINE_ID for autonomous, "OPR-03" for operator
  conf: string;
  latency: string;
}

export interface Kpis {
  activeThreats: number;
  hostsProtected: number;
  enrolled: number;
  containmentsToday: number;
  lastContainmentAt: string;
  escalations: number;
  mttr: string;
  mttrUnit: string;
  mttrDeltaPct: number;
}

export interface ChartLabel {
  i: number;
  t: string;
}

export interface DemoScenario {
  product: string;
  org: string;
  policyVersion: string;
  kpis: Kpis;
  incident: IncidentInfo;
  segments: Segment[];
  feed: FeedItem[];
  feedQueue: FeedItem[];
  activity: number[];
  activityStart: string;
  detectIndex: number;
  activityLabels: ChartLabel[];
  phases: AttackPhase[];
  plan: PlanStep[];
  affected: AffectedHost[];
  blast: BlastGraph;
  fleet: DemoHost[];
  agents: AgentCoverage;
  engine: EngineInfo;
  integrations: Integration[];
  policy: PolicyRule[];
  audit: AuditEntry[];
}

/* ---------------- fleet (the design's FLEET_ROWS, tuple→object like the source) ---------------- */
// [name, ip, segment, os, status, risk, agentVer, lastSeen]
type FleetRow = [string, string, string, string, HostStatus, number, string, string];
const FLEET_ROWS: FleetRow[] = [
  [
    'mrh-rad-ws-07',
    '10.20.31.107',
    'Radiology',
    'Windows 11 23H2',
    'compromised',
    98,
    '3.8.2',
    'ISOLATED 03:14:09',
  ],
  [
    'mrh-ehr-app-02',
    '10.20.12.22',
    'EHR Core',
    'Windows Server 2022',
    'contained',
    74,
    '3.8.2',
    'ISOLATED 03:14:11',
  ],
  [
    'mrh-file-srv-03',
    '10.20.14.13',
    'Infrastructure',
    'Windows Server 2022',
    'contained',
    71,
    '3.8.2',
    'ISOLATED 03:14:11',
  ],
  [
    'mrh-dc-01',
    '10.20.10.5',
    'Infrastructure',
    'Windows Server 2022',
    'isolated',
    38,
    '3.8.2',
    'ISOLATED 03:14:13',
  ],
  ['mrh-nas-02', '10.20.14.32', 'Infrastructure', 'Ubuntu 22.04 LTS', 'scanning', 22, '3.8.2', '2s'],
  ['mrh-rad-ws-03', '10.20.31.103', 'Radiology', 'Windows 11 23H2', 'scanning', 19, '3.8.2', '4s'],
  ['mrh-rad-ws-11', '10.20.31.111', 'Radiology', 'Windows 11 23H2', 'scanning', 17, '3.8.2', '3s'],
  ['mrh-ehr-db-01', '10.20.12.10', 'EHR Core', 'RHEL 9.3', 'protected', 8, '3.8.2', '1s'],
  ['mrh-bk-srv-01', '10.20.15.8', 'Infrastructure', 'Ubuntu 22.04 LTS', 'protected', 5, '3.8.2', '2s'],
  ['mrh-ehr-app-01', '10.20.12.21', 'EHR Core', 'Windows Server 2022', 'protected', 9, '3.8.2', '1s'],
  ['mrh-ehr-app-03', '10.20.12.23', 'EHR Core', 'Windows Server 2022', 'protected', 7, '3.8.2', '3s'],
  ['mrh-dc-02', '10.20.10.6', 'Infrastructure', 'Windows Server 2022', 'protected', 11, '3.8.2', '1s'],
  ['mrh-pacs-srv-01', '10.20.31.10', 'Radiology', 'Windows Server 2022', 'protected', 12, '3.8.2', '2s'],
  ['mrh-pharm-ws-12', '10.20.33.112', 'Pharmacy', 'Windows 11 23H2', 'protected', 6, '3.8.2', '4s'],
  ['mrh-pharm-ws-04', '10.20.33.104', 'Pharmacy', 'Windows 11 23H2', 'protected', 4, '3.8.2', '2s'],
  ['mrh-pharm-srv-01', '10.20.33.10', 'Pharmacy', 'Windows Server 2022', 'protected', 5, '3.8.2', '1s'],
  ['mrh-lab-ws-04', '10.20.34.104', 'Laboratory', 'Windows 10 22H2', 'protected', 9, '3.8.1', '3s'],
  ['mrh-lab-ws-09', '10.20.34.109', 'Laboratory', 'Windows 10 22H2', 'protected', 8, '3.8.1', '5s'],
  ['mrh-lis-srv-01', '10.20.34.10', 'Laboratory', 'Windows Server 2019', 'protected', 13, '3.8.2', '2s'],
  ['mrh-fin-ws-22', '10.20.40.122', 'Finance', 'Windows 11 23H2', 'protected', 5, '3.8.2', '1s'],
  ['mrh-fin-ws-09', '10.20.40.109', 'Finance', 'Windows 11 23H2', 'protected', 4, '3.8.2', '2s'],
  ['mrh-fin-srv-01', '10.20.40.10', 'Finance', 'Windows Server 2022', 'protected', 6, '3.8.2', '1s'],
  ['mrh-rad-ws-01', '10.20.31.101', 'Radiology', 'Windows 11 23H2', 'protected', 10, '3.8.2', '2s'],
  ['mrh-rad-ws-05', '10.20.31.105', 'Radiology', 'Windows 11 23H2', 'protected', 9, '3.8.2', '3s'],
  ['mrh-rad-ws-09', '10.20.31.109', 'Radiology', 'Windows 11 23H2', 'protected', 11, '3.8.2', '1s'],
  ['mrh-ed-ws-02', '10.20.36.102', 'Emergency', 'Windows 11 23H2', 'protected', 7, '3.8.2', '2s'],
  ['mrh-ed-ws-07', '10.20.36.107', 'Emergency', 'Windows 11 23H2', 'protected', 6, '3.8.2', '1s'],
  ['mrh-ed-srv-01', '10.20.36.10', 'Emergency', 'Windows Server 2022', 'protected', 8, '3.8.2', '2s'],
  ['mrh-icu-ws-03', '10.20.37.103', 'Emergency', 'Windows 11 23H2', 'protected', 7, '3.8.2', '3s'],
  ['mrh-hr-ws-14', '10.20.41.114', 'Corporate', 'Windows 11 23H2', 'protected', 3, '3.8.2', '4s'],
  ['mrh-hr-srv-01', '10.20.41.10', 'Corporate', 'Windows Server 2022', 'protected', 5, '3.8.2', '2s'],
  ['mrh-corp-ws-31', '10.20.42.131', 'Corporate', 'Windows 11 23H2', 'protected', 4, '3.8.1', '3s'],
  ['mrh-corp-ws-18', '10.20.42.118', 'Corporate', 'Windows 11 23H2', 'protected', 3, '3.8.2', '2s'],
  [
    'mrh-print-srv-01',
    '10.20.14.40',
    'Infrastructure',
    'Windows Server 2019',
    'protected',
    14,
    '3.8.1',
    '5s',
  ],
  ['mrh-vpn-gw-01', '10.20.1.4', 'Infrastructure', 'RHEL 9.3', 'protected', 15, '3.8.2', '1s'],
  ['mrh-mail-gw-01', '10.20.1.8', 'Infrastructure', 'Ubuntu 22.04 LTS', 'protected', 12, '3.8.2', '2s'],
  ['mrh-nas-01', '10.20.14.31', 'Infrastructure', 'Ubuntu 22.04 LTS', 'protected', 9, '3.8.2', '1s'],
  ['mrh-sql-srv-02', '10.20.14.21', 'Infrastructure', 'Windows Server 2022', 'protected', 13, '3.8.2', '2s'],
  ['mrh-web-srv-01', '10.20.13.11', 'Infrastructure', 'Ubuntu 22.04 LTS', 'protected', 10, '3.8.2', '3s'],
  ['mrh-lab-ws-12', '10.20.34.112', 'Laboratory', 'Windows 10 22H2', 'protected', 7, '3.8.1', '4s'],
  ['mrh-pharm-ws-08', '10.20.33.108', 'Pharmacy', 'Windows 11 23H2', 'protected', 5, '3.8.2', '2s'],
  ['mrh-rad-srv-02', '10.20.31.11', 'Radiology', 'Windows Server 2022', 'protected', 12, '3.8.2', '1s'],
];
const FLEET: DemoHost[] = FLEET_ROWS.map((r) => ({
  name: r[0],
  ip: r[1],
  seg: r[2],
  os: r[3],
  status: r[4],
  risk: r[5],
  ver: r[6],
  seen: r[7],
}));

/* ---------------- live feed (attribution carried as data `meta`) ---------------- */
const FEED_META = `${ENGINE_ID} · AUTO`;
const FEED_RAW: Omit<FeedItem, 'meta'>[] = [
  {
    t: '03:15:30',
    kind: 'scan',
    text: 'IOC sweep 3/12 complete — no VANTAR artifacts on',
    host: 'mrh-ehr-db-01',
  },
  { t: '03:15:02', kind: 'scan', text: 'Memory + disk IOC scan started on 12 adjacent hosts', host: null },
  {
    t: '03:14:48',
    kind: 'intel',
    text: 'C2 indicator 45.146.27.118 pushed to egress blocklist fleet-wide',
    host: null,
  },
  {
    t: '03:14:22',
    kind: 'contain',
    text: 'Backup chain verified immutable — 02:00 snapshot eligible for restore',
    host: 'mrh-bk-srv-01',
  },
  {
    t: '03:14:14',
    kind: 'contain',
    text: 'Credentials revoked: svc-backup disabled, Kerberos tickets invalidated',
    host: 'mrh-dc-01',
  },
  {
    t: '03:14:11',
    kind: 'contain',
    text: 'Lateral hosts isolated, forensic memory snapshots captured',
    host: 'mrh-ehr-app-02',
  },
  {
    t: '03:14:09',
    kind: 'contain',
    text: 'Patient zero isolated · 4 malicious processes terminated',
    host: 'mrh-rad-ws-07',
  },
  {
    t: '03:14:07',
    kind: 'detect',
    text: 'VANTAR ransomware confirmed · confidence 0.97 · latency 1.8s',
    host: 'mrh-rad-ws-07',
  },
  { t: '03:02:11', kind: 'policy', text: 'Egress policy refresh applied to 1,284 agents', host: null },
  {
    t: '02:47:55',
    kind: 'scan',
    text: 'Scheduled integrity sweep completed — Finance segment clean',
    host: null,
  },
];
const FEED_QUEUE_RAW: Omit<FeedItem, 'meta'>[] = [
  { kind: 'scan', text: 'IOC sweep 5/12 complete — no VANTAR artifacts on', host: 'mrh-rad-ws-11' },
  { kind: 'scan', text: 'IOC sweep 7/12 complete — no VANTAR artifacts on', host: 'mrh-nas-02' },
  { kind: 'intel', text: 'VANTAR file-marker signature distributed to all agents', host: null },
  { kind: 'scan', text: 'IOC sweep 9/12 complete — no VANTAR artifacts on', host: 'mrh-pacs-srv-01' },
  {
    kind: 'contain',
    text: 'Quarantine integrity re-verified on isolated hosts — no egress observed',
    host: 'mrh-rad-ws-07',
  },
  { kind: 'scan', text: 'IOC sweep 11/12 complete — no VANTAR artifacts on', host: 'mrh-dc-02' },
  { kind: 'intel', text: 'Phishing sender domain added to mail gateway blocklist', host: 'mrh-mail-gw-01' },
  { kind: 'scan', text: 'IOC sweep 12/12 complete — adjacent hosts clean', host: null },
];
const withMeta = (rows: Omit<FeedItem, 'meta'>[]): FeedItem[] => rows.map((f) => ({ ...f, meta: FEED_META }));

/* ---------------- the scenario (read-only singleton; screens snapshot via useState/filter, never mutate it) ---------------- */
// ponytail: one shared frozen object — demoScenario() returns it; no per-render rebuild, no deep clone needed.
const SCENARIO: DemoScenario = {
  product: PRODUCT_NAME,
  org: 'Meridian Regional Health',
  policyVersion: 'v1182',

  kpis: {
    activeThreats: 1,
    hostsProtected: 1284,
    enrolled: 1291,
    containmentsToday: 3,
    lastContainmentAt: '03:14:09',
    escalations: 0,
    mttr: '2.4',
    mttrUnit: 's',
    mttrDeltaPct: 38,
  },

  incident: {
    id: 'INC-2026-0612-004',
    family: 'VANTAR',
    classify: 'Ransomware · LockBit-class TTPs',
    sev: 'critical',
    status: 'CONTAINMENT ACTIVE',
    containment: 92,
    confidence: 0.97,
    detectedAt: '03:14:07.2 UTC',
    detectLatency: '1.8s',
    patientZero: 'mrh-rad-ws-07',
    vector: 'Phishing — XLSM macro (Invoice_Q2_2026.xlsm)',
    cve: 'CVE-2026-21412',
    filesEncrypted: 1847,
    hostsAffected: 6,
    hostsIsolated: 4,
    started: '03:11:42 UTC',
    extension: '.vntr',
  },

  segments: [
    { name: 'Radiology', hosts: 38, state: 'contained' },
    { name: 'EHR Core', hosts: 24, state: 'contained' },
    { name: 'Infrastructure', hosts: 61, state: 'watch' },
    { name: 'Emergency', hosts: 47, state: 'ok' },
    { name: 'Pharmacy', hosts: 33, state: 'ok' },
    { name: 'Laboratory', hosts: 41, state: 'ok' },
    { name: 'Corporate', hosts: 412, state: 'ok' },
  ],

  feed: withMeta(FEED_RAW),
  feedQueue: withMeta(FEED_QUEUE_RAW),

  // events/min, last 60 min — one point per minute, 02:20 → 03:19; detect marker at 03:14
  activity: [
    4, 6, 3, 5, 7, 4, 6, 5, 3, 6, 8, 5, 4, 7, 6, 5, 9, 6, 4, 7, 12, 8, 6, 5, 7, 4, 6, 8, 5, 6, 4, 7, 5, 6, 8,
    6, 5, 7, 4, 6, 5, 8, 6, 4, 7, 5, 6, 4, 8, 6, 5, 7, 9, 14, 21, 96, 71, 34, 18, 12,
  ],
  activityStart: '02:20',
  detectIndex: 54,
  activityLabels: [
    { i: 0, t: '02:20' },
    { i: 20, t: '02:40' },
    { i: 40, t: '03:00' },
    { i: 59, t: '03:19' },
  ],

  phases: [
    {
      name: 'Initial Access',
      tactic: 'TA0001',
      talos: false,
      events: [
        {
          t: '03:11:42.1',
          sev: 'high',
          title: 'Malicious macro executed from phishing attachment',
          host: 'mrh-rad-ws-07',
          detail: 'Invoice_Q2_2026.xlsm → wscript.exe spawn',
          conf: 0.87,
        },
      ],
    },
    {
      name: 'Execution',
      tactic: 'TA0002',
      talos: false,
      events: [
        {
          t: '03:12:05.6',
          sev: 'high',
          title: 'Encoded PowerShell stager retrieved second-stage payload',
          host: 'mrh-rad-ws-07',
          detail: 'powershell.exe -enc · C2 45.146.27.118:443',
          conf: 0.91,
        },
        {
          t: '03:12:18.0',
          sev: 'medium',
          title: 'Persistence via scheduled task “WinSysHealthCheck”',
          host: 'mrh-rad-ws-07',
          detail: 'schtasks /create /ru SYSTEM',
          conf: 0.84,
        },
      ],
    },
    {
      name: 'Credential Access',
      tactic: 'TA0006',
      talos: false,
      events: [
        {
          t: '03:12:44.3',
          sev: 'critical',
          title: 'LSASS memory read — credential dumping',
          host: 'mrh-rad-ws-07',
          detail: 'Harvested: svc-backup, radjsmith (domain)',
          conf: 0.94,
        },
      ],
    },
    {
      name: 'Lateral Movement',
      tactic: 'TA0008',
      talos: false,
      events: [
        {
          t: '03:13:21.4',
          sev: 'critical',
          title: 'SMB ADMIN$ transfer → mrh-ehr-app-02',
          host: 'mrh-rad-ws-07',
          detail: 'PsExec-style service install as svc-backup',
          conf: 0.96,
        },
        {
          t: '03:13:36.8',
          sev: 'critical',
          title: 'WMI remote execution → mrh-file-srv-03',
          host: 'mrh-ehr-app-02',
          detail: 'wmiprvse.exe child: cmd.exe /c vntr.exe',
          conf: 0.95,
        },
        {
          t: '03:13:52.2',
          sev: 'high',
          title: 'RDP authentication attempt → mrh-dc-01 — BLOCKED',
          host: 'mrh-file-srv-03',
          detail: 'svc-backup denied · conditional access policy',
          conf: 0.92,
        },
      ],
    },
    {
      name: 'Impact — Encryption',
      tactic: 'TA0040',
      talos: false,
      events: [
        {
          t: '03:14:05.0',
          sev: 'critical',
          title: 'Mass file rename + entropy spike — .vntr extension',
          host: 'mrh-rad-ws-07',
          detail: '1,847 files in 2.2s · D:\\studies\\',
          conf: 0.99,
        },
        {
          t: '03:14:06.1',
          sev: 'critical',
          title: 'Volume shadow copy deletion attempted',
          host: 'mrh-rad-ws-07',
          detail: 'vssadmin delete shadows /all — intercepted',
          conf: 0.98,
        },
      ],
    },
    {
      name: `${PRODUCT_NAME} Containment`,
      tactic: 'AUTONOMOUS',
      talos: true,
      events: [
        {
          t: '03:14:07.2',
          sev: 'talos',
          title: 'Ransomware behavior confirmed — VANTAR · conf 0.97',
          host: ENGINE_ID,
          detail: 'Detection latency 1.8s from first encryption event',
          conf: 0.97,
        },
        {
          t: '03:14:09.0',
          sev: 'talos',
          title: 'Patient zero isolated · process tree terminated',
          host: 'mrh-rad-ws-07',
          detail: 'NIC quarantine + 4 processes killed',
          conf: null,
        },
        {
          t: '03:14:11.3',
          sev: 'talos',
          title: 'Lateral hosts isolated · forensic state preserved',
          host: 'mrh-ehr-app-02 +1',
          detail: 'mrh-file-srv-03 · memory snapshots captured',
          conf: null,
        },
        {
          t: '03:14:14.6',
          sev: 'talos',
          title: 'Credentials revoked · Kerberos tickets invalidated',
          host: 'mrh-dc-01',
          detail: 'svc-backup disabled · radjsmith forced reset',
          conf: null,
        },
      ],
    },
  ],

  plan: [
    {
      n: 1,
      status: 'done',
      t: '03:14:09',
      title: 'Isolate mrh-rad-ws-07 (patient zero)',
      detail: 'Network quarantine via agent · process tree terminated',
    },
    {
      n: 2,
      status: 'done',
      t: '03:14:11',
      title: 'Isolate mrh-ehr-app-02, mrh-file-srv-03',
      detail: 'Lateral-movement targets · memory snapshots preserved',
    },
    {
      n: 3,
      status: 'done',
      t: '03:14:14',
      title: 'Revoke compromised credentials',
      detail: 'svc-backup disabled · Kerberos tickets invalidated domain-wide',
    },
    {
      n: 4,
      status: 'done',
      t: '03:14:22',
      title: 'Verify backup integrity — VaultSync',
      detail: '02:00 snapshot chain intact · immutable copy confirmed',
    },
    {
      n: 5,
      status: 'active',
      t: null,
      eta: 'ETA 1m 40s',
      title: 'IOC sweep across 12 adjacent hosts',
      detail: 'Radiology + Infrastructure segments · 3 of 12 complete',
    },
    {
      n: 6,
      status: 'approval',
      t: null,
      title: 'Restore mrh-ehr-app-02 from 02:00 snapshot',
      detail: 'VaultSync restore · estimated 14 min · no data loss expected',
    },
    {
      n: 7,
      status: 'approval',
      t: null,
      title: 'Re-image mrh-rad-ws-07',
      detail: 'Golden image RAD-WS-2026.05 · encrypted studies recoverable from PACS',
    },
    {
      n: 8,
      status: 'approval',
      t: null,
      title: 'Force password reset — Radiology OU (38 accounts)',
      detail: 'Credential exposure window 03:12–03:14 · notify on next login',
    },
  ],

  affected: [
    {
      name: 'mrh-rad-ws-07',
      ip: '10.20.31.107',
      seg: 'Radiology',
      status: 'compromised',
      first: '03:11:42',
      last: '03:14:09',
      risk: 98,
      files: 1847,
    },
    {
      name: 'mrh-ehr-app-02',
      ip: '10.20.12.22',
      seg: 'EHR Core',
      status: 'contained',
      first: '03:13:21',
      last: '03:14:11',
      risk: 74,
      files: 0,
    },
    {
      name: 'mrh-file-srv-03',
      ip: '10.20.14.13',
      seg: 'Infrastructure',
      status: 'contained',
      first: '03:13:36',
      last: '03:14:11',
      risk: 71,
      files: 0,
    },
    {
      name: 'mrh-dc-01',
      ip: '10.20.10.5',
      seg: 'Infrastructure',
      status: 'isolated',
      first: '03:13:52',
      last: '03:14:13',
      risk: 38,
      files: 0,
    },
    {
      name: 'mrh-nas-02',
      ip: '10.20.14.32',
      seg: 'Infrastructure',
      status: 'scanning',
      first: '—',
      last: '03:15:02',
      risk: 22,
      files: 0,
    },
    {
      name: 'mrh-rad-ws-03',
      ip: '10.20.31.103',
      seg: 'Radiology',
      status: 'scanning',
      first: '—',
      last: '03:15:02',
      risk: 19,
      files: 0,
    },
    {
      name: 'mrh-ehr-db-01',
      ip: '10.20.12.10',
      seg: 'EHR Core',
      status: 'protected',
      first: '—',
      last: '03:15:30',
      risk: 8,
      files: 0,
    },
    {
      name: 'mrh-bk-srv-01',
      ip: '10.20.15.8',
      seg: 'Infrastructure',
      status: 'protected',
      first: '—',
      last: '03:14:22',
      risk: 5,
      files: 0,
    },
  ],

  blast: {
    center: { name: 'mrh-rad-ws-07', status: 'compromised', tag: 'PATIENT ZERO' },
    nodes: [
      { name: 'mrh-ehr-app-02', status: 'contained', ring: 1, ang: 210 },
      { name: 'mrh-file-srv-03', status: 'contained', ring: 1, ang: 332 },
      { name: 'mrh-dc-01', status: 'isolated', ring: 1, ang: 88 },
      { name: 'mrh-ehr-db-01', status: 'protected', ring: 2, ang: 186 },
      { name: 'mrh-bk-srv-01', status: 'protected', ring: 2, ang: 246 },
      { name: 'mrh-nas-02', status: 'scanning', ring: 2, ang: 302 },
      { name: 'mrh-pacs-srv-01', status: 'protected', ring: 2, ang: 24 },
      { name: 'mrh-rad-ws-03', status: 'scanning', ring: 2, ang: 124 },
      { name: 'mrh-dc-02', status: 'protected', ring: 2, ang: 64 },
    ],
    edges: [
      { from: 'mrh-rad-ws-07', to: 'mrh-ehr-app-02', kind: 'lateral' },
      { from: 'mrh-rad-ws-07', to: 'mrh-file-srv-03', kind: 'lateral' },
      { from: 'mrh-file-srv-03', to: 'mrh-dc-01', kind: 'blocked' },
      { from: 'mrh-ehr-app-02', to: 'mrh-ehr-db-01', kind: 'blocked' },
      { from: 'mrh-ehr-app-02', to: 'mrh-bk-srv-01', kind: 'watch' },
      { from: 'mrh-file-srv-03', to: 'mrh-nas-02', kind: 'watch' },
      { from: 'mrh-rad-ws-07', to: 'mrh-pacs-srv-01', kind: 'watch' },
      { from: 'mrh-rad-ws-07', to: 'mrh-rad-ws-03', kind: 'watch' },
      { from: 'mrh-dc-01', to: 'mrh-dc-02', kind: 'watch' },
    ],
  },

  fleet: FLEET,

  agents: {
    enrolled: 1291,
    online: 1284,
    offline: 7,
    coveragePct: 99.5,
    poweredDown: 6,
    pendingEnroll: 1,
    unenrolledDetected: 0,
    versions: [
      { ver: 'v3.8.2', pct: 92 },
      { ver: 'v3.8.1', pct: 7 },
      { ver: 'OLDER', pct: 1 },
    ],
  },

  engine: {
    model: `${ENGINE_ID} v4.2.1`,
    updated: '2026-06-08',
    uptime: '99.98%',
    p50: '1.1s',
    p95: '2.6s',
    eps: '18.4k',
    falsePos: '0.3%',
  },

  integrations: [
    { name: 'EDR Sensor Mesh', kind: 'Telemetry', status: 'online', meta: '1,284 agents · 18.4k ev/s' },
    { name: 'Active Directory', kind: 'Identity', status: 'online', meta: 'mrh.local · 2 DCs' },
    { name: 'VaultSync Backup', kind: 'Recovery', status: 'online', meta: 'Last immutable snapshot 02:00' },
    { name: 'SIEM Forwarder', kind: 'Export', status: 'online', meta: 'CEF · 4.2k ev/s forwarded' },
    { name: 'Email Gateway', kind: 'Prevention', status: 'degraded', meta: 'Sync latency 4m — retrying' },
    { name: 'Firewall Mgmt', kind: 'Enforcement', status: 'online', meta: 'Egress blocklist v1182' },
  ],

  policy: [
    { action: 'Host isolation & process kill', mode: 'FULL AUTO', note: 'No approval gate · reversible' },
    { action: 'Credential revocation', mode: 'FULL AUTO', note: 'Domain-wide · reversible' },
    { action: 'Restore & re-image', mode: 'APPROVAL REQUIRED', note: 'Operator or IC sign-off' },
    { action: 'Fleet-wide policy push', mode: 'FULL AUTO', note: 'Staged rollout · canary 5%' },
  ],

  audit: [
    {
      t: '03:14:14.6',
      action: 'Revoke credentials (svc-backup)',
      target: 'mrh-dc-01',
      by: ENGINE_ID,
      conf: '0.97',
      latency: '210ms',
    },
    {
      t: '03:14:11.3',
      action: 'Isolate host',
      target: 'mrh-file-srv-03',
      by: ENGINE_ID,
      conf: '0.97',
      latency: '164ms',
    },
    {
      t: '03:14:11.1',
      action: 'Isolate host',
      target: 'mrh-ehr-app-02',
      by: ENGINE_ID,
      conf: '0.97',
      latency: '158ms',
    },
    {
      t: '03:14:09.0',
      action: 'Isolate host + kill process tree',
      target: 'mrh-rad-ws-07',
      by: ENGINE_ID,
      conf: '0.97',
      latency: '142ms',
    },
    {
      t: '01:38:02.4',
      action: 'Quarantine file (macro dropper)',
      target: 'mrh-corp-ws-31',
      by: ENGINE_ID,
      conf: '0.89',
      latency: '118ms',
    },
    {
      t: '23:51:47.0',
      action: 'Block C2 beacon (egress)',
      target: 'mrh-lab-ws-09',
      by: ENGINE_ID,
      conf: '0.91',
      latency: '96ms',
    },
    {
      t: '22:14:05.8',
      action: 'Approve restore from snapshot',
      target: 'mrh-fin-ws-09',
      by: 'OPR-03',
      conf: '—',
      latency: '—',
    },
  ],
};

/** Returns the demo scenario (read-only singleton). */
export function demoScenario(): DemoScenario {
  return SCENARIO;
}
