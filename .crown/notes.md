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

## Mission addendum (received this session) — Vercel live demo-mode dashboard = Gate 6 acceptance item

Execute at Phase 5/6 (do NOT derail earlier gates). Requirements:
- **Live, user-interactive demo of the Command Dashboard on Vercel, live BEFORE the Gate 6 stop.**
- **Only the dashboard frontend deploys to Vercel.** The kernel agent, control plane, Postgres, and
  LLM serving are NOT Vercel-deployable — do not attempt. The real detection/containment/agent run on a host.
- **Self-contained DEMO MODE**: static frontend + Vercel serverless functions, ZERO dependency on any
  separately-running backend host (works even when nothing else is running). A visitor triggers a simulated
  ransomware scenario and watches the real closed-loop UI play out: detection signals firing from the safe
  simulator's FIXTURES (never real malware), dial-gated containment, and a genuinely LIVE LLM-generated
  IncidentReport + BlastRadiusMap + RecoveryPlan produced by calling the DeepSeek API
  (DEEPSEEK_API_KEY, LLM_API_BASE_URL, LLM_MODEL from .env) inside a Vercel serverless function.
  **Key stays server-side only — never in client code.**
- **Label clearly** in the UI and in Report-hackathon.md as a demo/simulation on synthetic data, not the
  production agent.
- gh + Vercel CLI already authorized on this machine → proceed without an auth stop (satisfies the earlier
  deploy stop-and-ask). Create/link a Vercel project named **crown-defense** to serve at
  crown-defense.vercel.app; enable auto-redeploy on push to the default branch; deploy. If that exact
  subdomain is unavailable, deploy anyway and report the actual URL. (Implies pushing this repo to GitHub.)
- **Verify live with browser automation** (URL loads, simulated scenario runs end-to-end, DeepSeek-backed
  report renders) before claiming it works. Put the live URL + repo URL in Report-hackathon.md at Gate 6.
- Demo mode shares the SAME contracts/components as the real dashboard; it is a data-source switch
  (fixture+serverless vs live backend), not a separate UI — keep one dashboard, one set of C-contracts.

## Phase 1 adversarial review (6-lens workflow) — returned FAIL, fixed, all green

Fresh-context multi-lens review (2 FAIL, 3 CONCERNS; 1 lens — format-validator — errored on the Opus
cyber-classifier, ADR-009 known issue). Synthesis: NOT safe to gate Phase 2 until 3 HIGH must-fixes done.
All HIGH + the worthwhile MEDIUM/LOW fixed (depth-spend):
1. **Label leaks (HIGH)** — attack/benign were perfectly separable on `process.signed` + `process.path`
   (attack: signed=false, `/tmp/<family>.bin`; benign: signed=true, `/usr/*`), and the family leaked into a
   consumed C1 field. FIX: attacker process pool overlaps benign tooling, includes SIGNED LOLBins; family
   removed from process.path; benign signing varies (7zip/video unsigned). Now neither field separates;
   only entropy/format/canary/op-frequency fusion can. (simulator.ts ATTACKER_PROFILES; benign.ts BENIGN_PROCESS_SIGNED)
2. **Cherry-picked modes evidence (HIGH)** — FULL was fed low-entropy txt, others high-entropy binary, manufacturing
   a fake entropy contrast. FIX: every mode now runs over the SAME fixed corpus (txt/docx/png/jpg); modes.json
   reports a per-(mode,type) matrix with derived "which signal fires" columns. Honest result: FULL-on-compressed
   has ~0 entropy delta too (format catches it); intermittent-on-txt IS entropy-detectable.
3. **Over-broad intermittent claim (HIGH)** — "format catches intermittent 10/10" only holds for CRC types;
   marker-only jpg evades (format_broken_fraction 0.4). FIX: matrix flags jpg as the known gap explicitly
   (caught_at_single_file=false), defended at host level by op-frequency + mixed types.
MEDIUMs/LOWs fixed: symlink-safe seeding (realpath root + `wx` exclusive-create); video-encode entropy/format
now MEASURED (format_valid=null for unvalidated mp4, not stamped); metrics renamed destructiveFalsePositiveRate
+ added benignMisclassificationRate + coverageInsufficient (MIN_BENIGN_FOR_RATE=200) + allowlistSuppressions;
dropped restic from allow-list; distinct ORIGINAL types; self-correcting header_changed (byte-compare);
single stable pid; detection latency over detected-only. Added GroundTruthRegistry (blindness boundary:
Phase-2 detector receives ONLY {scenario_id, events}; truth held separately). 68 tests, tsc+biome clean.
