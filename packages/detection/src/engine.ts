import { type TelemetryEvent, majorVersionAccepted } from '@crown/contracts';
import { type DetectionConfig, loadConfig } from './config.js';
import { type DecisionResult, decide } from './fusion.js';

/**
 * Stateful detection engine. Maintains a BOUNDED rolling window of recent C1 events PER HOST (memory per
 * host capped at cfg.windowSize) AND a BOUNDED number of tracked hosts (cfg.maxTrackedHosts, LRU-evicted) —
 * so a churning/spoofing fleet cannot exhaust memory (bounded-resource invariant, in code not just doc).
 * Consumes ONLY C1 telemetry — never the oracle's ground truth (oracle independence).
 */
export class DetectionEngine {
  private cfg: DetectionConfig;
  private windows = new Map<string, TelemetryEvent[]>(); // insertion order == LRU order
  private verdictSeq = 0; // monotonic per engine; survives forget() so verdict_ids stay globally unique

  constructor(cfg: DetectionConfig = loadConfig()) {
    this.cfg = cfg;
  }

  /** Fold a C1 event into its host window and return the current verdict. Rejects unknown major versions. */
  ingest(event: TelemetryEvent): DecisionResult {
    if (!majorVersionAccepted(event.schema_version)) {
      throw new Error(`unsupported schema_version: ${event.schema_version}`);
    }
    const host = event.host_id;
    let win = this.windows.get(host);
    if (win) {
      this.windows.delete(host); // LRU touch: re-insert at the end
    } else {
      win = [];
      if (this.windows.size >= this.cfg.maxTrackedHosts) {
        const oldest = this.windows.keys().next().value; // evict least-recently-used host
        if (oldest !== undefined) this.windows.delete(oldest);
      }
    }
    win.push(event);
    if (win.length > this.cfg.windowSize) win.splice(0, win.length - this.cfg.windowSize); // bounded per host
    this.windows.set(host, win);
    this.verdictSeq++;
    return decide(win, this.cfg, {
      host_id: host,
      agent_id: event.agent_id,
      verdict_id: `vd-${host}-${this.verdictSeq}`,
      evidence_ref: event.event_id,
    });
  }

  /** Drop a host's window (e.g. after the host is contained/released). Keeps memory bounded. */
  forget(host_id: string): void {
    this.windows.delete(host_id);
  }

  /** Number of hosts currently tracked (for the fleet memory-bound assertion). */
  trackedHosts(): number {
    return this.windows.size;
  }
}
