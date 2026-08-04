/**
 * Wire types for the demo surface. Everything a client component needs is here, and everything here is a
 * TYPE (no runtime export), so `import type { ... } from '../lib/server/types'` from a 'use client' file
 * pulls no server code into the browser bundle.
 *
 * The C1/C2/C4/C6 shapes are re-used from @crown/contracts rather than restated, so the frozen contracts
 * stay the single source of truth. See ./API.md for the route-by-route contract.
 */
import type { ContainmentDecision, Disposition } from '@crown/containment';
import type {
  ActionRecord,
  AutonomyMode,
  DetectionSignal,
  DetectionVerdict,
  RecommendedAction,
  Verdict,
} from '@crown/contracts';

export type { ActionRecord, AutonomyMode, ContainmentDecision, DetectionSignal, DetectionVerdict };
export type { Disposition, RecommendedAction, Verdict };

/* -------------------------------------------------------------------------- */
/* Scenario catalogue                                                          */
/* -------------------------------------------------------------------------- */

/** 'serangan' = attack (safe simulator), 'sah' = legitimate workload (benign FP oracle). */
export type ScenarioGroup = 'serangan' | 'sah';

/** What the console publishes about a scenario. Carries no verdict and no severity, by construction. */
export interface ScenarioSummary {
  id: string;
  group: ScenarioGroup;
  labelId: string;
  labelEn: string;
  /** Fleet host the workload is attributed to (also becomes the C1 host_id of the run). */
  host: string;
  segment: string;
  /** MITRE ATT&CK id where the mapping is honest, null where it would be a stretch. */
  technique: string | null;
  descId: string;
  /** Attack group only: parameters resolved from the real @crown/simulator family battery. */
  family: string | null;
  mode: string | null;
  filesPerSecond: number | null;
  blockBytes: number | null;
  plantCanary: boolean | null;
  /** Benign group only: the @crown/test-infra workload this scenario replays. */
  workload: string | null;
  /** Benign group only: why the engine is expected NOT to isolate. Indonesian. */
  expectedNonIsolationReasonId: string | null;
  /** Honesty note about what the safe simulator does and does not model. Indonesian. Usually null. */
  noteId: string | null;
}

/* -------------------------------------------------------------------------- */
/* Console progress (deliberately verdict-free)                                */
/* -------------------------------------------------------------------------- */

export type RunPhase = 'antre' | 'berjalan' | 'selesai';

/**
 * The ONLY thing the console can observe about a run. There is no verdict, severity, signal or action
 * field here and there must never be one: the console starts a workload and learns nothing else.
 */
export interface KonsolStatus {
  runId: string;
  scenarioId: string;
  phase: RunPhase;
  eventsEmitted: number;
  filesTouched: number;
  elapsedMs: number;
}

/** The complete pending-workload record. Four fields, no fifth. */
export interface WorkloadRequest {
  runId: string;
  scenarioId: string;
  requestedAt: string;
  requestedBy: string;
}

/* -------------------------------------------------------------------------- */
/* Latency, with the honesty labels attached                                   */
/* -------------------------------------------------------------------------- */

export interface LatencyLabel {
  id: string;
  en: string;
}

export interface LatencyReport {
  /** Measured wall clock of real engine processing, pacing delay removed. Null until the verdict. */
  detection_wall_ms: number | null;
  /** Delta between C1 emitted_at values. A SIMULATED timeline, not a measured production latency. */
  detection_timeline_ms: number | null;
  /** Measured wall clock from verdict to terminal containment outcome. */
  containment_wall_ms: number | null;
  /** Total delivery pacing removed from detection_wall_ms, so the subtraction is auditable. */
  paced_out_ms: number;
  labels: {
    detection_wall_ms: LatencyLabel;
    detection_timeline_ms: LatencyLabel;
    containment_wall_ms: LatencyLabel;
    paced_out_ms: LatencyLabel;
  };
}

export interface RunCounts {
  eventsIngested: number;
  filesTouched: number;
  writes: number;
  renames: number;
}

/* -------------------------------------------------------------------------- */
/* SSE stream events (GET /api/telemetri/aliran)                               */
/* -------------------------------------------------------------------------- */

export type AliranEventName =
  | 'detak'
  | 'mulai'
  | 'tik'
  | 'putusan'
  | 'kontainmen'
  | 'audit'
  | 'selesai'
  | 'galat';

/** Idle baseline. Carries no telemetry, because nothing is happening and inventing some would be a lie. */
export interface DetakEvent {
  type: 'detak';
  at: string;
  seq: number;
  idle: boolean;
  dial: AutonomyMode;
  /**
   * Does THIS stream currently hold the work lease? A dashboard with aktif=false is connected and healthy
   * but will not pick up console button presses, because another dashboard is holding the lease. The UI
   * must say that out loud rather than sitting silently idle, which is what confused three people on
   * three machines into thinking runs were vanishing.
   */
  aktif: boolean;
}

