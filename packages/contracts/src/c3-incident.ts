import { z } from 'zod';
import { DetectionVerdict } from './c2-verdict.js';
import { ActionRecord } from './c4-audit.js';
import { AutonomyMode, Id, SchemaVersion, Timestamp } from './common.js';

/**
 * C3 — Incident Context → LLM Orchestration Layer. The LLM consumes only this + the RAG playbook.
 * It is a BOUNDED summary (bounded-resource invariant) — never the raw telemetry firehose.
 */

export const AffectedHostStatus = z.enum(['COMPROMISED', 'CONTAINED', 'SCANNING', 'SAFE']);
export const EdgeStatus = z.enum(['ACTIVE', 'BLOCKED']);

export const IncidentContext = z.object({
  schema_version: SchemaVersion,
  incident_id: Id,
  opened_at: Timestamp,
  trigger_verdict: DetectionVerdict,
  autonomy_mode: AutonomyMode,
  containment_actions: z.array(ActionRecord),
  affected_hosts: z.array(
    z.object({
      host_id: Id,
      status: AffectedHostStatus,
      role: z.string().nullable(),
      first_event_at: Timestamp.nullable(),
    })
  ),
  topology_edges: z.array(
    z.object({
      from_host: Id,
      to_host: Id,
      reachable_service: z.string().nullable(), // SMB, RDP, SSH...
      status: EdgeStatus,
    })
  ),
  telemetry_summary: z.object({
    total_files_touched: z.number().int().min(0),
    encryption_rate_est: z.number().nullable(),
    families_indicated: z.array(z.string()).nullable(),
  }),
});
export type IncidentContext = z.infer<typeof IncidentContext>;
