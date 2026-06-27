# Architecture Decision Records

ADR-001 … ADR-015 are **LOCKED** in blueprint section 5.2/5.4 and MUST NOT be relitigated. They are
summarized here for in-repo reference; the blueprint is the source of truth. ADR-016+ are decisions the
build makes within the locked bounds (see `../architecture.md`).

| ADR | Decision (locked) |
|---|---|
| ADR-001 | Multi-signal fusion with canary fast-path; ≥2 corroborating signals for any destructive verdict; format-validation counters intermittent encryption |
| ADR-002 | Self-hosted on-prem open-weight LLM; model-agnostic; cloud (DeepSeek) only for dev/test, never production |
| ADR-003 | Autonomy as a runtime 4-position dial + action-classification matrix; default MONITOR_ONLY; dual control for destructive |
| ADR-004 | Immutable, hash-chained, exportable audit subsystem as a first-class component; substrate exists before the first action |
| ADR-005 | Fail-safe invariant: reasoning-layer/control-plane failure degrades to monitor, never escalates to destructive action |
| ADR-006 | OS-level monitoring: eBPF (Linux) + minifilter (Windows); fanotify acceptable for a light Linux build |
| ADR-007 | mTLS + certificate identity; anti-tamper agent; hardened control plane; signed staged updates |
| ADR-008 | RAG over the IR playbook + a faithfulness gate; no fine-tuning in this build |
| ADR-009 | Build-harness model stance: newest-within-inclusion at highest autonomy (Opus 4.8 today) |
| ADR-010 | Canary placement/management: multiple canaries per host, early/late-sorting names, realistic types |
| ADR-011 | Entropy sampling as a read-vs-write delta at the same offset (Redemption method) |
| ADR-012 | Control-plane topology: centralized, agent-survivable, HA-capable |
| ADR-013 | Separate the immutable audit store from the mutable operational store |
| ADR-014 | Fleet-scale validation via synthetic telemetry, not physical machines |
| ADR-015 | Agent update mechanism: signed, staged, fail-safe |
| **ADR-016** | **Implementation architecture (this build): pnpm + TypeScript-strict monorepo. See `../architecture.md`.** |
