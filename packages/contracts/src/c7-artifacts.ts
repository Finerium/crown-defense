import { z } from 'zod';
import { Id, SchemaVersion, Timestamp } from './common.js';

/** C7 — LLM Artifacts (report, blast-radius map, recovery plan). All ADVISORY. */

export const ArtifactHostStatus = z.enum(['COMPROMISED', 'CONTAINED', 'SCANNING', 'SAFE']);
export const ArtifactEdgeStatus = z.enum(['ACTIVE', 'BLOCKED']);

export const Faithfulness = z.object({
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  unsupported_claims: z.array(z.string()),
});

export const IncidentReport = z.object({
  schema_version: SchemaVersion,
  incident_id: Id,
  generated_at: Timestamp,
  model_id: z.string(),
  summary: z.string(),
  timeline: z.array(z.object({ at: Timestamp, phase: z.string(), description: z.string() })),
  attributed_technique_ids: z.array(z.string()), // MITRE ATT&CK ids, e.g. T1486
  faithfulness: Faithfulness,
  citations: z.array(z.object({ claim: z.string(), playbook_ref: z.string() })),
});
export type IncidentReport = z.infer<typeof IncidentReport>;

export const BlastRadiusMap = z.object({
  schema_version: SchemaVersion,
  incident_id: Id,
  nodes: z.array(z.object({ host_id: Id, status: ArtifactHostStatus, role: z.string().nullable() })),
  edges: z.array(
    z.object({
      from_host: Id,
      to_host: Id,
      reachable_service: z.string().nullable(),
      status: ArtifactEdgeStatus,
    })
  ),
});
export type BlastRadiusMap = z.infer<typeof BlastRadiusMap>;

export const RecoveryStep = z.object({
  order: z.number().int(),
  action: z.string(),
  rationale: z.string(),
  playbook_ref: z.string(), // attribution (faithfulness) — every step must cite the playbook
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM']),
  depends_on: z.array(z.number().int()).nullable(),
});

export const RecoveryPlan = z
  .object({
    schema_version: SchemaVersion,
    incident_id: Id,
    steps: z.array(RecoveryStep),
    faithfulness: z.object({ score: z.number().min(0).max(1), passed: z.boolean() }),
  })
  // AC-LLMART-01: every RecoveryPlan step carries a non-empty playbook_ref.
  .refine((p) => p.steps.every((s) => s.playbook_ref.trim().length > 0), {
    message: 'every RecoveryPlan step must carry a playbook_ref (attribution)',
    path: ['steps'],
  });
export type RecoveryPlan = z.infer<typeof RecoveryPlan>;
