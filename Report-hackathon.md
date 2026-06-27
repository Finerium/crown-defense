# Crown Defense — Hackathon Submission Report

**Bank-grade autonomous ransomware defense.** Multi-signal mass-encryption detection → dial-gated host
containment → self-hosted-LLM incident analysis → immutable, hash-chained audit.

> **Thesis:** detection speed is the *demo*; **not-acting-wrongly, provability, and fail-safety are the
> product.** Every destructive action is dial-gated, audit-bound *before* it is issued, and reversible.

---

## Live demo & source

| | |
|---|---|
| **Live dashboard** | **https://crown-defense.vercel.app** |
| **Repository** | **https://github.com/Finerium/crown-defense** (public, Apache-2.0) |
| **Live LLM** | DeepSeek (`deepseek-v4-pro`) called **server-side** from a Vercel serverless function; API key never reaches the client |
| **Auto-deploy** | git-connected to `main` (production branch).¹ |

> ¹ The repo is git-linked to the Vercel project, but this **Hobby** Vercel team enforces
> `COMMIT_AUTHOR_REQUIRED` — it only auto-deploys commits whose Git author is a Vercel team member. The
> build commits are authored by the **"Crown Defense Build"** identity, so unattended push-deploys are
> blocked until either (a) commits are authored with an email tied to the Vercel account, or (b) that
> protection is relaxed. The live site above is deployed via the Vercel CLI (authenticated as the team owner),
> which is how every deployment in this submission was published.

The dashboard is **DEMO MODE**: a static frontend + serverless functions only. It runs on **synthetic data
from the safe simulator — never real malware**, and is clearly labelled as a simulation in-product. The
detection engine, containment agent, control plane, and dual Postgres stores run on a host, **not** on Vercel
— only the dashboard UI and one LLM serverless route are deployed.

### Run the demo (≈30 seconds)
1. Open **https://crown-defense.vercel.app** — the **Overview** loads: live KPIs, threat-activity chart, the
   autonomous action feed, and the 4-position **Autonomy dial** (MONITOR_ONLY → ALERT_RECOMMEND →
   HUMAN_GATED → FULL_AUTO).
