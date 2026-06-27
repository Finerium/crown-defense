# Crown Defense — build guide for agents

Crown Defense (internal codename `talos`) is a **bank-grade autonomous ransomware defense system**:
multi-signal mass-encryption detection → dial-gated host containment → self-hosted-LLM incident
analysis → immutable audit. Detection speed is the demo; **not-acting-wrongly, provability, and
fail-safety are the product.**

## Read these first (single sources of truth)
- **Frozen contracts** (the anti-divergence spine, never alter a field silently): `docs/contracts.md`,
  embodied as executable Zod schemas in `packages/contracts/`. Build against these exact shapes.
- **Locked ADRs** (do not relitigate): `docs/adr/`. Implementation-architecture choices: `docs/architecture.md`.
- **Acceptance criteria** (Definition of Done): `.crown/feature-list.json` (every criterion, `passes:false` until proven).
- **Path-scoped rules**: `.claude/rules/` — `contracts.md`, `security.md`, `testing.md`, `product.md`.
- **Run state / lessons**: `.crown/progress.json` (gates + evidence), `.crown/notes.md` (lessons/deviations).

## Non-negotiable invariants (present from line one, never bolted on)
1. **Fail-safe / deny-by-default.** LLM down or control-plane lost ⇒ degrade toward monitor, maintain
   existing containment, NEVER initiate a new destructive action.
2. **Autonomy dial.** 4 positions (MONITOR_ONLY default → ALERT_RECOMMEND → HUMAN_GATED → FULL_AUTO).
   Destructive actions classified AUTO / ASK_TO_ACT / NEVER_AUTO. HUMAN_GATED destructive = dual control
   (a second distinct approver), time-boxed, auto-rollback, one-click revert. The dial lives INSIDE containment.
3. **Audit immutability.** Every autonomous action + every approval ⇒ append-only, hash-chained,
   tamper-evident, attributable, exportable record. Substrate exists before the first action is possible.
4. **Detection robustness.** Multi-signal fusion; a destructive verdict needs ≥2 corroborating signals
   UNLESS the canary fast-path fired. Format-validation counters intermittent encryption (entropy alone is evadable).
5. **Bounded resource.** No unbounded load/query. Lists paginated + bounded. Memory bounded under a ≥1,000-endpoint fleet.
6. **Sovereignty.** Production LLM is self-hosted on-prem; security telemetry never egresses. Cloud LLM
   (DeepSeek) is **dev/test only**, behind a model-agnostic abstraction (swap = config change, ADR-002).
7. **Self-protection.** mTLS agent↔control-plane; kernel-mode anti-tamper (prod); hardened deny-by-default control plane; signed staged updates.

## THE SAFETY BOUNDARY (refusal + stop, not a capability gap)
NEVER download, handle, build, store, or execute real/live malware. Build the **SAFE simulator** (benign,
reversible, key-retaining, single-directory, non-propagating, no network) and **write** the air-gapped
detonation runbook as docs. Any task touching a real sample ⇒ REJECT and surface.

## Stack (see docs/architecture.md / ADR-016)
pnpm + TypeScript-strict monorepo, Node 25 ESM. `@crown/contracts` = shared Zod schemas. Postgres ×2
(operational + audit, ADR-013). Vitest + Biome + tsc. Agent monitoring = userspace backend for the build
(eBPF/minifilter are documented production backends; Windows driver signing is human-gated, OQ-4).
`PRODUCT_NAME` is a single constant — never hardcode the display name in user-facing strings.

## How work is graded
Fresh-context reviewers grade; the author never signs off its own code. Before reporting progress, audit
each claim against a tool result from this session; if something is not yet verified, say so. Tests/oracles
(`packages/simulator/**`, `packages/test-infra/**`, `**/*.test.ts`, `reports/**`, `.crown/{progress,feature-list}.json`)
are NOT worker-writable — worker subagents run in worktrees and are hook-denied. Commit per gate (durability).
