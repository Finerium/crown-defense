# Blueprint: TALOS, Autonomous Ransomware Defense (Closed-Loop AI Agent)

## 0. Meta

**One-line:** A single-repository, bank-grade autonomous ransomware defense system that detects mass-encryption in seconds via multi-signal fusion, isolates the infected host under a configurable autonomy dial, and uses a self-hosted open-weight LLM to generate an incident report, blast-radius map, and prioritized recovery plan, built to win a university hackathon and to be offered to Bank BJB as a production deployment under OJK supervision.

**Project name:** The product is named **Crown Defense** (`PRODUCT_NAME = "Crown Defense"`). `talos` remains only the internal build codename used in these planning-artifact filenames (blueprint-talos.md and siblings); it is never a user-facing string. The Orchestrator MUST treat the product display name as a single configurable constant (one source, `PRODUCT_NAME`, value "Crown Defense") so any future rename is a one-line change, never a find-and-replace across the codebase. Do not hardcode the name in user-facing strings; read the constant. (Note: "Crown" also names the build methodology that produced this blueprint; inside the codebase and the product, "Crown Defense" refers only to this ransomware-defense product, and the methodology is not referenced in the build.)

**Status / version:** Blueprint v1.0, authored by Crown (Mode 1, Brainstorm). Single greenfield build, full bank-grade architecture locked from line one, executed through a 15-phase gated spine (section 9). There is exactly one target maturity bar (production / bank-grade); "hackathon-ready" is a checkpoint reached partway through the same spine, NOT a separate build target and NOT a separate document. There is no second mode, no second repository, and no documentation that distinguishes a "hackathon version" from a "bank version." The only thing that differs between a hackathon demo and a bank pilot is one runtime configuration value (the autonomy dial position), never the code or the docs. This is deliberate: a per-target documentation split is the exact source of agent goal-drift this single-target design exists to prevent.

**Which planning layers this document fully covers vs leaves to the Orchestrator.** This blueprint fully locks: the problem and scope (PRD layer), the functional and non-functional requirements as machine-checkable acceptance criteria (SRS layer), the component shape, the frozen interface contracts, and the architecture decisions as ADRs (SDD layer), the data sources, the compliance constraints (OJK / UU PDP), the self-protection threat model, and the build-and-test strategy. The Orchestrator derives at planning time, within these locked bounds: the concrete file and module layout, internal implementation patterns, library micro-choices (subject to the dependency-hygiene gate), the concrete implementation of each scalability and resilience invariant, and the as-built documentation (README, API docs, runbook, architecture docs). The Orchestrator MUST NOT relitigate anything in sections 2, 5 (ADRs), 6 (frozen contracts), or 8 (acceptance criteria); if it believes one is wrong, it surfaces the conflict in `Report.md` and reconciles against the locked invariants and stated intent rather than silently changing it (paranoia row F12).

**What this blueprint is, in classical-document terms.** It is a superset that folds a PRD (sections 1-3: why, for whom, what), an SRS (sections 4, 8: functional and non-functional requirements as verifiable criteria), an SDD / architecture document (sections 5-6: components, decisions, frozen contracts), a compliance and security specification (sections 2, 7, and the OJK/PDP and threat-model subsections), and a test plan (sections 8-9) into one artifact optimized for autonomous execution rather than human persuasion. Where a human document narrates and argues, this one decides and contracts.

**Reading order for the Orchestrator.** Read this entire document before any fan-out. The highest-leverage sections are 6 (frozen contracts, the anti-divergence spine) and 8 (acceptance criteria, the Definition of Done and the gate evidence). Section 9 is the execution order. Do not begin Phase 1 work until the Phase 0 foundation and the architecture handshake (Gate 0) are complete.

---

## 1. Vision and Problem

**The problem.** Modern ransomware encrypts faster than humans can respond. LockBit-class encryptors finish ~100,000 files in a median of ~5 minutes 50 seconds (fastest observed ~4 minutes 9 seconds); the median attacker dwell time before detection for ransomware incidents is ~5 days. Any defense that depends on a human reading a log, approving an action, then triggering isolation is structurally incapable of winning a race measured in minutes. The June 2024 PDNS (Pusat Data Nasional Sementara) incident in Indonesia is the concrete reference case: a Brain Cipher (LockBit 3.0 variant) attack disabled Windows Defender, destroyed the recovery mechanisms (Volume Shadow Copy, Hyper-V files, Veeam backups) before mass-encrypting, took down 282 public services across central and regional government, and was nearly impossible to recover from because only ~2% of data had backups.

**Who has it.** Operators of critical information infrastructure, initially Bank BJB (a regional bank under OJK supervision), generalizable to any Security Operations Center (SOC) defending Windows/Linux endpoint fleets where mass-encryption is an existential risk and a single false isolation of a production host during business hours is itself a serious incident.

**What they do today instead.** Commercial EDR (CrowdStrike, SentinelOne, Microsoft Defender) plus human-gated SOC response, or, as PDNS showed, inadequate backup discipline and no autonomous early-stop. Existing tools detect and can isolate, but the closed loop from canary-based detection through automatic isolation to an LLM-generated, prioritized recovery plan is not a standard product.

**Why now.** Open-weight LLMs (DeepSeek-class, MIT-licensed) are now strong enough to run on-premise on a single GPU and generate structured incident analysis, which makes a data-sovereign autonomous defense feasible for a regulated bank that legally cannot send security telemetry to a third-party cloud.

**Core value (the one thing that must be true).** TALOS must win the first decisive seconds, detect mass-encryption and contain the host before the encryptor finishes, while being trustworthy enough for a bank to deploy: it must almost never act wrongly, must prove every autonomous action to an auditor, and must fail safe (degrade to passive monitoring) rather than fail dangerous (isolate hosts wrongly) when any part of it breaks. Detection speed is the demo; not-acting-wrongly and provability are the product.

---

## 2. Scope, Success, and Constraints

### 2.1 In scope

