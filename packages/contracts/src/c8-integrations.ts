import { z } from 'zod';
import { Id, SchemaVersion, Timestamp } from './common.js';

/** C8 — Integration Adapters (SIEM, Active Directory, EDR). Validated against mocks (real wiring human-gated). */

// Outbound: Crown Defense → SIEM
export const SiemEvent = z.object({
  schema_version: SchemaVersion,
  event_id: Id,
  occurred_at: Timestamp,
  severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  category: z.enum(['DETECTION', 'CONTAINMENT', 'APPROVAL', 'AUDIT', 'HEALTH']),
  host_id: Id.nullable(),
  incident_id: Id.nullable(),
  message: z.string(),
});
export type SiemEvent = z.infer<typeof SiemEvent>;

// Inbound: Active Directory identity context
export const AdIdentityContext = z.object({
  schema_version: SchemaVersion,
  host_id: Id,
  hostname: z.string().nullable(),
  ou: z.string().nullable(),
  owner_user: z.string().nullable(),
  criticality: z.enum(['CRITICAL', 'HIGH', 'NORMAL']).nullable(),
});
export type AdIdentityContext = z.infer<typeof AdIdentityContext>;

// Outbound: EDR isolate-host action
export const EdrIsolateRequest = z.object({
  schema_version: SchemaVersion,
  request_id: Id,
  host_id: Id,
  action: z.enum(['ISOLATE', 'RELEASE']),
  reason: z.string(),
  action_record_id: Id, // bound to the audit record
});
export type EdrIsolateRequest = z.infer<typeof EdrIsolateRequest>;

export const EdrActionResult = z.object({
  request_id: Id,
  outcome: z.enum(['ACCEPTED', 'REJECTED', 'FAILED']),
  reason: z.string().nullable(),
});
export type EdrActionResult = z.infer<typeof EdrActionResult>;