2. Open the **Incident** tab — the blast-radius map (compromised / contained / scanning / safe hosts with
   lateral-movement edges), the fused detection signals, and the incident timeline (note *"Audit record bound
   before the command"*).
3. Click **Generate incident report** — a Vercel serverless function calls **DeepSeek live**, runs the
   generated plan through the **faithfulness gate** (every step must trace to a retrieved IR-playbook
   passage), and renders a **playbook-cited recovery plan** with a faithfulness score. Unfaithful output is
   routed to a human instead of shown.
4. Toggle **EN / ID** (top-right) — the entire UI re-renders in Indonesian; toggle the theme; explore
   **Fleet & Hosts** (paginated, bounded), **System** (effective-autonomy / fail-safe state), and
   **Approvals** (HUMAN_GATED dual-control queue).

> Verified live with browser automation on 2026-06-28: the URL loads, the scenario plays end-to-end, and the
> DeepSeek-backed report renders with `live: true, model: deepseek-v4-pro, faithfulness {score: 1, passed:
> true}`, 7 playbook-cited recovery steps (incl. OJK / UU PDP regulatory notification for the Indonesian
> banking context).

---

## What is built and verified (Gates 0–5 + closed loop)

A **TypeScript-strict pnpm monorepo** (Node 25 ESM). Shared **frozen Zod contracts** (`@crown/contracts`,
C1–C10) are the anti-divergence spine — every component builds against the exact same shapes.

| Gate | Scope | Status | Evidence |
|---|---|---|---|
| 0 | Foundation: contracts, hash-chained WORM audit substrate, harness, architecture (ADRs) | ✅ passed | `packages/{contracts,audit}`, `docs/` |
| 1 | Safe test infrastructure / detection oracle (24-family battery, 5 evasion modes; benign FP suite) | ✅ passed | `reports/manifests/gate-1.manifest.json` |
| 2 | Detection core: multi-signal fusion (discriminating + context), ≥2-corroboration-or-canary-fast-path, fail-closed | ✅ passed (documented residuals) | `reports/manifests/gate-2.manifest.json` |
| 3 | Containment: dial-gating, **audit-precedes-action**, dual-control, real **mTLS** control plane, anti-tamper | ✅ passed | `reports/manifests/gate-3.manifest.json` |
| 4 | LLM orchestration: model-agnostic abstraction, RAG over IR playbook, **faithfulness gate**, C7-only output | ✅ passed | `reports/manifests/gate-4.manifest.json` |
| 5 | Command Dashboard (Next.js): 5 surfaces, live DeepSeek report, demo mode, **a11y + i18n** | ✅ passed | `reports/manifests/gate-5.manifest.json` |
| 6 | **Closed loop** end-to-end + **live Vercel demo** | ✅ checkpoint reached | `reports/manifests/gate-6.manifest.json` |

**Test suite:** 134 tests across 16 files pass; `tsc -b` clean. Includes a **live DeepSeek** integration
test and the **closed-loop** end-to-end test wiring the five real packages
(`packages/test-infra/src/closed-loop.test.ts`).

### The closed loop, proven through real code
A simulated attack flows through every stage with the invariants intact — verified by a fresh-context
adversarial reviewer as a genuine end-to-end proof, not a hollow/mocked test:

```
safe simulator (C1 telemetry)
  → detection engine        → MASS_ENCRYPTION verdict (≥2 corroborating signals OR canary fast-path)
  → containment (dial-gated) → AUDIT RECORD APPENDED *BEFORE* the AgentCommand is issued
  → agent                    → host network-isolated
  → LLM orchestrator         → IncidentReport + BlastRadiusMap + RecoveryPlan (advisory; never an action)
```
The same test asserts **fail-safe**: with the control plane unreachable, **no new destructive command is
issued** — the loop degrades toward monitoring and maintains existing containment.

### Non-negotiable invariants demonstrated
- **Fail-safe / deny-by-default** — LLM or control-plane loss ⇒ degrade toward MONITOR, hold existing
  containment, **never initiate a new destructive action**.
- **Autonomy dial inside containment** — 4 positions; destructive actions classified AUTO / ASK_TO_ACT /
  NEVER_AUTO; HUMAN_GATED destructive requires a **second, distinct approver** (single-approver rejected),
  time-boxed with one-click revert.
- **Audit immutability** — every autonomous action + approval is an append-only, hash-chained, tamper-evident
  record; the audit binding **precedes** the command (C6 / AC-ACT-02).
- **Detection robustness** — multi-signal fusion; a destructive verdict needs ≥2 corroborating signals
  (incl. a discriminating one) **unless** the canary fast-path fired. Format-validation counters intermittent
  encryption (entropy alone is evadable).
- **Sovereignty** — production LLM is self-hosted on-prem behind a model-agnostic abstraction (swap = config
  change, ADR-002); cloud DeepSeek is **dev/test/demo only**; security telemetry never egresses in production.
- **Bounded resource** — lists paginated and bounded; memory bounded under a ≥1,000-endpoint fleet.

---

## The safety boundary (by design, not omission)
Crown Defense **never downloads, handles, builds, stores, or executes real or live malware.** Detection is
exercised exclusively against a **SAFE simulator** — benign, reversible, key-retaining, single-directory,
non-propagating, no network — that emits ground-truth telemetry. The air-gapped detonation procedure for real
samples exists **only as documentation** (`docs/runbooks/air-gapped-detonation-runbook.md`), never executed.

---

## Deliberately *not* built (the Gate-6 stop)
This is a hackathon checkpoint, stopped on purpose at **Gate 6**. The **bank-grade Phases 7–15** are a later
relaunch and are **intentionally absent** — claiming them as done would violate the project's own provability
rule. Not built yet:
- Fleet-scale hardening & statistical FP validation at ≥1,000 endpoints (Phase 11).
- Production agent backends (eBPF / Windows minifilter; driver signing is human-gated), kernel anti-tamper.
- Self-hosted LLM serving (SGLang / vLLM) on-prem deployment; signed staged updates.
- SIEM / AD / EDR integration adapters (Phase 15), full DR, and the remaining compliance surface.

The feature list (`.crown/feature-list.json`) tracks every acceptance criterion; criteria for unbuilt phases
remain `passes: false` by design.

---

## Honest residuals (Gate 2, documented)
- Ciphertext vs. **unknown magic-less compression** (brotli / raw-deflate) is byte-indistinguishable — an
  irreducible domain limit, mitigated by the signed allow-list + fail-safe, never by guessing.
- Intermittent encryption of shallow-validated recognized types (jpg / gif / bmp / mp4) is not reliably caught
  at the single-file level; defended at the **host level** by op-frequency + mixed-file-type corroboration.
- The benign FP corpus is representative workload *types* + variants (320 scenarios, 0 destructive false
  positives), not 320 independent statistical trials — fleet-scale statistical validation is Phase 11.

---

## How the work was graded
Fresh-context reviewers grade against the locked acceptance criteria; the author never signs off its own code.
Gates 1, 2, and 3 each went through **multiple adversarial review cycles that caught real wrongful-isolation
and authorization bugs** before passing (see `.crown/notes.md`). Evidence manifests live under
`reports/manifests/`.