export interface MulaiEvent {
  type: 'mulai';
  runId: string;
  at: string;
  scenario: ScenarioSummary;
  dial: AutonomyMode;
  totalEvents: number;
  pacingGapMs: number;
}

/** One C1 event ingested by the real engine, with the engine's own five-evaluator output. */
export interface TikEvent {
  type: 'tik';
  runId: string;
  at: string;
  index: number;
  eventType: string;
  filePath: string | null;
  emittedAt: string;
  signals: DetectionSignal[];
  verdict: Verdict;
  recommendedAction: RecommendedAction;
  confidence: number;
  corroboratingCount: number;
  fastPath: boolean;
  suppressedByAllowlist: boolean;
  suppressionReason: string | null;
  counts: RunCounts;
}

/** Fired at most once per run, on the first MASS_ENCRYPTION verdict. */
export interface PutusanEvent {
  type: 'putusan';
  runId: string;
  at: string;
  index: number;
  verdict: DetectionVerdict;
  latency: LatencyReport;
}

export interface KontainmenEvent {
  type: 'kontainmen';
  runId: string;
  at: string;
  decision: ContainmentDecision;
  executed: boolean;
  outcome: string | null;
  outcomeReason: string | null;
  actionRecordId: string | null;
  command: {
    command_id: string;
    command_type: string;
    target_host_id: string;
    action_record_id: string;
    rollback_deadline: string | null;
  } | null;
}

export interface AuditEvent {
  type: 'audit';
  runId: string;
  at: string;
  record: ActionRecord;
  chainLength: number;
}

export interface SelesaiEvent {
  type: 'selesai';
  runId: string;
  at: string;
  scenarioId: string;
  finalVerdict: Verdict;
  destructiveVerdictReached: boolean;
  containmentExecuted: boolean;
  disposition: Disposition | null;
  auditChainLength: number;
  auditHeadHash: string | null;
  counts: RunCounts;
  latency: LatencyReport;
  scratchRemoved: boolean;
}

export interface GalatEvent {
  type: 'galat';
  at: string;
  runId: string | null;
  pesan: string;
}

export type AliranEvent =
  | DetakEvent
  | MulaiEvent
  | TikEvent
  | PutusanEvent
  | KontainmenEvent
  | AuditEvent
  | SelesaiEvent
  | GalatEvent;

/* -------------------------------------------------------------------------- */
/* Audit verification                                                          */
/* -------------------------------------------------------------------------- */

export interface ChainVerificationResult {
  valid: boolean;
  brokenAt: number | null;
  reason: string | null;
  count: number;
}

export interface TamperDemoResult {
  /** Index in the copied chain that was mutated. -1 when the chain is empty. */
  mutatedIndex: number;
  mutatedChainSeq: number | null;
  mutatedField: string;
  before: ChainVerificationResult;
  after: ChainVerificationResult;
  link: {
    chain_seq: number;
    expected_record_hash: string;
    stored_record_hash: string;
    next_stored_prev_hash: string | null;
  } | null;
}

/* -------------------------------------------------------------------------- */
/* Plain HTTP payloads                                                         */
/* -------------------------------------------------------------------------- */

export interface JalankanResponse {
  runId: string;
  accepted: true;
}

export interface MasukResponse {
  ok: boolean;
  label: string | null;
  pesan: string | null;
}

export interface DialResponse {
  position: AutonomyMode;
}

export interface PesanResponse {
  pesan: string;
}

/* -------------------------------------------------------------------------- */
/* Incident log. Client components import these type-only, so they must live    */
/* here and not in insiden.ts, which pulls in the Blob SDK.                     */
/* -------------------------------------------------------------------------- */

/** One recorded incident. Everything a judge could want to check about a run that already happened. */
export interface CatatanInsiden {
  runId: string;
  scenarioId: string;
  scenarioLabel: string;
  group: 'serangan' | 'sah';
  host: string;
  segment: string;
  family: string | null;
  mode: string | null;
  /** UTC ISO-8601 with milliseconds. Rendered as WIB by the UI, never stored as local time. */
  startedAtUtc: string;
  finishedAtUtc: string;
  dialAtStart: AutonomyMode;
  finalVerdict: string;
  destructiveVerdictReached: boolean;
  corroboratingCount: number | null;
  fastPath: boolean | null;
  signalsFired: string[];
  suppressedByAllowlist: boolean;
  suppressionReason: string | null;
  disposition: string | null;
  containmentExecuted: boolean;
  commandIssued: boolean;
  filesTouched: number;
  eventsIngested: number;
  detectionWallMs: number | null;
  containmentWallMs: number | null;
  chain: ActionRecord[];
  chainHeadHash: string | null;
  scratchRemoved: boolean;
}

/** Summary row for the history list. Deliberately small: the list must load in one request. */
export interface RingkasanInsiden {
  runId: string;
  scenarioLabel: string;
  group: 'serangan' | 'sah';
  host: string;
  startedAtUtc: string;
  dialAtStart: AutonomyMode;
  finalVerdict: string;
  containmentExecuted: boolean;
  chainLength: number;
  pathname: string;
}
