# Crown Defense — Implementation Architecture (ADR-016)

This document chooses the concrete stack and module layout **within the locked bounds** (blueprint §5 ADRs,
§6 contracts, §8 acceptance criteria). A fresh-context reviewer validates it against every frozen contract
and invariant before any fan-out (Gate 0).

## 1. Stack decision and justification

| Concern | Choice | Why (within locked bounds) |
|---|---|---|
| Language / runtime | **TypeScript-strict, Node 25 (ESM)**, pnpm workspaces monorepo | One language across detection, control plane, LLM, dashboard, sim. Strict TS = type-safety gate (AC-TYPE). Single repo, one config differentiates demo vs pilot (ADR-003). |
| Shared contracts | **`@crown/contracts` (Zod)** | Executable embodiment of C1–C10; Zod gives runtime boundary validation for free (AC-SEC-04). Refinements encode invariants (corroboration, dual control, attribution). |
| Data stores | **Postgres ×2** (operational + audit), Docker | ADR-013 separation. Audit DB has a **WORM trigger** (append-only at the DB layer) + app-level hash chain (ADR-004). |
| Agent FS monitoring | **Userspace backend for the build** (Node fs.watch/polling) behind C1; eBPF/minifilter documented as the production backends | ADR-006 explicitly allows "fanotify for a light Linux build". Kernel drivers + **Windows driver signing are human-gated (OQ-4)** — not a build blocker. The C1 contract is identical above any backend. |
| LLM | **Model-agnostic OpenAI-compatible client**; DeepSeek (cloud) for dev/test only | ADR-002. The abstraction makes the prod swap to a self-hosted 20–30B model a **config change**. Production self-hosting (SGLang/vLLM + GPU) is the documented deployment path. |
| Dashboard | **Next.js (App Router)** consuming the design tokens (`crown-defense-design/talos.css`) | Visual truth from the bundle; behavior from the blueprint; bounded/paginated reads (AC-PERF-03). |
| Tests / lint / types | **Vitest + Biome + tsc** | Fast TS-native test pyramid; one fast lint+format tool (AC-LINT); strict typecheck (AC-TYPE). |

## 2. Package layout (maps to the 10 components in §5.1)

```
packages/
  contracts/     C1–C10 Zod schemas + invariants            [Phase 0 ✓]
  audit/         hash-chain core + WORM Postgres store        [Phase 0 substrate ✓ → Phase 7 full]
  simulator/     SAFE parametric simulator (oracle)           [Phase 0 interface ✓ → Phase 1 full]
  test-infra/    benign-workload suite, fleet sim, metrics    [Phase 1]
  agent/         FS monitor (userspace backend) + canaries → C1; local containment actuators  [Phase 2/3]
  detection/     multi-signal fusion engine → C2              [Phase 2]
  containment/   dial-gated C5 enforcement, C6 commands       [Phase 3]
  control-plane/ mTLS channel, agent registry, command dist.  [Phase 3]
  autonomy/      dial state machine, dual control, rollback   [Phase 7]
  llm/           model-agnostic serving, RAG, faithfulness gate → C3/C7  [Phase 4]
  integrations/  SIEM/AD/EDR adapters + mocks → C8            [Phase 15]
  dashboard/     Next.js surfaces on the design tokens        [Phase 5]
```

Coupled glue (foundation, fusion decision, closed-loop integration, deploy) is sequential/main-thread.
Each parallel phase fans out by frozen-contract boundary into waves ≤16.

## 3. How each LOCKED INVARIANT is realized in the architecture

1. **Fail-safe / deny-by-default (ADR-005).** `effectiveAutonomy()` in `c5-autonomy.ts`: control-plane
   unreachable ⇒ effective `MONITOR_ONLY` (no new destructive action); agent maintains existing containment
   locally (it holds enough state to survive CP loss, ADR-012). LLM down ⇒ deterministic detection+containment
   continue, report generation queues (AC-FAIL-01). The control plane is deny-by-default on every privileged route.
2. **Autonomy dial (ADR-003).** `AutonomyDial` + `classify()` + the `dial_state` table (default MONITOR_ONLY).
   Containment consults the dial+matrix BEFORE acting (the dial lives inside containment, Phase 3). HUMAN_GATED
   destructive ⇒ dual control via the `approvals` table; time-boxed with `rollback_deadline` + one-click revert.
3. **Audit immutability (ADR-004/013).** `@crown/audit`: HMAC-keyed hash chain (`sealRecord`/`verifyChain`) +
   separate audit DB with a WORM trigger. Substrate exists now (Phase 0), realized fully in Phase 7. Audit
   record precedes every destructive command (C6/AC-ACT-02).
