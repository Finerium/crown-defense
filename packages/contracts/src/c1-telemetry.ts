import { z } from 'zod';
import { Id, SchemaVersion, Timestamp } from './common.js';

/** C1 — Endpoint Agent → Detection Engine (telemetry). The detection engine consumes only this. */

export const TelemetryEventType = z.enum([
  'FILE_WRITE',
  'FILE_RENAME',
  'FILE_CREATE',
  'FILE_DELETE',
  'CANARY_TOUCHED',
  'FILE_TYPE_CHANGED',
  'PROCESS_START',
  'PROCESS_STOP',
  'HEARTBEAT',
]);
export type TelemetryEventType = z.infer<typeof TelemetryEventType>;

export const CanaryOperation = z.enum(['READ', 'WRITE', 'RENAME', 'DELETE']);

export const TelemetryEvent = z.object({
  schema_version: SchemaVersion,
  event_id: Id,
  agent_id: Id, // stable agent/host identity (cert subject)
  host_id: Id,
  emitted_at: Timestamp,
  event_type: TelemetryEventType,
  process: z.object({
    pid: z.number().int().nullable(),
    path: z.string().nullable(),
    user: z.string().nullable(),
    signed: z.boolean().nullable(),
  }),
  file: z.object({
    path: z.string().nullable(),
    prev_type: z.string().nullable(),
    new_type: z.string().nullable(),
    size_bytes: z.number().int().nullable(),
    // entropy_read/entropy_write sampled at the SAME offset window (Redemption delta method, ADR-011)
    entropy_read: z.number().min(0).max(8).nullable(),
    entropy_write: z.number().min(0).max(8).nullable(),
    header_changed: z.boolean().nullable(),
    // format_valid=false is the intermittent-encryption counter-signal (ADR-001)
    format_valid: z.boolean().nullable(),
  }),
  canary: z
    .object({
      canary_id: z.string().nullable(),
      directory: z.string().nullable(),
      operation: CanaryOperation.nullable(),
    })
    .nullable(),
  op_window: z
    .object({
      writes_per_sec: z.number().nullable(),
      renames_per_sec: z.number().nullable(),
      distinct_types_touched: z.number().int().nullable(),
    })
    .nullable(),
});
export type TelemetryEvent = z.infer<typeof TelemetryEvent>;
