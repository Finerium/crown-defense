# RULE: Verification integrity (you cannot grade your own work)

- **Oracles are not worker-writable.** The safe simulator (`packages/simulator/**`), the benign-workload
  suite and fleet/metrics infra (`packages/test-infra/**`), all `*.test.ts`/`*.spec.ts` and `tests/` dirs,
  evidence under `reports/**` and `*.manifest.json`, audit fixtures, and `.crown/{progress,feature-list}.json`
  are TEST ORACLES + EVIDENCE. Worker subagents (running in worktrees) are hook-DENIED from writing them.
  If you are a worker and need a test changed, say so in your return; do not attempt to write it.
- **The author never signs off its own code.** A fresh-context reviewer grades against the acceptance
  criteria. Single-pass review is acceptable only on leaf modules with no contract surface and no security
  exposure; everything contract-bearing, security-sensitive, or foundational gets adversarial review.
- **Evidence before assertions.** Tests derive from the locked acceptance criteria (`.crown/feature-list.json`).
  Do not weaken, skip, or game a test to make a gate pass. A skeptic reviewer checks tests actually test the spec.
- **Grounded claims (verbatim):** before reporting progress, audit each claim against a tool result from
  this session; if something is not yet verified, say so. No unearned green checkmarks.
- Coverage targets: ≥80% lines overall, 100% on contract-bearing + critical paths (detection/containment/audit/dial).
