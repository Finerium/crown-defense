# Frozen Interface Contracts (C1–C10)

**These are FROZEN.** Blueprint section 6 is the authoritative source; `packages/contracts/` is the executable
embodiment (Zod schemas) every component builds against. Do not alter a field without surfacing a
blueprint-conflict and reconciling against the locked invariants. JSON over the wire; all timestamps UTC
ISO-8601 ms; all IDs stable + globally unique; every message carries `schema_version` (reject unknown majors).

| Contract | Producer → Consumer | Schema file | Key invariant (enforced in code) |
|---|---|---|---|
| **C1** TelemetryEvent | Endpoint Agent → Detection Engine | `c1-telemetry.ts` | entropy_read/write sampled at the same offset (delta); never drop CANARY_TOUCHED |
| **C2** DetectionVerdict | Detection → Containment | `c2-verdict.ts` | ISOLATE_HOST ⇒ `corroborating_count>=2` OR `fast_path` (refine) |
| **C3** IncidentContext | Incident → LLM layer | `c3-incident.ts` | bounded summary, never the raw firehose |
| **C4** ActionRecord | any action → Audit | `c4-audit.ts` | HUMAN_GATED destructive ⇒ distinct approver (refine); append-only hash chain |
| **C5** AutonomyDial + policy | Autonomy/Containment | `c5-autonomy.ts` | default MONITOR_ONLY; deny-by-default on CP loss; classification matrix |
| **C6** AgentCommand | Control Plane → Agent | `c6-command.ts` | audit precedes command; destructive needs authz (`rejectionReason`) |
| **C7** IncidentReport / BlastRadiusMap / RecoveryPlan | LLM → Dashboard | `c7-artifacts.ts` | advisory only; every RecoveryPlan step carries `playbook_ref` (refine) |
| **C8** SiemEvent / AdIdentityContext / EdrIsolateRequest | Integration adapters | `c8-integrations.ts` | EDR isolate bound to an audit record |
| **C9** HealthStatus | Health/readiness | `c9-health.ts` | real dependency status; `effective_autonomy` reflects fail-safe override |
| **C10** Host/Agent/Incident/FleetState + ErrorEnvelope | shared data model | `c10-datamodel.ts` | lists always bounded/paginated; no secrets/PII in errors |

The contract invariants are unit-tested in `packages/contracts/src/contracts.test.ts` (18 assertions, all passing).
