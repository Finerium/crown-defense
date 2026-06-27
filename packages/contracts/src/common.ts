import { z } from 'zod';

/**
 * Single source of truth for the product display name (OQ-5 / ADR rename rule).
 * Never hardcode "Crown Defense" in user-facing strings — read this constant.
 * Overridable via env so a future rename is a one-line/config change.
 */
export const PRODUCT_NAME: string = process.env.CROWN_PRODUCT_NAME ?? 'Crown Defense';

/** Current contract schema version. Consumers reject unknown MAJOR versions. */
export const SCHEMA_VERSION = '1.0' as const;

/** UTC ISO-8601 millisecond timestamp. */
export const Timestamp = z
  .string()
  .datetime({ offset: true })
  .describe('UTC ISO-8601 with millisecond precision');

/** Stable, globally-unique id. */
export const Id = z.string().min(1);

/** schema_version field present on every contract message. */
export const SchemaVersion = z.string().min(1);

/** Shared host/incident status enums used across contracts. */
export const HostStatus = z.enum(['COMPROMISED', 'CONTAINED', 'SCANNING', 'SAFE', 'PROTECTED']);
export type HostStatus = z.infer<typeof HostStatus>;

export const AutonomyMode = z.enum(['MONITOR_ONLY', 'ALERT_RECOMMEND', 'HUMAN_GATED', 'FULL_AUTO']);
export type AutonomyMode = z.infer<typeof AutonomyMode>;

export const Classification = z.enum(['AUTO', 'ASK_TO_ACT', 'NEVER_AUTO']);
export type Classification = z.infer<typeof Classification>;

/**
 * Reject a message whose MAJOR schema_version is newer than we understand (forward-compat guard).
 * Returns true if acceptable.
 */
export function majorVersionAccepted(version: string, current: string = SCHEMA_VERSION): boolean {
  const got = Number.parseInt(version.split('.')[0] ?? '', 10);
  const cur = Number.parseInt(current.split('.')[0] ?? '', 10);
  return Number.isFinite(got) && Number.isFinite(cur) && got <= cur;
}
