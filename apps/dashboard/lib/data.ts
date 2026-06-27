/**
 * Demo data layer. Fixtures conform to the FROZEN contracts (C4 ActionRecord feed, C5 dial, C7 blast-radius,
 * C9 health, C10 Host/Incident/FleetState). DEMO MODE: this synthetic scenario + the serverless /api/analyze
 * (live on-prem-equivalent LLM) drive the UI with NO running backend. Lists are bounded/paginated client-side
 * (AC-PERF-03 / AC-DATA-01): FleetState is the aggregate; the host table paginates.
 */
import { PRODUCT_NAME } from '@crown/contracts';

export { PRODUCT_NAME };

export type HostStatus = 'COMPROMISED' | 'CONTAINED' | 'SCANNING' | 'SAFE' | 'PROTECTED';

export interface DemoHost {
  host_id: string;
  hostname: string;
  os: string;
  ip: string;
  segment: string;
  status: HostStatus;
  role: string;
  criticality: 'CRITICAL' | 'HIGH' | 'NORMAL';
  risk: number; // 0..100 operational UI score (not a contract field — operational store column, see notes)
  last_seen: string;
}

export interface DemoScenario {
  product: string;
  fleet: {
    total_hosts: number;
    protected: number;
    compromised: number;
    contained: number;
    scanning: number;
    online_agents: number;
    offline_agents: number;
  };
  hosts: DemoHost[];
  incident: {
    incident_id: string;
    opened_at: string;
    status: 'OPEN' | 'CONTAINED' | 'RESOLVED';
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
    family: string;
    confidence: number;
    files_lost: number;
    affected_host_ids: string[];
    timeline: { at: string; phase: string; description: string }[];
    blast: {
      nodes: { host_id: string; status: 'COMPROMISED' | 'CONTAINED' | 'SCANNING' | 'SAFE'; role: string }[];
      edges: {
        from_host: string;
        to_host: string;
        reachable_service: string;
        status: 'ACTIVE' | 'BLOCKED';
      }[];
    };
    signals: { signal_type: string; fired: boolean; detail: string }[];
  };
  actionFeed: {
    at: string;
    action_type: string;
    host_id: string | null;
    autonomy_mode: string;
    outcome: string;
    detail: string;
  }[];
  health: {
    overall: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
    effective_autonomy: string;
    components: { name: string; status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY'; detail: string }[];
    agent_coverage: { enrolled: number; online: number; offline: number };
  };
  approvals: {
    action_id: string;
    action_type: string;
    host_id: string;
    autonomy_mode: string;
    justification: string;
    requested_at: string;
    rollback_deadline: string;
    signals: number;
    confidence: number;
  }[];
  threat: { series: number[]; detectIndex: number; labels: { i: number; t: string }[] };
}

const ROLES = [
  'workstation',
  'file-server',
  'domain-controller',
  'db-server',
  'app-server',
  'backup-server',
  'teller-ws',
  'atm-switch',
];
const SEGMENTS = ['core-banking', 'branch-jakarta', 'branch-bandung', 'dmz', 'back-office'];

function host(i: number): DemoHost {
  const status: HostStatus =
    i === 0 ? 'COMPROMISED' : i <= 2 ? 'CONTAINED' : i <= 5 ? 'SCANNING' : 'PROTECTED';
  const risk =
    status === 'COMPROMISED'
      ? 96
      : status === 'CONTAINED'
        ? 72
        : status === 'SCANNING'
          ? 41
          : 6 + ((i * 7) % 16);
  const crit = i < 4 ? 'CRITICAL' : i < 10 ? 'HIGH' : 'NORMAL';
  return {
    host_id: `h-${String(i).padStart(4, '0')}`,
    hostname: `BJB-${(ROLES[i % ROLES.length] as string).toUpperCase().slice(0, 4)}-${String(i).padStart(3, '0')}`,
    os: i % 3 === 0 ? 'Windows Server 2022' : i % 3 === 1 ? 'Windows 11' : 'Ubuntu 22.04',
    ip: `10.20.${Math.floor(i / 254)}.${(i % 254) + 1}`,
    segment: SEGMENTS[i % SEGMENTS.length] as string,
    status,
    role: ROLES[i % ROLES.length] as string,
    criticality: crit as DemoHost['criticality'],
    risk,
    last_seen: `2026-06-12T03:${String(19 - (i % 19)).padStart(2, '0')}:00.000Z`,
  };
}

export function demoScenario(): DemoScenario {
  const N = 30;
  const hosts = Array.from({ length: N }, (_, i) => host(i));
  const compromised = hosts.filter((h) => h.status === 'COMPROMISED').length;
  const contained = hosts.filter((h) => h.status === 'CONTAINED').length;
  const scanning = hosts.filter((h) => h.status === 'SCANNING').length;
  const protectedN = hosts.filter((h) => h.status === 'PROTECTED').length;

  return {
    product: PRODUCT_NAME,
    fleet: {
      total_hosts: 1284,
      protected: 1284 - compromised - contained - scanning,
      compromised,
      contained,
      scanning,
      online_agents: 1281,
      offline_agents: 3,
    },
    hosts,
    incident: {
      incident_id: 'INC-2026-0612-004',
      opened_at: '2026-06-12T03:14:07.200Z',
      status: 'CONTAINED',
      severity: 'CRITICAL',
      family: 'BrainCipher (LockBit 3.0 variant)',
      confidence: 0.92,
      files_lost: 7,
      affected_host_ids: ['h-0000', 'h-0001', 'h-0002', 'h-0003', 'h-0004', 'h-0005'],
      timeline: [
        {
          at: '2026-06-12T03:13:55.000Z',
          phase: 'Initial access',
          description: 'Anomalous process spawned from a phishing payload on BJB-WORK-000.',
        },
        {
          at: '2026-06-12T03:14:07.200Z',
          phase: 'Detection',
          description:
            'Canary file tampered (fast-path) + format-validation failures on 6 files — MASS_ENCRYPTION verdict, confidence 0.92.',
        },
        {
          at: '2026-06-12T03:14:09.400Z',
          phase: 'Containment',
          description:
            'Host BJB-WORK-000 network-isolated (FULL_AUTO). Audit record bound before the command.',
        },
        {
          at: '2026-06-12T03:14:12.800Z',
          phase: 'Lateral block',
          description: 'SMB lateral path to BJB-FILE-001 blocked; account svc-backup disabled.',
        },
        {
          at: '2026-06-12T03:15:40.000Z',
          phase: 'Analysis',
          description:
            'On-prem LLM generated the incident report + prioritized recovery plan (faithfulness-gated).',
        },
      ],
      blast: {
        nodes: [
          { host_id: 'h-0000', status: 'COMPROMISED', role: 'workstation' },
          { host_id: 'h-0001', status: 'CONTAINED', role: 'file-server' },
          { host_id: 'h-0002', status: 'CONTAINED', role: 'domain-controller' },
          { host_id: 'h-0003', status: 'SCANNING', role: 'db-server' },
          { host_id: 'h-0004', status: 'SCANNING', role: 'app-server' },
          { host_id: 'h-0005', status: 'SAFE', role: 'backup-server' },
        ],
        edges: [
          { from_host: 'h-0000', to_host: 'h-0001', reachable_service: 'SMB', status: 'BLOCKED' },
          { from_host: 'h-0000', to_host: 'h-0002', reachable_service: 'RDP', status: 'BLOCKED' },
          { from_host: 'h-0001', to_host: 'h-0003', reachable_service: 'SMB', status: 'ACTIVE' },
          { from_host: 'h-0002', to_host: 'h-0004', reachable_service: 'WinRM', status: 'ACTIVE' },
          { from_host: 'h-0001', to_host: 'h-0005', reachable_service: 'SMB', status: 'BLOCKED' },
        ],
      },
      signals: [
        { signal_type: 'CANARY_TAMPER', fired: true, detail: '2 decoy files modified (fast-path)' },
        {
          signal_type: 'FORMAT_VALIDATION_FAIL',
          fired: true,
          detail: '6 files structurally invalid after write',
        },
        { signal_type: 'OP_FREQUENCY', fired: true, detail: 'peak 280 writes/s' },
        { signal_type: 'TYPE_HEADER_CHANGE', fired: true, detail: 'extension -> .brain on 6 files' },
        { signal_type: 'ENTROPY_DELTA', fired: false, detail: 'flat (intermittent on compressed docs)' },
      ],
    },
    actionFeed: [
      {
        at: '03:14:09',
        action_type: 'ISOLATE_HOST',
        host_id: 'h-0000',
        autonomy_mode: 'FULL_AUTO',
        outcome: 'EXECUTED',
        detail: 'Network isolation, audit-bound',
      },
      {
        at: '03:14:12',
        action_type: 'LOCK_SHARES',
        host_id: 'h-0001',
        autonomy_mode: 'FULL_AUTO',
        outcome: 'EXECUTED',
        detail: 'SMB share lockdown',
      },
      {
        at: '03:14:12',
        action_type: 'KILL_PROCESS',
        host_id: 'h-0000',
        autonomy_mode: 'FULL_AUTO',
        outcome: 'EXECUTED',
        detail: 'pid 6662 terminated',
      },
      {
        at: '03:15:40',
        action_type: 'LLM_REPORT_GENERATED',
        host_id: null,
        autonomy_mode: 'FULL_AUTO',
        outcome: 'EXECUTED',
        detail: 'Faithfulness 0.94 — passed',
      },
      {
        at: '03:16:02',
        action_type: 'RECOMMENDATION_MADE',
        host_id: 'h-0003',
        autonomy_mode: 'FULL_AUTO',
        outcome: 'EXECUTED',
        detail: 'Proposed isolate (1 signal — held below ≥2 rule)',
      },
    ],
    health: {
      overall: 'HEALTHY',
      effective_autonomy: 'FULL_AUTO',
      components: [
        { name: 'DETECTION_ENGINE', status: 'HEALTHY', detail: 'p95 detect 0.8s' },
        { name: 'CONTROL_PLANE', status: 'HEALTHY', detail: 'mTLS, deny-by-default' },
        { name: 'LLM_SERVING', status: 'HEALTHY', detail: 'on-prem 20B (demo: DeepSeek)' },
        { name: 'AUDIT_STORE', status: 'HEALTHY', detail: 'hash-chain valid' },
        { name: 'OPERATIONAL_STORE', status: 'HEALTHY', detail: 'bounded queries' },
        { name: 'AGENT_FLEET', status: 'DEGRADED', detail: '3 agents offline' },
        { name: 'INTEGRATIONS', status: 'HEALTHY', detail: 'SIEM/AD/EDR (mock)' },
      ],
      agent_coverage: { enrolled: 1284, online: 1281, offline: 3 },
    },
    approvals: [
      {
        action_id: 'act-pending-1',
        action_type: 'ISOLATE_HOST',
        host_id: 'h-0003',
        autonomy_mode: 'HUMAN_GATED',
        justification:
          'db-server BJB-DBSE-003: 2 corroborating signals (format-fail + op-frequency), confidence 0.78. Blast-radius reachable from contained file-server.',
        requested_at: '2026-06-12T03:16:05.000Z',
        rollback_deadline: '2026-06-12T03:21:05.000Z',
        signals: 2,
        confidence: 0.78,
      },
    ],
    threat: {
      series: [2, 3, 2, 4, 3, 5, 4, 6, 8, 14, 31, 64, 88, 72, 40, 18, 9, 6, 5, 4],
      detectIndex: 10,
      labels: [
        { i: 0, t: '03:10' },
        { i: 5, t: '03:13' },
        { i: 10, t: '03:14' },
        { i: 15, t: '03:17' },
        { i: 19, t: '03:20' },
      ],
    },
  };
}
