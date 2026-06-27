import { z } from 'zod';
import { AutonomyMode, HostStatus, Id, SchemaVersion, Timestamp } from './common.js';

/** C10 — Operational data model + uniform error envelope. The shared nouns. */

export const Host = z.object({
  host_id: Id,
  hostname: z.string(),
  os: z.string(),
  ip: z.string(),
  segment: z.string(),
  status: HostStatus,
  agent_id: Id.nullable(),
  role: z.string().nullable(),
  criticality: z.enum(['CRITICAL', 'HIGH', 'NORMAL']).nullable(),
  last_seen: Timestamp.nullable(),
});
export type Host = z.infer<typeof Host>;

export const Agent = z.object({
  agent_id: Id,
  host_id: Id,
  cert_subject: z.string(),
  version: z.string(),
  status: z.enum(['ONLINE', 'OFFLINE', 'DEGRADED']),
  canary_inventory: z.array(z.object({ canary_id: Id, directory: z.string(), intact: z.boolean() })),
  last_heartbeat: Timestamp.nullable(),
});
export type Agent = z.infer<typeof Agent>;

export const Incident = z.object({
  incident_id: Id,
  opened_at: Timestamp,
  closed_at: Timestamp.nullable(),
  status: z.enum(['OPEN', 'CONTAINED', 'RESOLVED']),
  trigger_verdict_id: Id.nullable(),
  autonomy_mode: AutonomyMode,
  affected_host_ids: z.array(Id),
  severity: z.string(),
});
export type Incident = z.infer<typeof Incident>;

/** Aggregate summary — never a full dump. Lists are always returned bounded/paginated. */
export const FleetState = z.object({
  total_hosts: z.number().int().min(0),
  protected: z.number().int().min(0),
  compromised: z.number().int().min(0),
  contained: z.number().int().min(0),
  scanning: z.number().int().min(0),
  online_agents: z.number().int().min(0),
  offline_agents: z.number().int().min(0),
});
export type FleetState = z.infer<typeof FleetState>;

/** Uniform error format across all APIs and contracts. Messages never contain secrets or PII. */
export const ErrorEnvelope = z.object({
  schema_version: SchemaVersion,
  error_code: z.string(), // stable, machine-parseable
  message: z.string(),
  correlation_id: z.string(),
  retryable: z.boolean(),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

/** Bounded pagination envelope — the bounded-resource invariant (AC-PERF-03 / AC-DATA-01). */
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

export function boundedLimit(requested: number | undefined): number {
  if (!requested || requested < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(requested, MAX_PAGE_SIZE);
}

export const Page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    next_cursor: z.string().nullable(),
    total_estimate: z.number().int().min(0).nullable(),
  });
