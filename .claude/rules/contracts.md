# RULE: Frozen interface contracts (C1–C10)

The contracts in `docs/contracts.md` / `packages/contracts/` are **FROZEN**. They are the anti-divergence
spine: every component builds against these exact field names, types, semantics, and enumerations.

- Implement them as written. Do NOT add, rename, retype, or drop a field to make code or a mockup fit.
- If you believe a contract is wrong or a designed element has no contract, STOP and surface a
  blueprint-conflict (note it for the orchestrator in your return). Never silently invent or alter a contract.
- All timestamps: UTC ISO-8601 millisecond. All IDs: stable, globally unique. Every message carries
  `schema_version`; reject unknown major versions.
- Validate every external input at the boundary with the `@crown/contracts` Zod validators (AC-SEC-04).
- Key invariants encoded in contracts: a `MASS_ENCRYPTION` verdict recommending `ISOLATE_HOST` needs
  `corroborating_count >= 2` OR `fast_path === true` (C2). HUMAN_GATED destructive `ActionRecord` MUST carry
  a distinct `approver` (C4). The audit record precedes the `AgentCommand` (C6/AC-ACT-02). The LLM layer
  emits only `IncidentReport`/`BlastRadiusMap`/`RecoveryPlan` (C7) — never an `ActionRecord` or `AgentCommand`.
