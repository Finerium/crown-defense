# Crown Defense — run notes (lessons + deviations)

Carried across sessions as recon input. Append; do not rewrite history.

## Phase 0 (foundation)

**Stack chosen (ADR-016):** pnpm + TypeScript-strict monorepo, Node 25 ESM. Postgres ×2 via Docker.
Vitest + Biome + tsc. Rationale + invariant realization in `docs/architecture.md`.

**Deviations / reconciliations flagged (for the Report):**
1. **C5 vs AC-FAIL-01 tension.** C5's literal "reasoning layer down ⇒ no new destructive action" would stop
   containment when the *advisory* LLM is down, but AC-FAIL-01 requires containment to continue then. Resolved
   in favor of the explicit acceptance criterion: the fail-safe override fires on **control/decision-plane**
   loss, not advisory-LLM loss. Encoded in `c5-autonomy.ts effectiveAutonomy()`. Most defensible reading.
2. **Design extras with no contract field.** `Host.risk` (0–100 UI score) → `hosts.risk` operational column,
   not a contract field. Richer design `Incident` fields (family/vector/cve/filesEncrypted/patientZero/...) →
   sourced from C7 IncidentReport + C3 telemetry_summary into `incidents.enrichment` JSONB. No contract changes.
3. **Design bundle has no README** (mission referenced one). Used the `.jsx`/`.css`/`talos-data.js` +
   screenshots as visual truth instead.

**Agent FS monitoring:** userspace backend for the build (behind C1); eBPF/minifilter are the documented
production backends; Windows driver signing is human-gated (OQ-4). Not a build blocker.

**HOOK ACTIVATION (important for relaunch):** the enforcement hooks were written and unit-verified correct
(`pretooluse-safety` blocks the CROWN_HOOK_PROBE sentinel; `verification-integrity` blocks a worktree/worker
from writing oracle paths and allows the main thread). They are NOT active in the session that wrote them —
Claude Code loads settings.json at session start. **Action: relaunch once with the same paste; on relaunch the
hooks are active. Probe with `echo CROWN_HOOK_PROBE` (must be BLOCKED) before fanning out Phase 1.**

**Worker-vs-main detection:** the verification-integrity hook treats a linked git worktree (`.git` is a FILE)
as a worker and the main working tree (`.git` is a DIR) as the orchestrator. Code-writing workers always run
in worktrees, so they are denied oracle writes; the orchestrator is not. CROWN_WORKER=1 also forces worker mode.

**Oracle authorship:** the safe simulator, benign-workload suite, and graded tests are TEST ORACLES. The hook
denies workers from writing `packages/simulator/**`, `packages/test-infra/**`, `**/*.test.ts`, `reports/**`,
and `.crown/{progress,feature-list}.json`. ⇒ Phase 1's simulator/benign-suite/metrics are **main-thread**
work, not fanned out. Phase 2+ feature code is fanned out to workers in worktrees; their tests are written by
the main thread / fresh-context reviewers.

## Gate-0 adversarial review (two fresh-context reviewers) — fixed + flagged

Both returned CONCERNS (not FAIL). **Fixed before fan-out (all re-verified green, 28 tests):**
1. **C2 corroboration was self-reported.** Added a refine binding `corroborating_count` to the count of
   actually-fired signals — a producer can no longer inflate the count to smuggle ISOLATE_HOST past the ≥2 rule.
2. **`effectiveAutonomy()` ignored `reasoningLayerUp`** (dropped half of ADR-005). Split into
   `effectiveAutonomy({controlPlaneReachable})` (destructive-action gate; LLM-down keeps containment per
   AC-FAIL-01) + `healthOverall({controlPlaneReachable,reasoningLayerUp})` (C9 DEGRADED on either impairment).
3. **Enforcement-floor gaps closed.** verification-integrity hook now also matches **Bash** (a worker could
   otherwise write an oracle via `>`/`tee`/`sed -i`/`writeFileSync`), and **walks up parent dirs** for `.git`
   so a worker in a package subdir is still detected (no more fail-open). Unit-tested both.

**Flagged for later phases (recorded in docs/architecture.md §7, NOT yet done — none block the build):**
- Audit key custody: WORM trigger is owner-bypassable + HMAC key co-located with DB creds → Phase 7/12 needs a
  least-privilege audit-writer role + KMS/HSM key.
- DB CHECK constraints on enum columns (Phase 7/11). `exportSlice` self-proof (Phase 7). Streamed verify for
  large chains (Phase 11). Major-version rejection is a boundary helper (`majorVersionAccepted`) consumers must
  call at ingest — wire it where messages enter the system.

## Relaunch #1 recon (this session) — Gate 0 confirmed, hooks ACTIVE

Recon of committed Gate 0 against the real repo:
- **Hooks now ACTIVE** (the prior session's only blocker). Probed live: `echo CROWN_HOOK_PROBE` → BLOCKED by
  pretooluse-safety; a throwaway worker in `.claude/worktrees/agent-…` → BLOCKED by verification-integrity
  when it tried to Write `packages/simulator/__hook_probe__.test.ts`. Enforcement floor verified active.
- Re-verified: `tsc -b` exit 0; vitest 28/28 pass; biome clean (fixed one stale line-wrap nit in
  contracts.test.ts left by the Gate-0 C2 fix); docker `crown-db` up+healthy (operational+audit DBs).
- Conclusion: Gate 0 genuinely passed. Resuming from Phase 1. Depth-spend stance active Phase 1 onward.
