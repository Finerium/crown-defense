# RULE: Security-sensitive code (agent, control plane, audit chain, dial)

This code is the highest-value attack target in the bank. Adversarial review is mandatory here.

- **Fail-safe is law.** On control-plane loss or LLM failure: maintain existing containment, initiate NO
  new destructive action, degrade effective autonomy toward MONITOR. Deny-by-default everywhere.
- **Dual control.** Destructive actions in HUMAN_GATED require a second, distinct approver. A single
  approver (actor == approver) MUST be rejected. Write the negative test, not just the happy path.
- **Audit precedes action.** Bind an `ActionRecord` (C4) BEFORE issuing any destructive `AgentCommand` (C6).
- **mTLS only.** Agent↔control-plane is mutually authenticated + encrypted; reject unauthenticated/bad-cert peers.
- **Secrets.** Never read, print, log, or commit `.env` or signing keys. No secrets/PII in logs or `ErrorEnvelope`
  messages. Read config from env at runtime only. `.env` is gitignored and hook-protected.
- **Input validation.** Schema-validate all external inputs at the boundary; assume hostile telemetry.
- **No destructive bash.** No `rm -rf` on broad targets, no force-push to main, no history rewrites,
  no piping remote scripts to a shell. The safety hook backstops this; do not try to evade it.
