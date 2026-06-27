import { z } from 'zod';
import { AutonomyMode, SchemaVersion, Timestamp } from './common.js';

/** C9 — Health and Readiness. Reflects REAL dependency status, never a static OK. */

export const ComponentName = z.enum([
  'DETECTION_ENGINE',
  'CONTROL_PLANE',
  'LLM_SERVING',
  'AUDIT_STORE',
  'OPERATIONAL_STORE',
  'AGENT_FLEET',
  'INTEGRATIONS',
]);

export const HealthLevel = z.enum(['HEALTHY', 'DEGRADED', 'UNHEALTHY']);

export const HealthStatus = z.object({
  schema_version: SchemaVersion,
  checked_at: Timestamp,
  overall: HealthLevel,
  components: z.array(z.object({ name: ComponentName, status: HealthLevel, detail: z.string().nullable() })),
  agent_coverage: z.object({
    enrolled: z.number().int().min(0),
    online: z.number().int().min(0),
    offline: z.number().int().min(0),
  }),
  // effective_autonomy reflects the fail-safe override; can be lower than the configured dial (ADR-005).
  effective_autonomy: AutonomyMode,
});
export type HealthStatus = z.infer<typeof HealthStatus>;
