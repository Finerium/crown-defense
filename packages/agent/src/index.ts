/**
 * @crown/agent — the endpoint agent's userspace monitoring backend (Phase 2). Observes a directory and
 * emits C1 telemetry with INDEPENDENTLY-computed entropy / structural-validity / magic-change, plus canary
 * (decoy) management for the fast-path. Production backends are eBPF (Linux) / minifilter (Windows),
 * ADR-006; this userspace poller is the light build option. It only PRODUCES C1 — it never decides.
 */
export { entropy, formatValid, inferType, magicChanged } from './inspect.js';
export { type ObserverOptions, FsObserver, extOf } from './observer.js';
export { type Canary, CanaryManager } from './canary.js';