- A distributed **endpoint agent** (Linux and Windows) that monitors filesystem activity and manages canary files.
- A **detection engine** performing multi-signal fusion: canary tampering (high-confidence fast path), Shannon-entropy delta analysis, file-operation frequency/behavioral analysis, file-type/header-change detection, and a file-format-validation module that detects structural corruption independent of I/O behavior (the counter to intermittent encryption).
- A **containment module** performing host network isolation, malicious-process termination, and file-share lockdown, gated by the autonomy dial.
- A **configurable autonomy dial** with four positions (monitor-only, alert+recommend, human-gated action, full-auto) as a runtime configuration value, with an action-classification matrix (Auto / Ask-to-Act / Never-Auto per action type) and dual-control approval for destructive actions.
- A **self-hosted open-weight LLM orchestration layer** (on-premise) generating a structured incident report, a blast-radius map, and a prioritized recovery plan, grounded by RAG over an internal incident-response playbook with a faithfulness gate.
- An **immutable audit subsystem**: append-only, hash-chained, tamper-evident, attributable, exportable logging of every autonomous action and every human approval.
- **Self-protection**: anti-tamper for the agent, mutual-TLS authenticated and encrypted agent-to-control-plane communication, a hardened control plane, and a deny-by-default kill-switch.
- A **Command Dashboard** (web) for real-time monitoring, incident detail, fleet/host view, and system health, with a dark-mode-primary plus light-mode design (visual truth from the Claude Design handoff bundle).
- A **safe test infrastructure**: a benign, reversible, parametric ransomware simulator (including intermittent-encryption modes); a benign-but-suspicious workload suite for false-positive measurement; a synthetic fleet-scale telemetry simulator; a failure-injection harness; and a metrics collector and report generator.
- **Integration adapters** against generic contracts for SIEM, Active Directory, and EDR, validated against mocks.
- A **human-operated air-gapped detonation runbook** for testing against real ransomware families (written by the Orchestrator, executed manually by Ghaisan's team, see 2.3).

### 2.2 Explicitly OUT of scope (hard boundary)

- **The Orchestrator NEVER downloads, handles, builds, stores, or executes real/live malware.** Real-sample detonation is a human-operated, out-of-band activity in an air-gapped lab. The Orchestrator builds the safe simulator and writes the detonation SOP/runbook only. This is a non-negotiable safety boundary, not a capability gap. Any task that would have an autonomous agent touch live malware is rejected and surfaced.
- **No real-world wiring to Bank BJB's specific production systems** (their actual SIEM instance, their AD forest, their EDR tenant, their network) in this build. Integration is built and verified against generic contracts and mocks. Real BJB integration and production deployment are human-gated milestones contingent on a BJB engagement that has not yet happened.
- **No production deployment to BJB infrastructure** in this build. The build deploys to a demo/staging target the team controls. Production deployment to BJB is human-gated (their infrastructure, their credentials, their pilot).
- **No claim of full autonomy as the shipped default.** Full-auto is a dial position that exists and is verified, but the shipped and pilot default is monitor-only. Autonomy is earned per-deployment, not shipped on.
- **Not a replacement for a complete commercial EDR.** TALOS is a focused closed-loop ransomware defense, not a general endpoint protection platform. Scope is stated explicitly so claims stay proportional.
- **No fine-tuning of the LLM** in this build (RAG over the playbook is the grounding mechanism; fine-tuning is a future-work item).
- **No mobile or IoT/OT endpoint agent** (Windows and Linux servers/workstations only; OT/IoT is future work).

### 2.3 The build-vs-human boundary (safety-critical, restate in the Orchestrator prompt)

Two activities are permanently human-operated and the Orchestrator only produces documentation for them:

1. **Real-ransomware detonation testing.** The Orchestrator writes the air-gapped lab runbook (network design, snapshot-revert procedure, sample-handling SOP, chain-of-custody, the exact manual test steps). A human (Ghaisan's team) procures samples (theZoo, MalwareBazaar/abuse.ch, VX-Underground, MITRE), runs detonation manually in the isolated lab, reverts snapshots, and records results. The Orchestrator never touches a sample.
2. **Production deployment to BJB.** Human-gated on a real engagement.

Everything else, including building and running the *safe* simulator against the detection engine, is autonomous and in scope.

### 2.4 Success criteria (measurable)

- **Detection:** detects mass-encryption across a test battery of ≥20 ransomware behaviors/families and ≥4 evasion modes (full, intermittent every-N-bytes, header-only, low-and-slow) generated by the safe simulator. (Academic ceilings are ~99% on 14-43 families; this is a ceiling, not a guarantee, the criterion is measured behavior against the evasion battery, not a fixed percentage claim.)
- **False positives:** false-positive rate ≤ 0.5% against the benign-but-suspicious workload suite (backup agents, 7-Zip/compression, video encoding, database maintenance, legitimate full-disk encryption). This is the single most important bank-facing number.
- **Containment speed:** containment p95 < 10 seconds from a high-confidence verdict in full-auto mode; isolation persists if the control-plane link drops.
- **Files lost before containment:** ≤ 10 against the simulator at representative encryption speeds (target lower; CryptoDrop/UNVEIL median benchmark).
- **Fail-safe:** survives the full failure-injection suite (LLM down, control-plane partition, agent crash, fanotify queue full, simulated memory pressure) with zero rogue destructive actions.
- **Auditability:** every autonomous action and human approval is logged immutably, attributably, tamper-evidently, and is exportable; the last 24 hours of actions can be reconstructed from durable storage; tamper attempts are detectable.
- **Scale:** detection-engine throughput, latency, and bounded memory hold at a synthetic fleet of ≥1,000 emulated endpoints.
- **Sovereignty:** the LLM runs on-premise; security telemetry never leaves the deployment boundary.
- **Hackathon checkpoint (not a separate target):** by end of Phase 6, the closed loop (detect → contain → LLM report → dashboard) runs end-to-end against the safe simulator and is demonstrable; this is the state that satisfies the competition.

### 2.5 Hard constraints that bound the whole build

- **Data sovereignty / residency (OJK).** The production LLM and control plane must be deployable on-premise within Indonesia; security telemetry must not egress to any third-party cloud. Architecture is model-agnostic and self-hosted-capable. Cloud LLM APIs (Opus/Sonnet/DeepSeek-hosted) are permitted ONLY for development and testing of TALOS itself, never as the production answer for a bank deployment. (See ADR-002, ADR-008.)
- **Fail-safe invariant.** On failure of the reasoning layer (LLM) or loss of the control plane, the system degrades toward monitor/alert and maintains existing containment, but NEVER initiates new destructive actions. This is an architecture invariant present from the first line of code, locked as acceptance criteria, not a late patch. (See ADR-005.)
- **Bounded resource invariant.** No component ever performs an unbounded load or query. Telemetry processing, fleet state, audit queries, and dashboard data are bounded/paginated/streamed with explicit limits. Memory is bounded under a large fleet fixture. (Locked from Phase 1; audited at Gate 11. This prevents the MedWatch failure class.)
- **Verification integrity.** The safe simulator, the benign workload suite, the test files, the evidence manifests, the audit-log verification fixtures, and the progress file are test oracles and evidence; worker/builder subagents are denied write access to them (hook-enforced). The agent that writes detection code cannot author the test that grades it.
- **Autonomy default.** Shipped and pilot default is monitor-only. Full-auto requires explicit configuration and is never the default.
- **Audit immutability.** Audit records are append-only and tamper-evident from the first record written; the audit substrate exists before the first autonomous action is possible.
- **Performance budgets (locked numbers, see section 8 for the criteria):** containment p95 < 10s; detection-to-alert latency target < 2s after the triggering signal; FP ≤ 0.5%; agent endpoint CPU overhead target ≤ ~3% steady-state (eBPF-class); bounded memory under ≥1,000-endpoint fleet fixture.
- **No AI-tooling traces in any academic/competition deliverable** produced from this repo (the proposal, any submitted artifact), but the codebase itself is a normal repo. (The proposal pipeline already handles this separately; for the code repo, commit the `.claude/` foundation normally unless Ghaisan says otherwise.)
- **Cost/runtime reality.** This is a large multi-day autonomous build; the binding constraint is the weekly rate limit, mitigated by commit-per-gate durability and resume-via-recon. All agents run on the newest model within plan inclusion at the highest-autonomy effort (currently Opus 4.8, because Fable 5 is suspended; see ADR-009).

---

## 3. Product and Features

Features are stated as requirements tied to the core value, prioritized. "Must-exist" features are required for the closed loop and the bank-grade bar; "later" features are explicitly deferred.

### 3.1 Must-exist features

1. **Multi-signal mass-encryption detection.** The system detects mass-encryption using fused signals and does not act destructively on a single signal. Canary tampering is a high-confidence fast path; at least two corroborating signals (entropy delta, op-frequency anomaly, type/header change, format-validation failure) are required before any destructive verdict. Rationale: entropy alone has unacceptable false positives and is defeated by intermittent encryption.
2. **File-format-validation detection module.** Independent of I/O behavior, the system inspects whether files have become structurally invalid/corrupted, catching intermittent and low-entropy encryption that statistical detectors miss. Rationale: LockFile-class evasion (encrypt every other 16 bytes) keeps files statistically normal; behavior-only detection is insufficient.
3. **Configurable autonomy dial.** A runtime setting with four positions: monitor-only (observe and log, take no action), alert+recommend (observe, log, alert, recommend an action), human-gated action (propose a destructive action and execute only on dual-control approval), full-auto (execute per policy within the action-classification matrix). Default monitor-only.
4. **Action-classification matrix + dual control.** Each action type is classified Auto / Ask-to-Act / Never-Auto. Destructive actions (host isolation, process kill, share lockdown) require dual-control approval in human-gated mode and are time-boxed with auto-rollback and one-click revert.
5. **Host containment.** Network isolation (host can still reach the control plane), malicious-process termination, file-share lockdown; executed only as permitted by the dial position and the action matrix; isolation persists across a control-plane link loss.
6. **Self-hosted LLM incident analysis.** On-premise open-weight LLM generates a structured incident report, a blast-radius map (compromised/contained/safe hosts and lateral-movement edges), and a prioritized recovery plan, grounded by RAG over an internal IR playbook, with a faithfulness gate that blocks or routes-to-human any output not traceable to retrieved context.
7. **Immutable audit subsystem.** Append-only, hash-chained, tamper-evident, attributable (agent identity or human approver), exportable logging of every autonomous action and approval; 24-hour reconstruction from durable storage.
8. **Self-protection.** Anti-tamper agent (protected service/files), mutual-TLS authenticated+encrypted agent↔control-plane channel, hardened control plane, deny-by-default kill-switch (no new destructive action when control plane unreachable or LLM offline).
9. **Graceful degradation + 24/7 operation.** Watchdog, auto-recovery, health checks, bounded memory for long-running agents; deterministic detection+containment core keeps working when the LLM is down (report generation queues).
10. **Command Dashboard.** Real-time fleet status, incident timeline, blast-radius visualization, affected-host table, autonomous-action feed, autonomy-mode control, and an approval queue for human-gated actions. Dark-mode primary with light-mode toggle.
11. **Safe test infrastructure** (in-product tooling, not shipped to the bank): parametric safe simulator with intermittent modes, benign-workload suite, synthetic fleet simulator, failure-injection harness, metrics collector, report generator.
12. **Integration adapters** (generic-contract + mocks): SIEM (syslog/CEF + REST/webhook), Active Directory (identity context), EDR (isolate-host action API). Real instance wiring is out of scope/human-gated.

### 3.2 Later (explicitly deferred, do not build now)

- LLM fine-tuning on a national incident-response corpus.
- OT/IoT and mobile endpoint agents.
- Zero-Trust microsegmentation for multi-tenant data-center topology.
- Multi-language UI beyond the locale-ready baseline.
- Federated multi-bank threat intelligence sharing.

---

## 4. UX and Interaction (functional/interaction truth; visual truth from the design bundle)

This section states what the interface must DO. Visual and styling truth comes from the Claude Design handoff bundle saved in the project folder. Reconciliation rule: **this blueprint owns functional and architectural truth; the design bundle owns visual and interaction truth.** The Orchestrator maps each design screen to a feature here, uses the design tokens as the styling source of truth, implements behavior from this blueprint, and flags any conflict (a designed field/state/endpoint the contracts do not define) rather than inventing a contract or dropping a designed element.

**Surfaces and required behaviors:**

- **Command Overview.** Must show, in real time: count of active threats, hosts protected, auto-containments in the current period, and mean-time-to-respond; a live threat-activity area; a feed of autonomous actions the system is taking; and the current autonomy-dial position with a control to change it (change is itself a dual-control, audited action in human-gated/full-auto contexts). Must answer "is everything okay?" within ~2 seconds of view.
- **Incident Detail.** Must show: an incident timeline grouped by attack phase (severity by color + thickness + length, never color alone); a blast-radius network graph (nodes = hosts; edges = lateral-movement paths; compromised = red, contained = amber, safe = green; every status carries an icon + label, not color alone); a searchable, filterable affected-host table; and an autonomous-response-plan panel listing executed and proposed steps, each with an approve/override control where human-gated.
- **Fleet and Hosts.** Must show a dense, searchable, filterable host table with per-host status indicators and a detail drawer; bounded/paginated (never load the full fleet at once).
- **System Health.** Must show: detection-engine health, agent coverage across the fleet, LLM/serving health, control-plane health, integration (SIEM/AD/EDR) connection status, and the autonomy-decision audit feed.
- **Approval queue (human-gated mode).** Pending destructive actions with full justification (signals, confidence, autonomy mode, blast-radius), requiring a second approver for execution, with a visible time-box and one-click revert for executed actions.

**Cross-cutting interaction requirements:** accessibility WCAG 2.x AA on key flows (contrast, keyboard navigation, labels); severity/status never communicated by color alone (always icon + label); empty, loading, and error states for every data view; no destructive UI control executes without confirmation and (where applicable) a second approver.

---

## 5. Architecture and Technical Decisions

### 5.1 System shape (components and boundaries)

Five core runtime components forming a closed loop, plus governance and supporting subsystems. Component boundaries are fixed; internals are Orchestrator latitude.

1. **Endpoint Agent** (per host, Linux + Windows). Monitors filesystem events via OS-level mechanisms; manages canary files; emits telemetry to the Detection Engine over the authenticated channel; executes containment actions locally on command; self-protects. Lightweight, bounded resource use.
2. **Detection Engine** (central or near-edge). Consumes agent telemetry; runs multi-signal fusion (canary, entropy delta, op-frequency, type/header, format validation); produces a verdict with a confidence score and the contributing signals. Stateless per-decision where possible; bounded memory.
3. **Containment Module.** Receives a verdict; consults the autonomy dial position and the action-classification matrix; for permitted actions, commands the agent to isolate/kill/lock; for human-gated actions, enqueues for dual-control approval; enforces time-boxed actions with rollback. Deny-by-default on control-plane loss.
4. **LLM Orchestration Layer** (on-premise). On a contained incident, assembles incident context, runs RAG over the IR playbook, generates the structured report + blast-radius map + prioritized recovery plan via the self-hosted model, applies the faithfulness gate. Advisory only; never executes destructive actions.
5. **Command Dashboard** (web). Presents real-time state and the approval queue; the human control surface for the dial.

Supporting/governance subsystems:

6. **Autonomy & Policy subsystem.** Owns the dial state machine, the action-classification matrix, the dual-control approval workflow, and the time-box/rollback mechanism.
7. **Audit subsystem.** Append-only, hash-chained, tamper-evident, exportable store of every action and approval; queryable for 24h reconstruction and OJK-style export.
8. **Control Plane.** Authenticated agent registration, certificate/identity management, command distribution, health; hardened, locked-down, deny-by-default.
9. **Integration Adapters.** SIEM, AD, EDR adapters against generic contracts.
10. **Test Infrastructure** (build-time, not shipped): safe simulator, benign-workload suite, fleet simulator, failure-injection harness, metrics+report tooling.

The closed loop: agent telemetry → detection verdict → (dial-gated) containment → LLM analysis → dashboard, with the LLM output also feeding recovery guidance back to operators and the audit subsystem recording every action.

### 5.2 Architecture Decision Records (locked; do not relitigate)

**ADR-001, Multi-signal fusion with canary fast-path, not single-signal detection.**
Context: entropy-only detection has unacceptable false positives and is defeated by intermittent encryption; canary files are the lowest-FP, highest-confidence signal but can be evaded by ransomware that skips decoys. Decision: fuse canary (fast-path, high confidence), entropy delta (read-vs-write at the same offset), file-operation frequency/behavior, file-type/header change, and file-format validation; require ≥2 corroborating signals before any destructive verdict; canary tamper may shortcut to high confidence but containment still respects the dial. Alternatives: entropy-only (rejected: FP + evasion), canary-only (rejected: evadable), ML-only (rejected: opacity for an auditor, training-data dependence). Consequences: more components, but defensible detection and a defensible false-positive story for the bank; the format-validation module specifically counters intermittent encryption.

**ADR-002, Self-hosted, on-premise, open-weight LLM; model-agnostic; cloud only for dev/test.**
Context: OJK data-residency rules and the product's sovereignty value proposition forbid sending bank security telemetry to a third-party cloud. Decision: the production LLM is a self-hosted open-weight model (DeepSeek-class or smaller, MIT-licensed), served on-premise; the architecture is model-agnostic behind a serving abstraction; cloud LLM APIs are permitted ONLY for TALOS development/testing, never as the bank production answer. Alternatives: cloud frontier API (rejected: residency/sovereignty), single hardcoded model (rejected: lock-in). Consequences: an on-prem serving stack and GPU dependency for production, but legal deployability and a genuine sovereignty claim; a 20-30B model on a single GPU is the pragmatic default, with a large frontier model as a budgeted option if the bank mandates it.

**ADR-003, Autonomy as a runtime dial with an action-classification matrix, default monitor-only.**
Context: banks reject full autonomy first; a single false isolation in production is a serious incident; full-auto is the hackathon hero but the bank blocker. Decision: a four-position runtime dial (monitor-only → alert+recommend → human-gated → full-auto), an action-classification matrix (Auto / Ask-to-Act / Never-Auto per action type), dual-control approval for destructive actions in human-gated mode, time-boxed actions with auto-rollback and one-click revert; default monitor-only. One codebase, one config value differentiates demo from pilot. Alternatives: full-auto only (rejected: bank-unsellable, dangerous), two separate builds (rejected: divergence, double-maintenance, agent goal-drift). Consequences: the dial is an architecture invariant threaded through containment from Phase 1, not a toggle bolted on; it is what makes a single-target build serve both goals.

**ADR-004, Immutable, hash-chained, exportable audit subsystem as a first-class component.**
Context: auditors (OJK, ISO 27001, PCI-DSS, SOC 2) require immutable, attributable, tamper-evident, reviewable, exportable logs; a tool taking autonomous destructive action is unsellable without them. Decision: an append-only, hash-chained (tamper-evident), WORM-capable audit store records every autonomous action and human approval with full attribution and context; supports 24h reconstruction and OJK-style export ("show every isolation last quarter with its justification"). The audit substrate exists before the first action is possible. Alternatives: plain application logs (rejected: mutable, non-attributable), end-of-project add-on (rejected: must be present from the first action). Consequences: audit is built in Phase 0/7, not deferred; it is a gate, not a feature.

**ADR-005, Fail-safe invariant: reasoning-layer or control-plane failure degrades to monitor, never escalates to destructive action.**
Context: a high-privilege tool that can isolate hosts must not, when broken, isolate them wrongly. Decision: if the LLM is down, the deterministic detection+containment core continues and report generation queues; if the control plane is unreachable, the agent maintains existing containment but initiates no new destructive action (deny-by-default); any reasoning-layer failure degrades the effective autonomy toward monitor/alert. Alternatives: continue full-auto on degraded inputs (rejected: dangerous), full stop on any failure (rejected: leaves hosts unprotected). Consequences: an invariant locked as acceptance criteria and verified by failure injection, present from line one.

**ADR-006, OS-level monitoring: eBPF (Linux) + minifilter (Windows), fanotify acceptable for a light Linux build.**
Context: need low-overhead, high-fidelity filesystem/syscall visibility with process/container context. Decision: eBPF for the Linux enforcement/telemetry path (syscall-argument granularity, container context, ~2-3% overhead class), minifilter driver on Windows (the ShieldFS/CryptoDrop mechanism, enables copy-on-write shadowing and MBR protection); fanotify acceptable for a lighter Linux build but always feeding a durable, tamper-evident sink (fanotify is a live stream, not a log). Alternatives: inotify-only (rejected: no process/container context), polling (rejected: too slow). Consequences: a kernel-adjacent agent with platform-specific monitoring backends behind a common telemetry contract.

**ADR-007, mutual-TLS, certificate-identity, anti-tamper agent and hardened control plane.**
Context: a tool that can kill processes and isolate hosts is the most valuable attack target in the bank; ransomware's first move is to disable security tooling (BYOVD). Decision: mutual-TLS with certificate-based identity for all agent↔control-plane traffic; hierarchical key management (identity keys deriving short-term session keys; non-exportable private keys); message authentication and non-repudiation; kernel-mode anti-tamper protecting the agent service/files; least-privilege service account; deny-by-default kill-switch; signed authenticated updates. Alternatives: shared-secret auth (rejected: weak), unprotected agent (rejected: trivially disabled). Consequences: a certificate-management surface and a self-protection threat model that is itself tested and red-teamed (Phase 12/13).

**ADR-008, RAG over the IR playbook with a faithfulness gate; no fine-tuning in this build.**
Context: LLM hallucination in a recovery plan is dangerous; the bank needs grounded, attributable guidance. Decision: constrain generation with RAG over an internal incident-response playbook; require attribution to retrieved passages; apply a post-generation faithfulness check (decompose into claims, verify each against retrieved context) that blocks or routes-to-human low-faithfulness output ("a safe refusal beats a fluent unsupported answer"); use structured/JSON-schema output for deterministic report formats. Fine-tuning is deferred. Alternatives: ungrounded generation (rejected: hallucination), fine-tune now (rejected: scope, data). Consequences: a retrieval store + a faithfulness-gate stage in the LLM layer; SGLang-class serving is favored for prefix-cache efficiency on the shared playbook context.

**ADR-009, Model and effort stance for the BUILD harness: newest-within-inclusion at highest autonomy; currently Opus 4.8.**
Context: the build is executed by Claude Code agents; the newest model (Fable 5) is suspended by an export-control directive as of June 12-13, 2026; TALOS is a cybersecurity codebase, which on Fable 5 would trip the `cyber` classifier and silently fall back to Opus 4.8 on nearly every request anyway. Decision: launch every agent (Orchestrator and workers) on the newest model within plan inclusion at the highest-autonomy effort; today that resolves to Opus 4.8 (`--model opus`, ultracode); keep a single config point to flip back to `--model fable` when the suspension lifts and a health check passes. This is a build-harness decision and is unrelated to ADR-002 (the LLM inside the product). Alternatives: wait for Fable (rejected: indefinite, and cyber-fallback makes it moot), hardcode a model (rejected: volatile). Consequences: the Orchestrator launch line and the model rule are stated as "newest within inclusion," with the current concrete value in the operator-setup block, refreshable.

### 5.3 Technology direction (Orchestrator decides specifics within these)

- **Endpoint monitoring backends:** eBPF (Linux), minifilter (Windows); common telemetry contract above them. Language/runtime for the agent is Orchestrator's call, subject to the low-overhead and anti-tamper requirements (a systems language for the agent core is likely warranted; the Orchestrator decides and justifies).
- **Detection engine:** Shannon-entropy computation, op-frequency/behavioral features, optional lightweight gradient-boosting/random-forest classifier (the ShieldFS reference), file-format validators per common type. Keep the ML component explainable (feature attributions available to the auditor).
- **LLM serving:** SGLang favored (RadixAttention prefix caching suits the shared-playbook RAG workload), vLLM acceptable; a 20-30B-class open-weight model on a single 48GB-class GPU as the default; serving behind a model-agnostic abstraction; structured JSON output.
- **Audit store:** an append-only, hash-chained log with WORM capability and export; the Orchestrator picks the concrete storage subject to the immutability/tamper-evidence/export criteria.
- **Dashboard:** a modern web stack; consumes the Claude Design handoff tokens; bounded/paginated data; real-time updates.
- **Test infra:** the safe simulator and harnesses; Atomic Red Team (T1486) patterns as a reference for the simulator's reversible test design; Locust/OpenTelemetry-style load generation for fleet emulation.

The Orchestrator MUST, at planning time (Gate 0), produce an implementation-architecture document choosing these specifics within the locked bounds, and a fresh-context reviewer MUST validate it against every frozen contract and invariant before any fan-out.

### 5.4 Additional architecture decisions (locked)

**ADR-010, Canary placement and management.** Context: canary files are the lowest-FP, highest-confidence signal but only fire if the ransomware touches them. Decision: the agent plants multiple canary files per protected host across a spread of locations (user document directories, network-share roots, high-value data directories), with names that sort early and late alphabetically (encryptors often enumerate in order) and realistic types and sizes so they are not trivially skippable; canary inventory and integrity are tracked by the agent and reported via C1; a touched canary is a fast-path high-confidence signal but containment still respects the dial. Alternatives: a single canary (rejected: easily skipped), no canary (rejected: loses the best signal). Consequences: a canary-management responsibility in the agent and a canary inventory in the operational data model (C10).

**ADR-011, Entropy sampling as a read-vs-write delta at the same offset.** Context: absolute entropy does not cleanly separate ciphertext from legitimately high-entropy files (compressed, encrypted, media). Decision: sample entropy of the content read and the content written at the same file-offset window and compute the delta (Redemption method), so a benign already-high-entropy file shows little delta while encryption shows a large rise; combine with the format-validation signal. Alternatives: absolute write entropy (rejected: false positives), no entropy (rejected: loses a signal). Consequences: the agent samples paired read/write windows (C1 carries entropy_read and entropy_write), not a single value.

**ADR-012, Control-plane topology: centralized service, agent-survivable, HA-capable.** Context: the control plane is the fleet kill-switch and a single point of both control and risk. Decision: a centralized control-plane service (registration, identity and certificate management, command distribution, health) deployed on-premise, designed for high availability so the bank can run it redundantly, with agents that survive control-plane unavailability per the fail-safe invariant (maintain existing containment, take no new destructive action, queue telemetry). Alternatives: fully peer-to-peer agents (rejected: coordination and audit complexity), a control plane that agents cannot survive losing (rejected: violates fail-safe). Consequences: agents hold enough local state to keep monitoring and honor existing containment without the control plane; the deployment topology accounts for HA.

**ADR-013, Separate the immutable audit store from the mutable operational store.** Context: audit records must be append-only and tamper-evident; operational state (current fleet status, open incidents, dial position) is mutable and queried constantly. Decision: two distinct stores, an append-only hash-chained audit store (WORM-capable, export-oriented) and a mutable operational store (current state, indexed for the dashboard), so the immutability guarantee on audit is not entangled with high-churn operational writes. Alternatives: one store for both (rejected: immutability and mutability conflict). Consequences: a clear data boundary; the audit store is write-restricted to the audit subsystem and the main-thread build process, the operational store serves the dashboard under bounded and paginated reads.

**ADR-014, Fleet-scale validation via synthetic telemetry, not physical machines.** Context: the product claims fleet-scale operation (the 1,284-host mockup) but the team has no thousand-machine lab. Decision: validate scale with a synthetic fleet simulator that emulates N endpoints by generating realistic C1 telemetry streams (benign baseline plus injected attack patterns) at configurable scale, driving the real detection engine and control plane, so throughput, latency, and bounded memory are measured against the real system under fleet load. Alternatives: a physical fleet (rejected: infeasible), no scale test (rejected: leaves the scale claim unverified). Consequences: the fleet simulator is part of the test infrastructure (Phases 1 and 11) and AC-PERF-02 is measured against it.

**ADR-015, Agent update mechanism: signed, staged, fail-safe.** Context: a fleet of high-privilege agents must be updatable without becoming an attack vector or bricking hosts. Decision: agent updates are cryptographically signed and verified by the agent before applying, rolled out in stages (a canary cohort before fleet-wide), and fail safe (a failed update rolls back and the prior agent keeps running; a bad update never disables protection silently). Alternatives: unsigned auto-update (rejected: attack vector), no update path (rejected: unmaintainable). Consequences: an update-verification responsibility in the agent and a staged-rollout responsibility in the control plane; this is part of the self-protection surface (Phase 12).

### 5.5 Deployment topology (on-premise reference architecture)

The production deployment is fully on-premise within the bank boundary (ADR-002, AC-COMP-01). The reference topology, which the deploy phase and the operator runbook target:

- **Control-plane node(s):** the centralized control-plane service, the operational store, and the immutable audit store, deployed inside the bank network, HA-capable (ADR-012, ADR-013). No external egress (AC-COMP-01).
- **Inference node:** the self-hosted LLM serving stack (SGLang or vLLM) and the model weights on a GPU host (a single 48GB-class GPU for the default 20 to 30B model; an 8-GPU node only if a frontier model is mandated, OQ-3). On-premise; the RAG playbook store sits here or adjacent. No external egress.
- **Endpoint agents:** distributed across protected Windows and Linux hosts, communicating with the control plane over mutual TLS (ADR-007), surviving control-plane loss (ADR-012).
- **Dashboard:** served inside the bank network to the SOC, reading the operational store under bounded queries.
- **Integration edge:** adapters to the bank SIEM, AD, and EDR (real wiring human-gated; built against mocks here, C8).
- **Network segmentation:** the control plane and inference node sit in a protected segment; agent-to-control-plane traffic is authenticated and encrypted; the kill-switch path is deny-by-default.

Two deployment profiles differ only by configuration, never by code: a **demo/staging profile** (the team-controlled target the build deploys to, dial set for demonstration) and a **bank-pilot profile** (monitor-only default, full on-prem, full audit). The build produces both from one artifact; production deployment to BJB infrastructure is human-gated (OQ-1).

---

<contracts>

## 6. Interface Contracts (FROZEN)

These are the anti-divergence spine. Every subagent builds against these exact shapes. They are frozen: the Orchestrator implements them as written and does not alter a field without surfacing a blueprint-conflict in `Report.md` and reconciling against intent. Shapes below are canonical field-level contracts; the Orchestrator chooses the concrete serialization (JSON over the wire is the default) but MUST preserve field names, types, semantics, and the enumerations. All timestamps are UTC ISO-8601 with millisecond precision. All IDs are stable and globally unique. Versioning: every contract message carries a `schema_version` string; consumers reject unknown major versions.

### 6.1 Contract C1, Endpoint Agent → Detection Engine (telemetry)

Purpose: the agent reports filesystem activity and canary state; the detection engine consumes only this.

```
TelemetryEvent {
  schema_version: string            // e.g. "1.0"
  event_id: string                  // unique per event
  agent_id: string                  // stable agent/host identity (cert subject)
  host_id: string                   // logical host id
  emitted_at: timestamp             // UTC ISO-8601 ms
  event_type: enum {                // the kind of observation
    FILE_WRITE, FILE_RENAME, FILE_CREATE, FILE_DELETE,
    CANARY_TOUCHED, FILE_TYPE_CHANGED, PROCESS_START, PROCESS_STOP,
    HEARTBEAT
  }
  process: {                        // attributed process, when known
    pid: integer | null
    path: string | null             // executable path
    user: string | null
    signed: boolean | null
  }
  file: {                           // present for file events
    path: string | null
    prev_type: string | null        // inferred type/extension before
    new_type: string | null         // inferred type/extension after
    size_bytes: integer | null
    entropy_read: number | null     // 0..8 bits, content read at offset window
    entropy_write: number | null    // 0..8 bits, content written at same window
    header_changed: boolean | null  // magic-bytes/header changed
    format_valid: boolean | null    // file still structurally valid for its type
  }
  canary: {                         // present for CANARY_TOUCHED
    canary_id: string | null
    directory: string | null
    operation: enum { READ, WRITE, RENAME, DELETE } | null
  } | null
  op_window: {                      // rolling behavioral counters for this agent
    writes_per_sec: number | null
    renames_per_sec: number | null
    distinct_types_touched: integer | null
  } | null
}
```

Rules: `entropy_read`/`entropy_write` are sampled at the same offset window so the detection engine can compute a delta (Redemption method). `format_valid=false` is the intermittent-encryption counter-signal. Agents batch events but never drop CANARY_TOUCHED. HEARTBEAT carries agent liveness for the watchdog.

### 6.2 Contract C2, Detection Engine → Containment Module (verdict)

Purpose: a decision with confidence and contributing signals; the containment module consumes only this.

```
DetectionVerdict {
  schema_version: string
  verdict_id: string                // unique
  host_id: string
  agent_id: string
  decided_at: timestamp
  verdict: enum { BENIGN, SUSPICIOUS, MASS_ENCRYPTION }
  confidence: number                // 0.0..1.0
  fast_path: boolean                // true if canary-tamper shortcut fired
  signals: [                        // every contributing signal, for audit + UI
    {
      signal_type: enum {
        CANARY_TAMPER, ENTROPY_DELTA, OP_FREQUENCY,
        TYPE_HEADER_CHANGE, FORMAT_VALIDATION_FAIL, ML_CLASSIFIER
      }
      fired: boolean
      score: number | null          // signal-specific
      detail: string | null         // human/audit-readable explanation
    }
  ]
  corroborating_count: integer      // number of independent signals fired
  recommended_action: enum { NONE, MONITOR, ALERT, ISOLATE_HOST }
  evidence_ref: string              // pointer to the telemetry window that triggered
}
```

Rules: a `MASS_ENCRYPTION` verdict with `recommended_action=ISOLATE_HOST` requires `corroborating_count >= 2` UNLESS `fast_path=true` (canary tamper), and even then containment respects the dial. `confidence` and `signals` are surfaced verbatim in the dashboard and the audit record (explainability for the auditor).

### 6.3 Contract C3, Incident Context → LLM Orchestration Layer

Purpose: the bundle the LLM layer receives to generate the report/map/plan. The LLM layer consumes only this plus the RAG playbook store; it never reaches into raw subsystems.

```
IncidentContext {
  schema_version: string
  incident_id: string
  opened_at: timestamp
  trigger_verdict: DetectionVerdict      // the verdict that opened the incident
  autonomy_mode: enum { MONITOR_ONLY, ALERT_RECOMMEND, HUMAN_GATED, FULL_AUTO }
  containment_actions: [ ActionRecord ]  // what has already been done (see C4)
  affected_hosts: [
    { host_id: string, status: enum { COMPROMISED, CONTAINED, SCANNING, SAFE },
      role: string | null, first_event_at: timestamp | null }
  ]
  topology_edges: [                      // for the blast-radius map
    { from_host: string, to_host: string,
      reachable_service: string | null,  // e.g. SMB, RDP, SSH
      status: enum { ACTIVE, BLOCKED } }
  ]
  telemetry_summary: {                    // bounded summary, never the raw firehose
    total_files_touched: integer
    encryption_rate_est: number | null
    families_indicated: [ string ] | null
  }
}
```

Rules: the context is a BOUNDED summary; the LLM layer never receives an unbounded telemetry dump (bounded-resource invariant). The LLM output is advisory and is itself recorded as an `LLMArtifact` (report/map/plan) referenced by `incident_id`; the LLM layer cannot emit an `ActionRecord` (it never acts).

### 6.4 Contract C4, Action Record → Audit Subsystem (the immutable record)

Purpose: the single immutable record of every action (autonomous or human-approved) and the unit of the audit chain.

```
ActionRecord {
  schema_version: string
  action_id: string                 // unique
  chain_seq: integer                // monotonic per audit chain
  prev_hash: string                 // hash of the previous record (tamper-evidence)
  record_hash: string               // hash of this record's canonical content
  occurred_at: timestamp
  incident_id: string | null
  host_id: string | null
  action_type: enum {
    ISOLATE_HOST, RELEASE_HOST, KILL_PROCESS, LOCK_SHARES, UNLOCK_SHARES,
    ALERT_RAISED, RECOMMENDATION_MADE, DIAL_CHANGED, APPROVAL_GRANTED,
    APPROVAL_DENIED, ROLLBACK_EXECUTED, LLM_REPORT_GENERATED
  }
  autonomy_mode: enum { MONITOR_ONLY, ALERT_RECOMMEND, HUMAN_GATED, FULL_AUTO }
  classification: enum { AUTO, ASK_TO_ACT, NEVER_AUTO }
  actor: {                          // who/what caused it (attribution)
    actor_type: enum { SYSTEM_AUTONOMOUS, HUMAN_APPROVER, HUMAN_OPERATOR }
    actor_id: string                // agent id or human identity
  }
  approver: {                       // present for dual-control destructive actions
    actor_id: string
    approved_at: timestamp
  } | null
  justification: {                  // why, the auditor's question
    verdict_id: string | null
    confidence: number | null
    signals_summary: string | null
  }
  reversible: boolean
  rollback_deadline: timestamp | null   // time-boxed actions
  outcome: enum { EXECUTED, QUEUED, BLOCKED, ROLLED_BACK, FAILED }
  detail: string | null
}
```

Rules: records are append-only; `prev_hash`/`record_hash` form a tamper-evident chain (any mutation breaks the chain and is detectable). Every destructive `action_type` in `HUMAN_GATED` mode MUST carry a non-null `approver` distinct from `actor` (dual control). The audit store is writable only by the audit subsystem and the main-thread Orchestrator during the build; worker subagents are denied write access (verification-integrity hook). Export produces a verifiable slice (e.g., "all ISOLATE_HOST in Q records") with chain-verification.

### 6.5 Contract C5, Autonomy Dial state machine + action-classification matrix

Purpose: the policy contract the Containment Module and the Autonomy subsystem enforce.

```
AutonomyDial {
  position: enum { MONITOR_ONLY, ALERT_RECOMMEND, HUMAN_GATED, FULL_AUTO }
  // transitions: any position -> any position, but EVERY change is an audited,
  // dual-control DIAL_CHANGED ActionRecord when moving to a more autonomous
  // position (ALERT_RECOMMEND < HUMAN_GATED < FULL_AUTO; MONITOR_ONLY is least).
  default: MONITOR_ONLY
}

ActionPolicy {
  // per action_type, the classification that bounds what each dial position may do
  ISOLATE_HOST:   NEVER_AUTO_below(FULL_AUTO)   // destructive: auto only in FULL_AUTO; ASK_TO_ACT in HUMAN_GATED; recommend/none below
  KILL_PROCESS:   NEVER_AUTO_below(FULL_AUTO)
  LOCK_SHARES:    NEVER_AUTO_below(FULL_AUTO)
  RELEASE_HOST:   ASK_TO_ACT                    // reversal still audited
  ALERT_RAISED:   AUTO                          // safe in every position incl. MONITOR? -> alert allowed from ALERT_RECOMMEND up; MONITOR_ONLY logs only
  RECOMMENDATION_MADE: AUTO_from(ALERT_RECOMMEND)
}
```

Semantics (the binding rules):
- **MONITOR_ONLY:** observe and log only. No alert, no recommendation, no action. (The safest pilot default.)
- **ALERT_RECOMMEND:** observe, log, raise alerts, and produce recommendations. No destructive action.
- **HUMAN_GATED:** all of the above, plus destructive actions are PROPOSED and execute only on dual-control approval (a second distinct approver), time-boxed with auto-rollback and one-click revert.
- **FULL_AUTO:** destructive actions classified AUTO execute automatically per the matrix; NEVER_AUTO actions still never auto-execute; everything is audited.
- **Deny-by-default override (fail-safe, ADR-005):** if the control plane is unreachable or the reasoning layer is down, the effective policy degrades, no NEW destructive action executes regardless of dial position; existing containment is maintained.

### 6.6 Contract C6, Control Plane to Endpoint Agent (command / actuation channel)

Purpose: the authenticated channel by which the control plane (driven by the Containment Module) commands an agent to act. This is the actuation path; it is distinct from C1 (telemetry, agent to detection). It carries the most security-sensitive messages in the system, so every command is authenticated, authorized, and audited.

```
AgentCommand {
  schema_version: string
  command_id: string                // unique
  issued_at: timestamp
  target_agent_id: string
  target_host_id: string
  command_type: enum {
    ISOLATE_HOST, RELEASE_HOST, KILL_PROCESS, LOCK_SHARES, UNLOCK_SHARES,
    PLANT_CANARY, REFRESH_CONFIG, APPLY_UPDATE, PING
  }
  params: {                         // command-specific
    pid: integer | null             // for KILL_PROCESS
    share_paths: [ string ] | null  // for LOCK_SHARES
    update_ref: string | null       // for APPLY_UPDATE (signed artifact ref)
  }
  authorization: {                  // non-repudiable proof this command is allowed
    autonomy_mode: enum { MONITOR_ONLY, ALERT_RECOMMEND, HUMAN_GATED, FULL_AUTO }
    verdict_id: string | null       // the verdict that justifies it
    approver_id: string | null      // present for HUMAN_GATED destructive commands
    action_record_id: string        // the audit record this command is bound to
  }
  rollback_deadline: timestamp | null
}

AgentCommandResult {
  schema_version: string
  command_id: string
  agent_id: string
  completed_at: timestamp
  outcome: enum { EXECUTED, REJECTED, FAILED, QUEUED }
  reason: string | null             // why rejected/failed
}
```

Rules: an agent executes a destructive command_type only if authorization is valid for the current dial position and (for HUMAN_GATED destructive commands) carries a distinct approver_id; otherwise it REJECTS and the rejection is audited. Every command is bound to an action_record_id (C4) before it is sent (the audit record precedes the action). Under control-plane loss the agent receives no new commands and, per the fail-safe invariant, initiates nothing destructive on its own. PLANT_CANARY and REFRESH_CONFIG are non-destructive and allowed in any mode.

### 6.7 Contract C7, LLM Artifacts (report, blast-radius map, recovery plan)

Purpose: the structured outputs the LLM layer produces and the dashboard consumes. The LLM emits these and nothing else (it never emits an ActionRecord or an AgentCommand). All three are advisory.

```
IncidentReport {
  schema_version: string
  incident_id: string
  generated_at: timestamp
  model_id: string                  // which self-hosted model produced it
  summary: string                   // bounded
  timeline: [ { at: timestamp, phase: string, description: string } ]
  attributed_technique_ids: [ string ]   // MITRE ATT&CK ids, e.g. T1486
  faithfulness: {                   // the gate's verdict on this artifact
    score: number                   // 0.0..1.0
    passed: boolean
    unsupported_claims: [ string ]  // any claim not traceable to retrieved context
  }
  citations: [ { claim: string, playbook_ref: string } ]
}

BlastRadiusMap {
  schema_version: string
  incident_id: string
  nodes: [ { host_id: string, status: enum { COMPROMISED, CONTAINED, SCANNING, SAFE },
             role: string | null } ]
  edges: [ { from_host: string, to_host: string,
             reachable_service: string | null,
             status: enum { ACTIVE, BLOCKED } } ]
}

RecoveryPlan {
  schema_version: string
  incident_id: string
  steps: [ {
    order: integer
    action: string
    rationale: string
    playbook_ref: string            // attribution (faithfulness)
    priority: enum { CRITICAL, HIGH, MEDIUM }
    depends_on: [ integer ] | null  // step ordering by dependency
  } ]
  faithfulness: { score: number, passed: boolean }
}
```

Rules: every RecoveryPlan step action carries a playbook_ref (attribution); a plan or report whose faithfulness.passed is false is blocked or routed-to-human, never shipped as authoritative (ADR-008, AC-LLM-01/03). The BlastRadiusMap is derived from the operational store and the IncidentContext, not invented by the model. The dashboard renders these verbatim.

### 6.8 Contract C8, Integration Adapters (SIEM, Active Directory, EDR)

Purpose: the generic contracts the SIEM, AD, and EDR adapters satisfy, validated against mocks in this build (real wiring is human-gated, OQ-1). These exist so the bank can connect TALOS to its SOC without changing TALOS.

```
// Outbound: TALOS to SIEM (events the SOC ingests)
SiemEvent {
  schema_version: string
  event_id: string
  occurred_at: timestamp
  severity: enum { INFO, LOW, MEDIUM, HIGH, CRITICAL }
  category: enum { DETECTION, CONTAINMENT, APPROVAL, AUDIT, HEALTH }
  host_id: string | null
  incident_id: string | null
  message: string
  // emitted as syslog/CEF and via REST/webhook; field names stable
}

// Inbound: Active Directory identity context (TALOS consumes)
AdIdentityContext {
  schema_version: string
  host_id: string
  hostname: string | null
  ou: string | null                 // organizational unit
  owner_user: string | null
  criticality: enum { CRITICAL, HIGH, NORMAL } | null
}

// Outbound: EDR isolate-host action (TALOS asks an existing EDR to isolate)
EdrIsolateRequest {
  schema_version: string
  request_id: string
  host_id: string
  action: enum { ISOLATE, RELEASE }
  reason: string
  action_record_id: string          // bound to the audit record
}
EdrActionResult { request_id: string, outcome: enum { ACCEPTED, REJECTED, FAILED }, reason: string | null }
```

Rules: adapters translate between these generic contracts and a specific vendor; TALOS core code depends only on these shapes (a new SIEM or EDR is a new adapter, not a core change). Outbound SIEM events are emitted in both syslog/CEF and REST/webhook forms. The EDR isolate request is bound to an audit record (C4) like any destructive action.

### 6.9 Contract C9, Health and Readiness

Purpose: the contract the System Health dashboard and any liveness probe consumes (AC-OBS-HEALTH).

```
HealthStatus {
  schema_version: string
  checked_at: timestamp
  overall: enum { HEALTHY, DEGRADED, UNHEALTHY }
  components: [ {
    name: enum { DETECTION_ENGINE, CONTROL_PLANE, LLM_SERVING, AUDIT_STORE,
                 OPERATIONAL_STORE, AGENT_FLEET, INTEGRATIONS }
    status: enum { HEALTHY, DEGRADED, UNHEALTHY }
    detail: string | null
  } ]
  agent_coverage: { enrolled: integer, online: integer, offline: integer }
  effective_autonomy: enum { MONITOR_ONLY, ALERT_RECOMMEND, HUMAN_GATED, FULL_AUTO }
  // effective_autonomy reflects the fail-safe override: if degraded, this can be
  // lower than the configured dial position (ADR-005). This field is load-bearing:
  // it tells the operator the system has self-degraded.
}
```

Rules: overall is DEGRADED whenever the fail-safe override is active (LLM down or control plane impaired), and effective_autonomy reflects the degraded reality, not the configured dial. Health reflects real dependency status, never a static OK.

### 6.10 Contract C10, Operational data model and error envelope

Purpose: the core entities every component shares, and the uniform error format. These are the nouns the system is built around.

```
Host { host_id, hostname, os, ip, segment, status: enum { COMPROMISED, CONTAINED, SCANNING, SAFE, PROTECTED }, agent_id, role, criticality, last_seen }
Agent { agent_id, host_id, cert_subject, version, status: enum { ONLINE, OFFLINE, DEGRADED }, canary_inventory: [ { canary_id, directory, intact: boolean } ], last_heartbeat }
Incident { incident_id, opened_at, closed_at, status: enum { OPEN, CONTAINED, RESOLVED }, trigger_verdict_id, autonomy_mode, affected_host_ids: [ string ], severity }
FleetState { total_hosts, protected, compromised, contained, scanning, online_agents, offline_agents }   // aggregate summary; lists are always returned bounded/paginated

ErrorEnvelope {                    // uniform error format across all APIs and contracts
  schema_version: string
  error_code: string               // stable, machine-parseable
  message: string                  // human-readable, no secrets, no PII
  correlation_id: string           // ties to the structured logs
  retryable: boolean
}
```

Rules: lists of hosts, incidents, and audit records are ALWAYS paginated and bounded (the bounded-resource invariant, AC-PERF-03); FleetState is the aggregate counts, never a full dump. Every API and contract error uses ErrorEnvelope; messages never contain secrets or PII (AC-OBS-LOG). error_code values are stable so consumers branch on them.

</contracts>

---

## 7. Data Sources and External Dependencies

Grounded by research pass 2. Each item notes access terms and whether an autonomous agent may use it.

- **Safe ransomware simulator (built in-house, Phase 1).** No external dependency; the Orchestrator builds it. Reference design: Atomic Red Team T1486 patterns (open-source, MIT) for reversible test construction. This is the primary detection oracle. SAFE for autonomous use.
- **Real ransomware samples, HUMAN-ONLY, NOT an Orchestrator dependency.** theZoo, MalwareBazaar/abuse.ch, VX-Underground, MITRE. Used only in the human-operated air-gapped lab. The Orchestrator writes the runbook; it NEVER accesses these. Flagged as a hard boundary, not a build dependency.
- **Open-weight LLM (production).** DeepSeek-class, MIT-licensed (DeepSeek-V3.2 / V4 weights are MIT per the official model cards; commercial use permitted, no royalty), or a smaller 20-30B open-weight model (gpt-oss-20b / Qwen-32B class). Downloaded weights, self-hosted. License is commercial-use-OK. For DEV/TEST of TALOS, a cloud LLM API may be used for convenience; NEVER for bank production (ADR-002). Env keys: only if a cloud API is used for dev/test (e.g., an inference API key), kept out of the production path.
- **LLM serving stack.** SGLang (favored) or vLLM, both open-source (Apache-2.0). No paid dependency. GPU hardware is the bank's capex for production; dev/test can use a rented or local GPU.
- **OS monitoring.** eBPF (kernel, no license cost), Windows minifilter (requires a driver-signing certificate for production Windows deployment, note as a deployment prerequisite, not a build blocker; dev/test can use test-signing). fanotify (kernel). No paid dependency for the build.
- **IR playbook corpus (RAG).** An internal incident-response playbook authored as project content (the Orchestrator can scaffold a representative playbook from public IR frameworks, NIST 800-61, MITRE ATT&CK mappings, for the build; the bank supplies its real playbook at deployment). No paid dependency.
- **Integration targets (mocks only in this build).** SIEM (Wazuh is open-source and a likely regional-bank fit; Splunk/QRadar are commercial, built against generic contracts + mocks), Active Directory (mocked), EDR isolate-host APIs (mocked). No real tenant credentials in this build.
- **Fleet/load simulation.** Locust (open-source) or an OpenTelemetry-style synthetic generator, built in-house. No paid dependency.

**Critical: no autonomous build dependency on a paid or licence-restricted external API.** The only external services are open-source serving stacks and downloaded open-weight models. This is deliberate, the layer where projects die quietly (an assumed-free API that is not) is avoided by design.

**MCP servers / skills the Orchestrator should install** (authorize in the Orchestrator prompt): a browser/testing MCP (Playwright) for dashboard e2e verification; a current-docs MCP (Context7) for library currency; the GitHub MCP for repo operations. Superpowers is already installed and provides the brainstorming/spec/TDD/review discipline the Orchestrator hands off to.

---

<acceptance_criteria>

## 8. Acceptance Criteria (the verification matrix and Definition of Done)

This section IS the Definition of Done and the Orchestrator's gate evidence. Each criterion has a stable id, a Given/When/Then or a measurable threshold, an evidence entry (check command or test id + expected result + artifact path) parsed fail-closed by the relevant gate. The Orchestrator writes the concrete test ids and check commands at planning time; the criteria, thresholds, and evidence requirements are frozen. Criteria are grouped by concern and mapped to the 28-dimension quality matrix (every applicable dimension is covered; dimensions that genuinely do not apply are marked N/A with a reason).

### 8.1 Detection correctness (maps: correctness, the core domain requirement)

- **AC-DET-01**, Given the safe simulator running full encryption on a test directory, when mass-encryption begins, then the detection engine emits a MASS_ENCRYPTION verdict. Evidence: detection test suite `det_full_encryption`; expected PASS; artifact `reports/detection/full.json`.
- **AC-DET-02**, Given the simulator in intermittent mode (every-N-bytes, header-only, first-4KB), when encryption begins, then a MASS_ENCRYPTION verdict is emitted via the format-validation and/or fusion signals (NOT relying on entropy alone). Evidence: `det_intermittent_matrix` (one case per mode); expected PASS for every mode; artifact `reports/detection/intermittent.json`.
- **AC-DET-03**, Given the simulator in low-and-slow mode, when encryption proceeds below naive thresholds, then the engine still detects via op-frequency + format validation within the file-loss budget. Evidence: `det_low_slow`; expected PASS; artifact `reports/detection/low_slow.json`.
- **AC-DET-04**, Given a canary file, when it is touched, then a high-confidence fast-path verdict (`fast_path=true`) is produced. Evidence: `det_canary_fastpath`; expected PASS; artifact `reports/detection/canary.json`.
- **AC-DET-05**, Given any destructive recommendation (`recommended_action=ISOLATE_HOST`), then `corroborating_count >= 2` OR `fast_path=true` holds for every such verdict in the test battery. Evidence: `det_corroboration_invariant`; expected PASS (zero violations); artifact `reports/detection/corroboration.json`.
- **AC-DET-06**, Detection battery covers ≥20 distinct ransomware behaviors/families and ≥4 evasion modes. Evidence: `det_battery_coverage` (counts families/modes); expected ≥20 and ≥4; artifact `reports/detection/coverage.json`. (Detection rate is reported, not asserted as a fixed percentage; the ceiling is ~99% on limited family counts in the literature and is not a field guarantee.)

### 8.2 False positives (maps: correctness, the bank-critical number)

- **AC-FP-01**, Given the benign-but-suspicious workload suite (backup agent, 7-Zip/compression, video encode, DB maintenance, legitimate full-disk encryption), when each runs, then the false-positive rate ≤ 0.5% (no destructive verdict triggered by benign high-entropy activity beyond the threshold). Evidence: `fp_benign_suite`; expected FP_rate ≤ 0.005; artifact `reports/fp/benign.json`.
- **AC-FP-02**, Given a process/path allow-list for known high-entropy applications, when an allow-listed app runs, then no destructive verdict is produced and the suppression is auditable. Evidence: `fp_allowlist`; expected PASS; artifact `reports/fp/allowlist.json`.

### 8.3 Containment (maps: correctness, performance budget, resilience)

- **AC-CONT-01**, Given a high-confidence MASS_ENCRYPTION verdict in FULL_AUTO, when containment is permitted by the dial, then host network isolation completes with p95 < 10 seconds from verdict. Evidence: `cont_latency_p95` (load fixture, 100+ runs); expected p95 < 10s; artifact `reports/containment/latency.json`.
- **AC-CONT-02**, Given a host under containment, when the control-plane link drops, then the isolation persists (does not auto-release). Evidence: `cont_persist_on_partition`; expected PASS; artifact `reports/containment/persist.json`.
- **AC-CONT-03**, Given files being encrypted, when detection-then-containment runs, then files lost before containment ≤ 10 at representative encryption speed. Evidence: `cont_files_lost`; expected ≤ 10; artifact `reports/containment/files_lost.json`.
- **AC-CONT-04**, Given a containment action, when executed, then process termination and share lockdown complete and are recorded. Evidence: `cont_actions`; expected PASS; artifact `reports/containment/actions.json`.

### 8.4 Autonomy dial + dual control (maps: correctness, authz, security)

- **AC-DIAL-01**, Given each dial position, when a destructive verdict occurs, then the system behaves exactly per the C5 semantics (MONITOR_ONLY: log only; ALERT_RECOMMEND: alert+recommend, no action; HUMAN_GATED: propose + require dual approval; FULL_AUTO: auto per matrix). Evidence: `dial_behavior_matrix` (one case per position); expected PASS for all; artifact `reports/dial/matrix.json`.
- **AC-DIAL-02**, Given HUMAN_GATED mode, when a destructive action is proposed, then it CANNOT execute without a second distinct approver (dual control). Evidence: `dial_dual_control` (incl. negative test: single approver is rejected); expected PASS; artifact `reports/dial/dual_control.json`.
- **AC-DIAL-03**, Given an executed time-boxed destructive action, when the rollback deadline passes without confirmation, then auto-rollback fires; one-click revert is available before then. Evidence: `dial_rollback`; expected PASS; artifact `reports/dial/rollback.json`.
- **AC-DIAL-04**, Default dial position on a fresh deployment is MONITOR_ONLY. Evidence: `dial_default`; expected MONITOR_ONLY; artifact `reports/dial/default.json`.
- **AC-DIAL-05**, Given a NEVER_AUTO action type, when in FULL_AUTO, then it still never auto-executes. Evidence: `dial_never_auto`; expected PASS; artifact `reports/dial/never_auto.json`.

### 8.5 Fail-safe / resilience (maps: resilience error handling, graceful degradation, retry/timeout)

- **AC-FAIL-01**, Given the LLM serving layer is down, when an incident occurs, then detection + containment continue and report generation queues (no crash, no rogue action). Evidence: `fail_llm_down`; expected PASS; artifact `reports/resilience/llm_down.json`.
- **AC-FAIL-02**, Given the control plane is unreachable, when a new destructive verdict occurs, then NO new destructive action executes (deny-by-default) while existing containment is maintained. Evidence: `fail_cp_partition`; expected PASS; artifact `reports/resilience/cp_partition.json`.
- **AC-FAIL-03**, Given an agent crash, when the watchdog runs, then the agent auto-recovers and resumes monitoring; no destructive action fires during recovery. Evidence: `fail_agent_crash`; expected PASS; artifact `reports/resilience/agent_crash.json`.
- **AC-FAIL-04**, Given the fanotify/event queue fills, when overflow occurs, then events are handled safely (durable sink, no silent loss that masks an attack, no crash). Evidence: `fail_queue_overflow`; expected PASS; artifact `reports/resilience/queue.json`.
- **AC-FAIL-05**, Given a long-running agent under sustained load, when run over a soak test, then memory stays bounded (no leak beyond threshold). Evidence: `fail_soak_memory`; expected heap bounded under threshold; artifact `reports/resilience/soak.json`.
- **AC-FAIL-06**, External calls (agent↔control-plane, LLM calls) have timeouts and bounded retry with backoff. Evidence: `fail_timeout_retry`; expected PASS; artifact `reports/resilience/timeout.json`.

### 8.6 LLM faithfulness (maps: correctness, data integrity for guidance)

- **AC-LLM-01**, Given a generated recovery plan, when each recommendation is checked, then every recommendation is traceable to a retrieved playbook passage; untraceable output is blocked or routed-to-human. Evidence: `llm_faithfulness_gate`; expected zero unattributed recommendations shipped; artifact `reports/llm/faithfulness.json`.
- **AC-LLM-02**, Given an incident context, when the report is generated, then it conforms to the structured JSON schema (deterministic format). Evidence: `llm_schema_conformance`; expected PASS; artifact `reports/llm/schema.json`.
- **AC-LLM-03**, Given a low-faithfulness generation, when the gate evaluates it, then it is rejected/routed rather than shipped. Evidence: `llm_negative_faithfulness` (adversarial); expected PASS; artifact `reports/llm/negative.json`.

### 8.7 Audit subsystem (maps: observability logging, data integrity, security secrets, repo hygiene)

- **AC-AUDIT-01**, Given any autonomous action or human approval, when it occurs, then an immutable ActionRecord is appended with full attribution. Evidence: `audit_completeness`; expected every action produces a record; artifact `reports/audit/completeness.json`.
- **AC-AUDIT-02**, Given the audit chain, when any record is mutated, then the hash chain breaks and verification detects it (tamper-evidence). Evidence: `audit_tamper_detection` (mutate-and-verify); expected tamper DETECTED; artifact `reports/audit/tamper.json`.
- **AC-AUDIT-03**, Given a 24-hour window, when reconstruction is requested, then the full sequence of actions is reproducible from durable storage. Evidence: `audit_24h_reconstruction`; expected PASS; artifact `reports/audit/reconstruct.json`.
- **AC-AUDIT-04**, Given an export request ("all ISOLATE_HOST in a period with justification"), when run, then a verifiable, chain-checked export is produced. Evidence: `audit_export`; expected PASS + chain valid; artifact `reports/audit/export.json`.
- **AC-AUDIT-05**, Given a destructive action in HUMAN_GATED mode, when recorded, then the record carries a distinct approver (non-repudiation of dual control). Evidence: `audit_dual_control_record`; expected PASS; artifact `reports/audit/dual_control.json`.

### 8.8 Self-protection / security (maps: authn, authz, input validation, secrets, dependency CVE, the self-protection threat model)

- **AC-SEC-01**, Given agent↔control-plane traffic, when inspected, then it is mutually authenticated (mTLS) and encrypted; unauthenticated peers are rejected. Evidence: `sec_mtls`; expected PASS (incl. negative: bad cert rejected); artifact `reports/security/mtls.json`.
- **AC-SEC-02**, Given an attempt to tamper with or stop the agent without authorization, when made, then it is prevented/detected and the agent self-heals or alerts. Evidence: `sec_anti_tamper`; expected PASS; artifact `reports/security/anti_tamper.json`.
- **AC-SEC-03**, Given the control plane, when probed, then privileged actions require authorization (deny-by-default), and all protected routes reject unauthenticated/unauthorized callers. Evidence: `sec_authz_deny_default`; expected PASS; artifact `reports/security/authz.json`.
- **AC-SEC-04**, Given all external inputs (telemetry, API, dashboard), when received, then they are schema-validated at the boundary; injection/XSS tests pass. Evidence: `sec_input_validation`; expected PASS; artifact `reports/security/input.json`.
- **AC-SEC-05**, Given the repo and runtime, when scanned, then no secrets in code/logs/repo; `.env` is gitignored; git-log audit clean. Evidence: `sec_secrets_scan`; expected zero findings; artifact `reports/security/secrets.json`.
- **AC-SEC-06**, Given dependencies, when scanned, then zero known high/critical CVEs; lockfile committed. Evidence: `sec_dep_cve`; expected zero high/critical; artifact `reports/security/cve.json`.
- **AC-SEC-07**, Given the red-team scenario set (disable-agent-via-tamper, false-positive weaponization to induce wrongful isolation/DoS, RAG/LLM input poisoning), when executed, then each is defended (the attack does not achieve disable / wrongful destructive action / unsafe guidance). Evidence: `sec_redteam_suite`; expected all DEFENDED; artifact `reports/security/redteam.json`.

### 8.9 Performance, resource, scale (maps: performance budget, memory/resource, scalability)

- **AC-PERF-01**, Given the agent on an endpoint, when monitoring under normal activity, then steady-state CPU overhead ≤ ~3% (eBPF-class target). Evidence: `perf_agent_overhead`; expected ≤ ~3%; artifact `reports/perf/overhead.json`.
- **AC-PERF-02**, Given a synthetic fleet of ≥1,000 emulated endpoints, when telemetry streams in, then the detection engine sustains throughput with bounded memory and bounded latency (no unbounded load). Evidence: `perf_fleet_scale`; expected bounded memory + p95 latency under budget at ≥1,000; artifact `reports/perf/fleet.json`.
- **AC-PERF-03**, Given any data view (dashboard fleet/host, audit query), when requested, then results are paginated/bounded and never load the full set into memory or one response. Evidence: `perf_bounded_results` (fixture ≥1,000 rows); expected bounded; artifact `reports/perf/bounded.json`.
- **AC-PERF-04**, Detection-to-alert latency target < 2s after the triggering signal. Evidence: `perf_detect_latency`; expected < 2s; artifact `reports/perf/detect_latency.json`.

### 8.10 Cross-cutting engineering dimensions (the remaining 28-matrix items)

- **AC-TEST-COV**, Test coverage ≥ 80% lines overall, 100% on contract-bearing and critical (detection/containment/audit/dial) paths. Evidence: `coverage_report`; expected thresholds met; artifact `reports/coverage/summary.json`. (Dimension: test coverage.)
- **AC-TYPE**, Zero type errors; strict mode on; no untyped escapes beyond an allowlist. Evidence: `typecheck`; expected clean; artifact `reports/typecheck.txt`. (Type safety.)
- **AC-LINT**, Linter/formatter pass with zero warnings, hook-enforced on every edit. Evidence: `lint`; expected clean; artifact `reports/lint.txt`. (Lint/format.)
- **AC-OBS-LOG**, Structured JSON logs at defined levels; no PII in logs; correlation ids. Evidence: `obs_logging`; expected PASS; artifact `reports/obs/logging.json`. (Observability logging, distinct from the immutable audit log.)
- **AC-OBS-ERR**, Errors captured/reported; no swallowed exceptions. Evidence: `obs_error_tracking`; expected PASS; artifact `reports/obs/errors.json`. (Error tracking.)
- **AC-OBS-HEALTH**, Health/readiness endpoints return real dependency status (detection, control plane, LLM, audit); tested. Evidence: `obs_health`; expected PASS; artifact `reports/obs/health.json`. (Observability health.)
- **AC-DATA-MIG**, Any schema/migration is reversible and transactional; no data loss; tested up/down on a fixture (the audit store especially must never lose records). Evidence: `data_migration`; expected PASS; artifact `reports/data/migration.json`. (Data integrity/migrations.)
- **AC-CONFIG**, 12-factor: all config env-driven, none hardcoded; complete `.env.example`; the dial default and thresholds are config, not literals. Evidence: `config_audit`; expected PASS; artifact `reports/config.json`. (Config management.)
- **AC-BUILD-REPRO**, Lockfile committed; clean checkout builds deterministically in CI. Evidence: `ci_clean_build`; expected PASS; artifact CI log. (Reproducible build.)
- **AC-DOCS**, Each module self-documented at build; README, architecture docs, API docs, runbook (incl. the operator runbook for the bank IT team and the air-gapped detonation SOP), CONTRIBUTING complete and accurate. Evidence: `docs_completeness`; expected PASS; artifact `reports/docs.json`. (Documentation.)
- **AC-REPO**, License, changelog, correct `.gitignore`, no secret/`.claude` leak, clean history. Evidence: `repo_hygiene`; expected PASS; artifact `reports/repo.json`. (Repo hygiene.)
- **AC-CICD**, A pipeline runs build, lint, typecheck, tests, and security on every change; deploy reproducible. Evidence: CI config + run; expected PASS; artifact CI log. (CI/CD.)
- **AC-SEMVER**, Version tagged per semver; changelog matches; breaking changes flagged. Evidence: `semver_check`; expected PASS; artifact `reports/semver.txt`. (Semantic versioning.)
- **AC-I18N**, No hardcoded user-facing strings; locale-ready (Indonesian + English), since this is an Indonesian-market product. Evidence: `i18n_scan`; expected PASS; artifact `reports/i18n.json`. (i18n/l10n.)
- **AC-A11Y**, WCAG 2.x AA on key dashboard flows: contrast, keyboard nav, labels; automated a11y check passes; severity never by color alone. Evidence: `a11y_check`; expected PASS; artifact `reports/a11y.json`. (Accessibility.)
- **AC-INTEG**, SIEM/AD/EDR adapters pass contract tests against mocks (normalized event schema, syslog/CEF + REST/webhook out; isolate-host action in). Evidence: `integration_contract_tests`; expected PASS; artifact `reports/integration.json`. (Integration correctness.)

### 8.11 Compliance acceptance (OJK / UU PDP, mapped, see 8.13 for the requirement detail)

- **AC-COMP-01**, The deployment artifact supports fully on-premise operation within a single boundary; no security telemetry egresses to a third-party cloud in the production configuration. Evidence: `comp_no_egress` (network assertion in the prod profile); expected zero external egress; artifact `reports/compliance/egress.json`. (Data residency / sovereignty, POJK 11/2022.)
- **AC-COMP-02**, Audit export satisfies the OJK-style evidentiary requirement (immutable, attributable, tamper-evident, exportable, 24h reconstruction), this is AC-AUDIT-01..05 rolled up as the compliance gate. Evidence: `comp_audit_rollup`; expected PASS; artifact `reports/compliance/audit.json`.
- **AC-COMP-03**, A documented mapping from TALOS controls to POJK 11/POJK.03/2022 (IT risk management, incident reporting, annual audit support) and UU PDP (Law 27/2022; breach-notification support, data-handling) exists and is accurate. Evidence: `comp_mapping_doc` (reviewed); expected PRESENT + reviewed; artifact `docs/compliance/ojk-pdp-mapping.md`. (Note: no OJK rule specifically governs autonomous AI decision-making; the mapping states this honestly and positions autonomous destructive action as high-risk processing requiring documented human oversight, which the dial + dual control + audit provide.)

### 8.12 Actuation, LLM artifacts, integration, health, data model (the newly-contracted surfaces)

- **AC-ACT-01**, Given an AgentCommand (C6), when received, then the agent executes a destructive command only if authorization is valid for the current dial position and (HUMAN_GATED destructive) carries a distinct approver_id; otherwise it REJECTS and the rejection is audited. Evidence: `act_command_authz` (incl. negative: unauthorized command rejected); expected PASS; artifact `reports/actuation/authz.json`.
- **AC-ACT-02**, Given any destructive AgentCommand, when issued, then it is bound to an ActionRecord (C4) before it is sent (audit precedes action). Evidence: `act_audit_precedes`; expected PASS; artifact `reports/actuation/audit_order.json`.
- **AC-LLMART-01**, Given a generated report/map/plan, when produced, then each conforms to its C7 schema and every RecoveryPlan step carries a playbook_ref. Evidence: `llmart_schema`; expected PASS; artifact `reports/llm/artifacts.json`.
- **AC-INTEG-SIEM**, Given the SIEM adapter, when an event is emitted, then it conforms to SiemEvent and is produced in both syslog/CEF and REST/webhook forms (mock-verified). Evidence: `integ_siem`; expected PASS; artifact `reports/integration/siem.json`.
- **AC-INTEG-AD**, Given the AD adapter, when identity context is requested, then it is consumed per AdIdentityContext (mock-verified). Evidence: `integ_ad`; expected PASS; artifact `reports/integration/ad.json`.
- **AC-INTEG-EDR**, Given the EDR adapter, when an isolate request is made, then it conforms to EdrIsolateRequest, is bound to an audit record, and handles ACCEPTED/REJECTED/FAILED (mock-verified). Evidence: `integ_edr`; expected PASS; artifact `reports/integration/edr.json`.
- **AC-HEALTH-01**, Given the health endpoint (C9), when a dependency is impaired, then overall is DEGRADED and effective_autonomy reflects the fail-safe override (not the configured dial). Evidence: `health_degraded_reflects`; expected PASS; artifact `reports/obs/health_degraded.json`.
- **AC-ERR-01**, Given any API or contract error, when returned, then it uses ErrorEnvelope with a stable error_code, a correlation id, and no secrets or PII in the message. Evidence: `err_envelope`; expected PASS; artifact `reports/obs/errors_envelope.json`.
- **AC-DATA-01**, Given the operational data model (C10), when lists are queried, then they are paginated and bounded and FleetState returns aggregate counts (never a full dump). Evidence: `data_bounded_lists`; expected PASS; artifact `reports/data/bounded.json`.

Gate mapping for these: AC-ACT to Gate 3 (containment/actuation) and Gate 7 (audit binding); AC-LLMART to Gate 4; AC-INTEG-* to Gate 12 and Gate 15; AC-HEALTH to Gate 10; AC-ERR and AC-DATA to Gate 8 and Gate 11.

</acceptance_criteria>

### 8.13 Compliance requirements detail (OJK / Bank Indonesia / UU PDP)

These are constraints that shape the build, surfaced here so they land in architecture and acceptance, not as a late annex. Sources are OFFICIAL (ojk.go.id, the laws) per research pass 2; implementing regulations for UU PDP are still pending as of mid-2026, so treat cross-border specifics as firming-up and engage OJK early.

- **POJK 11/POJK.03/2022 (Penyelenggaraan TI oleh Bank Umum).** Requires IT risk management (operational/data-leak/cyber), customer-data protection, adequate IT infrastructure including DR, internal cybersecurity oversight, initial incident notification + IT incident reports to OJK, and an annual digital-maturity self-assessment. Data residency: Electronic Systems, Data Centers, and DR Centers within Indonesia; placement abroad needs prior OJK approval and is barred for systems tied to individual customer/transaction data. **Consequence:** the production control plane and LLM are on-premise in Indonesia (ADR-002); TALOS produces the audit evidence and incident records that support the bank's OJK incident-reporting obligation.
- **POJK 38/2016 + POJK 13/2020 (MRTI predecessors, still referenced).** Active board oversight, IT policies/standards, internal IT audit at least annually, DR plan. **Consequence:** TALOS's audit export and operator runbook support the annual IT audit.
- **UU PDP (Law 27/2022).** Enforceable since Oct 17, 2024; breach notification to data subjects and the authority within 72 hours (Art. 46); administrative fines up to 2% of annual revenue, criminal penalties to 6 years / IDR 6 billion; tiered cross-border transfer. **Consequence:** TALOS handles security telemetry (which may include personal data) within the boundary; no third-party egress; its incident records support the 72-hour notification timeline. A DPIA-style posture treats autonomous destructive action as high-risk processing requiring documented human oversight (the dial + dual control).
- **No specific OJK AI-decision rule found.** The compliance posture is inferred from IT-risk governance + PDP accountability. The honest position, stated in the mapping doc: autonomous destructive action is high-risk and is governed by the dial (default monitor-only), dual control, time-boxed rollback, and immutable audit. Engage OJK on the autonomy question rather than assuming.

### 8.14 Self-protection threat model (the tool is a high-value target)

Locked as a security-design input and verified at Gate 12/13. TALOS runs with high privilege (it can isolate hosts and kill processes), so it is the most valuable target in the bank, and ransomware's first move is to disable security tooling (Play, Medusa via BYOVD). The model and the required defenses:

- **Threat: disable/tamper the agent (BYOVD, service kill, file/registry tamper).** Defense: kernel-mode anti-tamper protecting the agent service/files; admin-console-authorized stop/uninstall/upgrade only; self-healing re-apply of hardened config; driver blocklist/HVCI guidance. Verified: AC-SEC-02, AC-SEC-07.
- **Threat: impersonate or MITM the control channel.** Defense: mutual TLS, certificate identity, hierarchical keys with forward secrecy, non-exportable private keys, message authentication, non-repudiation. Verified: AC-SEC-01.
- **Threat: weaponize false positives to induce wrongful isolation (turn the defense into a DoS).** Defense: the ≥2-corroborating-signal rule, the dial (destructive action gated), dual control in HUMAN_GATED, time-boxed auto-rollback, and the ≤0.5% FP budget. Verified: AC-DET-05, AC-FP-01, AC-DIAL-02/03, AC-SEC-07.
- **Threat: poison the LLM/RAG inputs to elicit unsafe guidance.** Defense: the faithfulness gate, structured output, advisory-only LLM (never executes), route-to-human on low faithfulness. Verified: AC-LLM-01/03, AC-SEC-07.
- **Threat: compromise the control plane to gain the fleet kill-switch.** Defense: hardened, locked-down, deny-by-default control plane; least privilege; authz on every privileged action; the fail-safe invariant (control-plane loss → no new destructive action). Verified: AC-SEC-03, AC-FAIL-02.

---

## 9. Build Approach and Test Strategy (the 15-phase gated spine)

This is the execution order. Each parallelizable phase is one dynamic workflow; each phase ends, once its gate passes with manifest-conformant evidence, with a git commit that is the durability checkpoint. The Orchestrator regains control between phases, evaluates the gate fail-closed, commits, then launches the next. Coupled glue between phases (wiring, shared state, deployment) the Orchestrator does itself sequentially. The spine is the floor; the Orchestrator may launch discretionary workflows where worth the compute.

**Two standing rules for every workflow phase.** (1) Launch it with its gate as the explicit completion goal plus a per-workflow token budget, so a swarm can neither stop at partial progress and call it done nor run away. (2) Before fan-out, write that phase's evidence manifest (per criterion: stable id, check command/test id, expected result, artifact path); the gate evaluates the manifest fail-closed, a missing/malformed/unparseable entry is a failure, never a pass.

**The harness discipline (from Anthropic's published long-run patterns, baked in):** a JSON feature list (not Markdown, the model is less likely to overwrite JSON) enumerating every acceptance criterion as `passes:false` at init; a `claude-progress` file and `.crown/notes.md` (lessons/deviations) carried across sessions; git checkpoint per gate; on relaunch, recon the committed state and re-verify the last gate against the real repo before continuing (never trust a checkpoint blindly); fresh-context verifiers grade work (the builder never signs off its own code) under the grounded-claims rule, verbatim: "before reporting progress, audit each claim against a tool result from this session; if something is not yet verified, say so." Prefer context resets over compaction for very long runs, rebuilding the session from the structured handoff files. Never surface a remaining-token countdown to an agent; keep cost in written artifacts; include the long-run reassurance line.

**The single most important anti-failure rule:** fresh-context evaluation beats self-critique. An agent asked to grade its own work confidently praises mediocre output. The final acceptance verification (Gate 8) is non-negotiably done by fresh-context reviewers with a rubric tied to the criteria.

### Phase 0, Foundation + architecture handshake (Orchestrator, sequential)
Recon-first: read git log/working tree; if commits exist (relaunch), reconstruct state, re-verify the last claimed gate, resume from the first unmet gate; else start fresh. Verify the enforcement floor (do NOT write it, a bypass-launched agent cannot write `settings.json`/hooks under the current platform; the floor is provisioned before launch per the operator-setup; Phase 0 probes and verifies, emit-and-stop if absent). Read this blueprint and the design handoff fully; reconcile; flag conflicts. Author the lean root CLAUDE.md and path-scoped rules; create the ADR directory; write the frozen contracts (section 6) as files referenced by pointer; **scaffold the audit-log substrate and the test-harness skeleton now** (audit must exist before the first action; the safe-simulator interface is referenced by detection from line one); initialize `.crown/notes.md`, the progress file, and the JSON feature list (every section-8 criterion as `passes:false`); wire compaction-survival hooks. Then run the architecture-design step and the fresh-context architecture review against every frozen contract and invariant (the dial, the fail-safe invariant, the bounded-resource invariant, the audit immutability). **Gate 0 (hard):** enforcement floor verified active, foundation + contracts + audit substrate + harness skeleton exist, JSON feature list initialized, architecture review passed. Commit `checkpoint(gate-0)`.

### Phase 1, Safe test infrastructure / detection oracle (workflow)
Build the detection oracle FIRST, because nothing downstream can be gated without it. Build: the parametric safe ransomware simulator (full + intermittent every-N-bytes/header-only/first-4KB + low-and-slow modes; configurable speed/throttle/file-types; benign, reversible, key-retaining, single-directory, non-propagating, no network, Atomic Red Team T1486 reference); the benign-but-suspicious workload suite (backup, 7-Zip, video encode, DB maintenance, legitimate FDE); the metrics collector and report generator. Write (do not execute) the air-gapped real-malware detonation runbook/SOP as documentation. **Verification-integrity guardrail:** once built and frozen, the simulator and benign suite are test oracles; worker subagents are denied write access (hook). **Gate 1:** simulator runs and produces every evasion mode, benign suite runs, metrics are emitted and valid, detonation runbook exists. Commit.

### Phase 2, Detection core, deterministic, no LLM (workflow)
Build the endpoint agent's filesystem monitoring (eBPF/Linux, minifilter/Windows, fanotify-light option) behind the C1 telemetry contract; canary management; and the detection engine's multi-signal fusion behind C2: canary fast-path, entropy delta (read-vs-write at the same offset), op-frequency/behavioral features, type/header change, the file-format-validation module (the intermittent-encryption counter), optional explainable gradient-boosting/RF classifier. Enforce the ≥2-corroborating-signal rule for destructive verdicts. Partition by contract boundary (agent monitoring backends, each detection signal, the fusion decision) into wave-sized modules; worktree isolation; reviewer density per policy (adversarial review mandatory on the fusion decision and any contract-bearing code); module docs at build. **Gate 2:** AC-DET-01..06, AC-FP-01..02 pass against the Phase-1 oracle with manifest-conformant evidence; unit tests/lint/typecheck clean; fresh-context verifier passes. Commit.

### Phase 3, Containment + self-protection (workflow)
Build the containment module behind C2 consumption and the C5 policy contract: network isolation (persists on control-plane loss), process termination, share lockdown, each consulting the dial position and the action-classification matrix before executing (the dial is built INTO containment here, not bolted on later). Build the control-plane channel with mutual TLS + certificate identity; kernel-mode anti-tamper for the agent; deny-by-default kill-switch. Adversarial review mandatory (security-sensitive + contract-bearing). **Gate 3:** AC-CONT-01..04, AC-SEC-01..03 pass; containment p95 < 10s; isolation persists on partition; mTLS + anti-tamper verified. Commit.

### Phase 4, LLM orchestration layer, self-hosted, RAG (workflow)
Stand up on-premise serving (SGLang favored; vLLM acceptable) behind a model-agnostic abstraction; a 20-30B open-weight model as default; RAG over the IR playbook (scaffold a representative playbook from NIST 800-61/MITRE for the build); the faithfulness gate (claim-decomposition, attribution check, block/route-to-human on low faithfulness); structured JSON report/map/plan output behind C3; graceful degradation when the LLM is down. The LLM layer is advisory and cannot emit an ActionRecord. **Gate 4:** AC-LLM-01..03 and AC-FAIL-01 pass; faithfulness gate verified by a fresh-context evaluator; safe degradation verified. Commit.

### Phase 5, Command Dashboard (workflow)
Build the web dashboard surfaces (Command Overview, Incident Detail with blast-radius graph, Fleet and Hosts, System Health, Approval queue) on the frozen contracts; consume the Claude Design handoff bundle (tokens = visual truth; behavior = blueprint); reconcile and flag conflicts (never invent a contract to match a mockup or drop a designed element); bounded/paginated data; real-time updates; the dial control and approval queue wired to the autonomy subsystem. **Gate 5:** UI key flows work (browser-automation e2e), AC-A11Y passes, design-vs-contract reconciliation is clean, bounded-results AC-PERF-03 holds for fleet/host views. Commit.

### Phase 6, Closed-loop integration (Orchestrator, sequential), HACKATHON CHECKPOINT
Wire detect → contain → LLM → dashboard end to end; handle coupled cross-cutting concerns and shared state; run integration tests; demonstrate the full loop against the safe simulator. **This gate is the state that satisfies the hackathon** (the closed loop runs end-to-end and is demonstrable), but it is not a separate target, just a milestone on the path to bank-grade. **Gate 6:** integration tests pass, the app builds and boots, the full closed loop runs end-to-end against the simulator. Commit and tag `milestone(closed-loop-demoable)`.

### Phase 7, Autonomy + audit + dual-control subsystem (workflow)
Build the full governance layer behind C4 and C5: the four-position dial as runtime config (default monitor-only), the dual-control approval workflow for destructive actions, time-boxed actions with auto-rollback and one-click revert, and the immutable hash-chained WORM-capable exportable audit log (the substrate from Phase 0 now fully realized). Adversarial review mandatory (authz, audit integrity). **Gate 7:** AC-DIAL-01..05 and AC-AUDIT-01..05 pass; dial behavior verified at every position; audit passes immutability/attribution/24h-reconstruction/export; dual control enforced (negative tests included). Commit.

### Phase 8, Verification and repair (one looping workflow, the central gate)
Fan verification across the ENTIRE acceptance matrix (sections 8.1-8.11) using the testbed; fresh-context reviewers grade under the grounded-claims rule; failures spawn fix agents in worktrees inside the loop; if a fix touches a foundational artifact (a contract, the audit chain, a shared schema), re-verify the WHOLE matrix, not only the touched part (a foundational change can silently regress what passed). Evidence written per the manifest, parsed fail-closed. This is the anti-false-done core. **Gate 8 (hard, central):** every acceptance criterion passes with manifest-conformant evidence. No advance without evidence. Commit.

### Phase 9, Root-cause escalation (workflow, conditional)
Fires only when a failure resists the Phase-8 loop. Form independent hypotheses from disjoint evidence; a verifier-and-refuter panel; fix in worktrees; re-verify (the whole matrix if anything foundational changed). Folds back into Gate 8.

### Phase 10, Resilience + graceful degradation + 24/7 (workflow)
The enumerated failure-injection suite: LLM down, control-plane partition, agent crash, fanotify queue overflow, sustained-load memory soak; plus watchdog + auto-recovery + health checks. Prove the fail-safe invariant (degrade to monitor, never rogue destructive action) under every injected failure. **Gate 10 (hard):** AC-FAIL-01..06 pass; every dependency failure has a verified fallback; zero rogue actions under injection. Commit.

### Phase 11, Performance + resource + fleet-scale hardening (workflow)
Profile, then assert the budgets built in from Phase 2: agent overhead, detection throughput/latency, bounded memory under a synthetic fleet of ≥1,000 emulated endpoints, bounded/paginated results everywhere. Find and fix any unbounded load (the MedWatch class). **Gate 11 (hard):** AC-PERF-01..04 pass under the fleet fixture. Commit.

### Phase 12, Security hardening + self-protection deep audit + compliance verification (workflow)
Standard security (authn, authz, input validation, secrets, dependency CVE) PLUS the control-plane threat model (TALOS is the high-value target) PLUS full audit-subsystem compliance verification (OJK-style export, immutability, attribution). Adversarial review of the control plane. **Gate 12 (hard):** AC-SEC-01..06, AC-COMP-01..03 pass; zero open high/critical; the self-protection threat model (8.14) is addressed; the OJK/PDP mapping doc is present and reviewed. Commit.

### Phase 13, Aggressive adversarial wave audit (workflow, the capstone, authorized for wide fan-out)
With the system complete, spawn waves of specialized audit subagents to hunt unknown-unknowns: security bug-hunting, edge-case fuzzing, contract-conformance sweeps, false-positive hunting, race-condition hunting, and the enumerated red-team scenarios (disable-via-tamper/BYOVD, false-positive weaponization → wrongful-isolation DoS, RAG/LLM input poisoning). **Wave mechanics (correct the platform reality):** the concurrent-agent cap is 16, total 1,000 per run; "dozens to hundreds of agents" is achieved across MANY WAVES (16 at a time, batch → collect → synthesize → next wave), NOT 100 simultaneously (that would fail or melt the machine). Each subagent gets the four-part contract (objective, output format, tools/sources, boundaries, miss any and it drifts); subagents are scoped to light read/analysis work (bug-hunt, not heavy compilation) so a wide wave does not overheat the operator's machine; the Orchestrator dedups findings and a final pass synthesizes. Multi-agent is used HERE (parallel, independent audit) and deliberately NOT for core feature-building (Anthropic's own finding: multi-agent is poor for tightly-coupled coding). **Gate 13 (hard):** all findings triaged; high/critical closed and re-verified; AC-SEC-07 (red-team suite) all DEFENDED. Commit.

### Phase 14, Repo hygiene + as-built docs (workflow or sequential)
README, architecture docs (from the ADRs + implementation-architecture doc), API docs, runbook, CONTRIBUTING, changelog, license, semver. PLUS the bank operator runbook (so the bank IT team can run TALOS themselves: deployment, incident procedures, dial operation, audit export) and the air-gapped detonation SOP. Module docs already exist from build phases; this is the repo-level layer. **Gate 14 (hard):** AC-DOCS, AC-REPO, AC-SEMVER pass. Commit.

### Phase 15, Integration adapters + deploy + honest Report (Orchestrator, sequential; partially human-gated)
Build the SIEM/AD/EDR adapters against generic contracts + mocks (AC-INTEG); real BJB-instance wiring is human-gated and out of scope. Deploy to the team-controlled demo/staging target (the demoable closed loop + a monitor-mode-default pilot build), smoke-test the live target. **Precondition:** if the deploy CLI is not authenticated, STOP and ask the operator. Run the grounded-claims audit, then write `Report.md`: how close to the 99% ceiling, what is verified (with evidence), what is broken/unfinished, deviations from this blueprint and why, and what a human must still do (the BJB engagement items, the real-malware detonation testing, production deployment, driver-signing for Windows, OJK engagement). Production deployment to BJB is human-gated. **Gate 15 (hard for deploy):** the live demo/staging target is verified working before "deployed" is claimed; or tagged "build verified, BJB deploy human-gated" with the human items listed. Commit and tag the release.

### Partition, reviewer density, durability (apply throughout)
- **Partition into waves** no wider than the concurrent-agent cap (≈16); the unit is the smallest independently buildable/verifiable slice that respects a frozen-contract boundary; topologically sort by contract dependencies; synthesize at the barrier between waves; merge reviewed work onto the committed line at the Phase-2/3/etc. barriers so a stall loses only un-merged worktree work.
- **Reviewer density:** adversarial review mandatory on contract-bearing code, security-sensitive code (the agent, the control plane, the audit chain, the dial), shared/foundational artifacts, anything that failed a gate and was fixed, and the Phase-8 acceptance verification. Single-pass acceptable on leaf modules with no contract surface and no security exposure. The writer never signs off its own code.
- **Durability:** commit per gate (floor) and per reviewed wave inside long build phases; `.crown/progress.json` records passed gates + evidence pointers; on relaunch, re-verify the last gate against the real repo; `.crown/notes.md` carries lessons/deviations across sessions and into any future Mode-3 pass.
- **Model/budget:** every agent on the newest model within plan inclusion at highest autonomy (currently Opus 4.8, Fable 5 suspended, and the cyber-classifier would reroute it anyway); never route an agent down by default; the binding constraint is the weekly rate limit, answered by the durability mechanism, tight subagent scoping, reviewer density, and per-workflow token budgets; cost recorded in the progress file, never surfaced as an in-context countdown.

---

### Test strategy (the test pyramid and requirement-to-test mapping)

The verification stack, from narrowest/fastest to broadest/slowest. Every acceptance criterion in section 8 maps to one or more of these layers; each phase gate runs the relevant layers.

- **Unit tests.** Per-module logic: each detection signal (canary, entropy-delta, op-frequency, type/header, format-validation), the fusion decision, the dial state machine, the audit hash-chain, each contract serializer and validator. Threshold: AC-TEST-COV (>=80% lines, 100% on contract-bearing and critical paths).
- **Integration tests.** Across contract boundaries: agent→detection (C1), detection→containment (C2), control-plane→agent (C6), incident→LLM (C3), action→audit (C4). The closed-loop wiring (Phase 6). Gates 2 and 6.
- **End-to-end tests.** The full loop against the safe simulator (detect→contain→LLM→dashboard), driven through the real interfaces; dashboard flows via browser automation (Anthropic's finding: agents mark UI features done without true e2e, so e2e is mandatory). Gates 6 and 8.
- **Detection-efficacy tests.** The detection battery against the simulator's evasion matrix (full, intermittent modes, low-and-slow) and the benign-workload suite for false positives. The domain-specific verification. Gates 2 and 8.
- **Performance and load tests.** Containment latency p95, agent overhead, detection throughput and bounded memory under the synthetic fleet (>=1,000 endpoints), bounded and paginated results. Gate 11.
- **Chaos and failure-injection tests.** LLM down, control-plane partition, agent crash, queue overflow, memory soak; the fail-safe invariant under each. Gate 10.
- **Security and red-team tests.** Authn, authz, input validation, secrets, dependency CVE, plus the adversarial red-team suite (disable-via-tamper, false-positive weaponization, RAG poisoning) and the aggressive wave audit. Gates 12 and 13.
- **Migration and data-integrity tests.** Reversible, transactional migrations up and down on a fixture; the audit store never loses records. Gate 8.

Tests are derived from the locked criteria and are NOT author-mutable by worker subagents (verification-integrity deny). A skeptic reviewer checks that tests actually test the spec (not weakened or gamed). "Done" means these pass with evidence.

### Per-phase partition plan (concrete wave decomposition)

How each parallelizable phase decomposes into independently-buildable units batched into waves no wider than the concurrent-agent cap (about 16). The unit is the smallest slice respecting a frozen-contract boundary; dependent units wait for the synthesize barrier.

- **Phase 1 (test infra):** units = the simulator core, each evasion-mode module (full, intermittent variants, low-and-slow), the benign-workload generators (backup, compression, video, DB, FDE), the metrics collector, the report generator. Largely independent; one wave plus a synthesis pass.
- **Phase 2 (detection core):** units = each OS-monitoring backend (eBPF, minifilter, fanotify) behind C1, canary management, and each detection signal (entropy-delta, op-frequency, type/header, format-validation) plus the optional classifier; then the fusion decision (depends on all signals, built after the barrier). Signals in parallel (one wave), fusion sequential after.
- **Phase 3 (containment + self-protection):** units = network isolation, process termination, share lockdown, the dial-enforcement gate, the mTLS channel, the anti-tamper driver, the deny-by-default kill-switch. The dial-enforcement gate and the channel are foundational (built first); the three actuators in parallel after.
- **Phase 4 (LLM/RAG):** units = the serving abstraction, the RAG retriever, the faithfulness gate, each artifact generator (report, map, plan) behind C7, the degradation path. Retriever and serving first; generators and gate in parallel after.
- **Phase 5 (dashboard):** units = each surface (Command Overview, Incident Detail, Fleet/Hosts, System Health, Approval queue) behind the frozen contracts; largely independent (one wave) after the shared design-token and layout foundation.
- **Phase 7 (governance):** units = the dial manager, the dual-control approval workflow, the time-box and rollback mechanism, the audit hash-chain store, the export and reconstruction. The audit store is foundational (first); the rest in parallel after.
- **Phases 8, 10, 11, 12, 13 (verification, hardening, audit):** units = one acceptance criterion or check-category each (verification), one failure-injection scenario each (resilience), one hotpath or endpoint each (performance), one file or check-category each (security), one vulnerability-class or module each (the wave audit). These fan out widest; Phase 13 explicitly runs many waves of about 16 (total up to the per-run cap) for the aggressive audit.

Coupled glue (Phase 0 foundation, Phase 2 fusion, Phase 6 integration, Phase 15 deploy) is sequential, done by the Orchestrator between workflows, never fanned out.

---

## 10. Open Questions and Assumptions

Each carries the default the Orchestrator should assume so nothing blocks.

- **OQ-1, BJB engagement model: software licence only, or deploy + maintain + incident standby?** Unresolved; answerable only in a BJB conversation that has not happened. Default: build the product to be licensable AND operable by the bank's own IT team (the operator runbook in Phase 14 covers self-operation); treat real deployment/maintenance/standby as human-gated future work, not in this build. This does not block the build.
- **OQ-2, OJK stance on autonomous AI decision-making.** No specific rule found; firming up. Default: the dial (monitor-only default), dual control, time-boxed rollback, and immutable audit constitute the documented human-oversight posture; the compliance mapping states the gap honestly; engage OJK early. Does not block.
- **OQ-3, Production LLM model choice and GPU sizing.** Default: a 20-30B open-weight model on a single 48GB-class GPU for the build and the pilot; if the bank mandates a frontier on-prem model (DeepSeek-671B class), that requires an 8-GPU node and a re-run of the cost/break-even, flagged as a deployment-time decision, not a build blocker. The build uses a small self-hostable model (or a cloud API for dev/test convenience only).
- **OQ-4, Windows driver signing for the minifilter and anti-tamper driver.** Production Windows deployment needs a signed kernel driver (signing certificate). Default: dev/test uses test-signing; production driver signing is a deployment prerequisite flagged in the runbook, not a build blocker.
- **OQ-5, Product rename.** "TALOS" is a placeholder. Default: implement a single `PRODUCT_NAME` constant; the rename is a one-line change later; do not hardcode the name in user-facing strings.
- **OQ-6, Real-malware test results.** The detection battery in the build runs against the SAFE simulator only; results against real families come from the human-operated air-gapped lab (out of band). Default: the build proves detection against the simulator's evasion battery; the runbook enables the human team to validate against real samples; the Report states this boundary plainly.

**Standing assumptions:** Ghaisan's environment is Claude Max, MacBook Pro M2 Pro, Orchestrator launched with the bypass-permissions flag, Superpowers installed. The newest model within inclusion is currently Opus 4.8 (Fable 5 suspended). The team can stand up an air-gapped lab for real-malware testing. A representative IR playbook is acceptable for the build's RAG (the bank supplies the real one at deployment).

---

## 11. Traceability

A compact thread from vision → feature → contract → acceptance criterion, so nothing required is missing and nothing built is orphaned.

- **Core value: win the first seconds** → Features 1,2,5 (fusion detection, format validation, containment) → Contracts C1,C2,C5 → AC-DET-01..06, AC-CONT-01..03, AC-PERF-04.
- **Core value: almost never act wrongly** → Features 1,3,4 (fusion ≥2 signals, dial, dual control) → Contracts C2,C5 → AC-DET-05, AC-FP-01..02, AC-DIAL-01..05.
- **Core value: prove every action to an auditor** → Feature 7 (audit) → Contract C4 → AC-AUDIT-01..05, AC-COMP-02.
- **Core value: fail safe not dangerous** → Features 8,9 (self-protection, degradation) + the fail-safe invariant (ADR-005) → Contract C5 (deny-by-default) → AC-FAIL-01..06, AC-SEC-01..03.
- **Core value: deployable in a sovereign bank** → Feature 6 + ADR-002 (self-hosted LLM) → Contract C3 → AC-COMP-01..03, AC-LLM-01..03.
- **Detection robustness vs evasion** → Feature 2 (format validation) → C1 (`format_valid`) → AC-DET-02,03.
- **Scale claim (1,284 hosts)** → Feature 11 (fleet simulator) + bounded-resource invariant → AC-PERF-02,03.
- **Self-protection (high-value target)** → Feature 8 + threat model 8.14 → AC-SEC-01..07, AC-FAIL-02.
- **Operability by the bank** → Feature 12 + Phase 14 operator runbook → AC-DOCS, AC-INTEG.
- **The dial is what makes one build serve both goals** → ADR-003 → Feature 3 → C5 → AC-DIAL-01..05 (and it is why there is no second target/document).

**Definition of Done (rolled up):** every AC in section 8 passes with manifest-conformant evidence at its gate; the closed loop is demonstrable (Gate 6); the full bank-grade bar is met (Gates 7-15); `Report.md` honestly separates verified-working from human-gated-remaining. "Done" means these passed, not that an agent felt finished.