4. **Detection robustness (ADR-001/011).** Fusion of canary fast-path, entropy delta (read-vs-write same
   offset), op-frequency, type/header change, and **format-validation** (intermittent-encryption counter).
   Two C2 schema refinements make a dishonest destructive verdict unrepresentable: (a) `corroborating_count`
   must EQUAL the number of actually-fired `signals[]` (no self-reported inflation), and (b) ISOLATE_HOST
   requires `corroborating_count>=2` OR `fast_path`. A producer cannot smuggle isolation past the ≥2 rule.
5. **Bounded resource.** `boundedLimit()` + `Page<T>` + `FleetState` aggregate. Every list query is capped
   (`MAX_PAGE_SIZE=200`). Fleet memory bounded under the ≥1,000-endpoint synthetic fixture (Phase 11).
6. **Sovereignty (ADR-002).** LLM behind a model-agnostic abstraction; prod config self-hosts and asserts
   zero external egress (AC-COMP-01). DeepSeek is dev/test only and never on the production path.
7. **Self-protection (ADR-007).** mTLS channel (Node TLS + a self-signed CA generated at setup, Phase 3);
   anti-tamper for the agent (kernel-mode in production; build verifies the service-protection + self-heal
   logic and config); hardened deny-by-default control plane; signed staged updates (ADR-015).

## 4. Build-vs-production boundary (honest, restated)

Verified in THIS build: userspace FS monitoring behind C1; simulated containment actuators; mTLS channel;
DeepSeek-backed LLM layer; full audit chain + WORM; the dial + dual control + audit; the dashboard; the
closed loop against the SAFE simulator. **Human-gated / documented-only:** real-malware detonation (air-gapped
lab runbook — we WRITE it, never touch a sample); Windows minifilter + anti-tamper **driver signing** (OQ-4);
production self-hosted GPU LLM serving; BJB production deployment; OJK engagement on autonomy.

## 5. Design-vs-contract reconciliation (flagged, not silently resolved)

- The design `Host` carries a **`risk` score (0–100)** with no contract field → kept as a UI-derived
  operational column (`hosts.risk`), not a new contract field. Flagged.
- The design `Incident` is richer than C10 (`family`, `vector`, `cve`, `filesEncrypted`, `patientZero`,
  `extension`, `detectLatency`, `containment%`) → sourced from the LLM `IncidentReport` (C7) +
  `telemetry_summary` (C3), stored in `incidents.enrichment` JSONB. No new contract fields. Flagged.
- The design bundle has **no README** (mission referenced one) → the `.jsx`/`.css`/`talos-data.js` files +
  per-state screenshots are the visual truth used instead. Flagged.

## 6. Deliberate blueprint reconciliation (per the stop-and-ask rule)

C5's deny-by-default text ("control plane unreachable **or the reasoning layer is down** ⇒ no new
destructive action") read literally would stop containment when the *advisory* LLM is down — but the LLM
**never authorizes containment** (it is advisory, C3/C7) and **AC-FAIL-01 explicitly requires containment to
continue when the LLM is down**. Resolution (most defensible reading): the fail-safe override fires on loss of
the **decision/control plane**, not on loss of the advisory LLM; LLM-down degrades reporting only.

This is realized as **two distinct functions** so neither half of ADR-005 is dropped:
- `effectiveAutonomy(configured, {controlPlaneReachable})` — the gate for NEW DESTRUCTIVE actions. Drops to
  MONITOR_ONLY ONLY on control-plane loss. LLM-down does not lower it (containment continues, AC-FAIL-01).
- `healthOverall({controlPlaneReachable, reasoningLayerUp})` — the C9 reported reality. DEGRADED when EITHER
  dependency is impaired. This is where "reasoning-layer failure degrades the reported autonomy" lands
  (ADR-005, C9), satisfying AC-HEALTH-01 without contradicting AC-FAIL-01.

Surfaced here and in `.crown/notes.md` for the Report.

## 7. Flagged prod-hardening items (from Gate-0 adversarial review; scheduled, not yet done)

Raised by the two fresh-context reviewers; none block the build (no actuation code exists yet), but they are
recorded so they are not lost:
- **Audit key custody (Phase 7/12).** The WORM trigger is owner-bypassable (`DISABLE TRIGGER`,
  `session_replication_role`), and `.env` co-locates `AUDIT_INTEGRITY_KEY` with the DB creds under one role.
  Prod needs a least-privilege audit-writer DB role (no UPDATE/DELETE/TRUNCATE/trigger-admin) and a
  KMS/HSM-held HMAC key, so forging a chain needs a secret the DB-write principal does not hold.
- **DB CHECK constraints (Phase 7/11).** `dial_state.position`, `hosts.status`, `incidents.status` are TEXT
  with no enum CHECK; Zod guards at the app boundary today — add DB-level CHECK constraints as defense in depth.
- **`exportSlice` self-proof (Phase 7).** AC-AUDIT-04 export currently reports `chain_valid` from the full
  chain; add a self-contained verifiable proof for the exported slice.
- **Bounded verify path (Phase 11/soak).** `readChain(null)` loads the whole chain for verification; stream
  it for very large audit logs.
