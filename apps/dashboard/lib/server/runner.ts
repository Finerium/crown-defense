import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentContainment } from '@crown/agent';
import { computeRecordHash, sealRecord, verifyChain as verifyChainWithKey } from '@crown/audit';
import { type AuditSink, type CommandIssuer, ContainmentModule } from '@crown/containment';
import type { ActionRecord, AutonomyMode, DetectionVerdict, TelemetryEvent } from '@crown/contracts';
import { type DetectionConfig, DetectionEngine, ENV_KEYS, loadConfig } from '@crown/detection';
import { DEFAULT_ALLOWLIST, attackTelemetry, runBenignSuite } from '@crown/test-infra';
import { type Scenario, scenarioById, summarize } from './scenarios';
import type {
  AliranEvent,
  ChainVerificationResult,
  LatencyReport,
  RunCounts,
  SelesaiEvent,
  TamperDemoResult,
} from './types';

/**
 * The closed loop, run for real, on demand. This mirrors packages/test-infra/src/closed-loop.test.ts:
 *
 *   safe simulator / benign FP suite (C1 telemetry)
 *     -> real DetectionEngine (C2 verdict)
 *       -> real ContainmentModule under the dial (C4 record appended BEFORE the C6 command)
 *         -> real hash-chained audit records
 *
 * There is no demo-only detector anywhere in this file. Every verdict on the wire came out of
 * DetectionEngine.ingest(), and every containment decision came out of ContainmentModule.handleVerdict().
 * The only thing this module invents is the DELIVERY PACING (see PACING below).
 *
 * SAFETY: the safe simulator is benign, reversible, key-retaining, single-directory, non-propagating and
 * offline. Nothing here writes outside a freshly created directory under os.tmpdir(), which is removed
 * when the run ends. Real malware is never downloaded, built, stored or executed.
 */

/* -------------------------------------------------------------------------- */
/* Config (12-factor: every number below is env-driven with a sane default)     */
/* -------------------------------------------------------------------------- */

function envNum(key: string, dflt: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return dflt;
  const n = Number(raw);
  return Number.isFinite(n) ? n : dflt;
}

/** Target wall-clock length of one run, so a human can watch it unfold. */
const RUN_WINDOW_MS = () => envNum('CROWN_DEMO_RUN_WINDOW_MS', 7000);
const RUN_GAP_MIN_MS = () => envNum('CROWN_DEMO_TICK_MIN_MS', 60);
const RUN_GAP_MAX_MS = () => envNum('CROWN_DEMO_TICK_MAX_MS', 900);

/**
 * Detection config for the demo, straight from @crown/detection's env loader. One deviation from a bare
 * loadConfig({}): the AC-FP-02 process allow-list is operator configuration, and the legitimate full-disk
 * encryption scenario is defended by exactly nothing else. If the operator has not set CROWN_DET_ALLOWLIST
 * we seed the canonical list the FP oracle ships, so the demo reflects a configured deployment rather than
 * an unconfigured one. Env always wins. Every threshold is otherwise untouched.
 */
function detectionConfig(): DetectionConfig {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (!env[ENV_KEYS.allowlist]) env[ENV_KEYS.allowlist] = DEFAULT_ALLOWLIST.join(',');
  return loadConfig(env);
}

/**
 * HMAC key for the audit chain. Prefer the deployment's real key; otherwise mint a random per-PROCESS one.
 *
 * It hangs off globalThis rather than a module-level variable because Next gives each route its own module
 * instance: a per-module key would seal the chain in the telemetry stream and then fail to verify it in
 * /api/audit/verifikasi. globalThis is shared by every route in the process, so the key is too.
 *
 * ponytail: ephemeral key, never a constant. A constant integrity key makes the chain forgeable by anyone
 * who can read this file, so the fallback is minted per process and never written down.
 *
 * The fallback is a fallback. Any deployment where the chain crosses a process boundary MUST set
 * AUDIT_INTEGRITY_KEY, because a chain sealed with one process's random key cannot be verified by
 * another, and an unverifiable audit chain is worse than no chain. On Vercel that is every deployment:
 * the telemetry stream seals the chain into the shared store and /api/audit/verifikasi reads it back in a
 * different Function invocation. The key is read from env here and never logged, returned or persisted.
 */
const KEY_SLOT = Symbol.for('crown.demo.auditIntegrityKey');
function integrityKey(): string {
  const fromEnv = process.env.AUDIT_INTEGRITY_KEY;
  if (fromEnv) return fromEnv;
  const g = globalThis as Record<symbol, unknown>;
  if (typeof g[KEY_SLOT] !== 'string') g[KEY_SLOT] = randomBytes(32).toString('hex');
  return g[KEY_SLOT] as string;
}

const LATENCY_LABELS: LatencyReport['labels'] = {
  detection_wall_ms: {
    id: 'Jam dinding nyata mesin deteksi, dari ingest pertama sampai ingest yang menghasilkan verdik destruktif, dikurangi jeda tayang. Ini latensi pemrosesan yang benar-benar diukur.',
    en: 'Measured wall clock of the real detection engine, first ingest to the ingest that returned the destructive verdict, with the delivery pacing subtracted. This is real processing latency.',
  },
  detection_timeline_ms: {
    id: 'Selisih emitted_at antara peristiwa telemetri pertama dan peristiwa yang memicu verdik. Ini latensi pada LINI MASA SIMULASI, bukan angka produksi yang diukur.',
    en: 'Delta between the emitted_at of the first telemetry event and the event that produced the verdict. This is latency on the SIMULATED timeline, not a measured production number.',
  },
  containment_wall_ms: {
    id: 'Jam dinding nyata dari verdik sampai hasil akhir kontainmen, termasuk penulisan catatan audit dan penerbitan perintah.',
    en: 'Measured wall clock from the verdict to the terminal containment outcome, including the audit append and the command issue.',
  },
  paced_out_ms: {
    id: 'Total jeda tayang yang dikurangkan dari detection_wall_ms. Hanya pengaturan kecepatan tayang, tidak pernah mengubah data.',
    en: 'Total delivery pacing subtracted from detection_wall_ms. Pacing changes delivery speed only, never the data.',
  },
};

function emptyLatency(): LatencyReport {
  return {
    detection_wall_ms: null,
    detection_timeline_ms: null,
    containment_wall_ms: null,
    paced_out_ms: 0,
    labels: LATENCY_LABELS,
  };
}

/* -------------------------------------------------------------------------- */
/* Telemetry production                                                        */
/* -------------------------------------------------------------------------- */

const MUTATION_EVENTS = new Set([
  'FILE_WRITE',
  'FILE_CREATE',
  'FILE_RENAME',
  'FILE_DELETE',
  'FILE_TYPE_CHANGED',
  'CANARY_TOUCHED',
]);

/**
 * Produce the run's C1 stream from the real oracles.
 *
 * Attack: attackTelemetry() from @crown/test-infra drives the SafeSimulator inside its OWN mkdtemp
 * directory and removes it before returning, so no scratch dir is needed here.
 *
 * Benign: runBenignSuite(dir, variant) runs ALL EIGHT benign workloads into `dir` and we keep the single
 * BenignRun whose .workload matches the scenario. Yes, that produces seven runs we throw away. That is
 * deliberate: it keeps the FP oracle package completely untouched, which is worth far more than the few
 * milliseconds it costs.
 */
async function telemetryFor(s: Scenario, scratch: string): Promise<TelemetryEvent[]> {
  if (s.kind === 'serangan') {
    return attackTelemetry(s.family, { plantCanary: s.plantCanary, seeds: s.seeds });
  }
  const runs = await runBenignSuite(scratch, 0);
  const run = runs.find((r) => r.workload === s.workload);
  if (!run) {
    throw new Error(
      `benign suite produced no run for workload '${s.workload}'. The @crown/test-infra FP oracle no longer ships this workload, so the scenario cannot be produced by the real oracle.`
    );
  }
  return run.events;
}

/**
 * Relabel the identity fields so the whole chain (verdict -> action record -> command) carries the
 * scenario's fleet host instead of the oracle's fixture host. Identity ONLY: no signal-bearing field is
 * touched. entropy_read, entropy_write, format_valid, header_changed, canary and op_window all arrive at
 * the engine exactly as the oracle produced them.
 */
function relabel(events: TelemetryEvent[], host: string): TelemetryEvent[] {
  return events.map((e) => ({ ...e, host_id: host, agent_id: `agent-${host}` }));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
/* The run                                                                     */
/* -------------------------------------------------------------------------- */

export interface RunResult {
  runId: string;
  summary: SelesaiEvent;
  chain: ActionRecord[];
}

export interface RunOptions {
  runId?: string;
  /** Aborting stops the loop between ticks. The scratch directory is still removed. */
  signal?: AbortSignal;
}

export async function runScenario(
  scenarioId: string,
  dial: AutonomyMode,
  onEvent: (e: AliranEvent) => void,
  opts: RunOptions = {}
): Promise<RunResult> {
  const s = scenarioById(scenarioId);
  if (!s) throw new Error(`unknown scenarioId: ${scenarioId}`);
  const runId = opts.runId ?? `run-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;

  // Freshly made scratch directory, removed in the finally below. Nothing writes outside it.
  const scratch = await mkdtemp(join(tmpdir(), 'crown-demo-'));
  let scratchRemoved = false;
  try {
    const raw = await telemetryFor(s, scratch);
    const stream = relabel(raw, s.host);

    // PACING. The data is never faked; only its DELIVERY is slowed so a person can watch the signals
    // light up. gap = target window / event count, clamped, so any event count lands in the window.
    const gap = Math.min(
      RUN_GAP_MAX_MS(),
      Math.max(RUN_GAP_MIN_MS(), Math.round(RUN_WINDOW_MS() / Math.max(1, stream.length)))
    );

    onEvent({
      type: 'mulai',
      runId,
      at: new Date().toISOString(),
      scenario: summarize(s),
      dial,
      totalEvents: stream.length,
      pacingGapMs: gap,
    });

    const engine = new DetectionEngine(detectionConfig());
    const chain: ActionRecord[] = [];
    const counts: RunCounts = { eventsIngested: 0, filesTouched: 0, writes: 0, renames: 0 };
    const touchedPaths = new Set<string>();
    const latency = emptyLatency();

    let verdict: DetectionVerdict | null = null;
    let suppressionAtVerdict: string | null = null;
    let lastVerdictLabel: DetectionVerdict['verdict'] = 'BENIGN';
    let containmentExecuted = false;
    let disposition: SelesaiEvent['disposition'] = null;

    const t0 = Date.now();
    let pacedMs = 0;

    for (let i = 0; i < stream.length; i++) {
      if (opts.signal?.aborted) break;
      if (i > 0) {
        const p0 = Date.now();
        await sleep(gap);
        pacedMs += Date.now() - p0; // measured, not assumed, so the subtraction below is auditable
      }

      const ev = stream[i] as TelemetryEvent;
      const res = engine.ingest(ev);
      const tIngest = Date.now();

      counts.eventsIngested++;
      if (MUTATION_EVENTS.has(ev.event_type)) touchedPaths.add(ev.file.path ?? `#${i}`);
      if (ev.event_type === 'FILE_WRITE' || ev.event_type === 'FILE_CREATE') counts.writes++;
      if (ev.event_type === 'FILE_RENAME') counts.renames++;
      counts.filesTouched = touchedPaths.size;
      lastVerdictLabel = res.verdict.verdict;

      onEvent({
        type: 'tik',
        runId,
        at: new Date().toISOString(),
        index: i,
        eventType: ev.event_type,
        filePath: ev.file.path ?? null,
        emittedAt: ev.emitted_at,
        signals: res.verdict.signals,
        verdict: res.verdict.verdict,
        recommendedAction: res.verdict.recommended_action,
        confidence: res.verdict.confidence,
        corroboratingCount: res.verdict.corroborating_count,
        fastPath: res.verdict.fast_path,
        suppressedByAllowlist: res.suppressedByAllowlist,
        suppressionReason: res.suppressionReason,
        counts: { ...counts },
      });

      if (verdict === null && res.verdict.verdict === 'MASS_ENCRYPTION') {
        verdict = res.verdict;
        suppressionAtVerdict = res.suppressionReason;
        latency.paced_out_ms = pacedMs;
        latency.detection_wall_ms = Math.max(0, tIngest - t0 - pacedMs);
        latency.detection_timeline_ms =
          Date.parse(ev.emitted_at) - Date.parse((stream[0] as TelemetryEvent).emitted_at);

        onEvent({
          type: 'putusan',
          runId,
          at: new Date().toISOString(),
          index: i,
          verdict,
          latency: { ...latency },
        });

        // === the real containment path, wired exactly as closed-loop.test.ts wires it ===
        const audit: AuditSink = {
          async append(rec) {
            const tail = chain.length
              ? {
                  chain_seq: (chain[chain.length - 1] as ActionRecord).chain_seq,
                  record_hash: (chain[chain.length - 1] as ActionRecord).record_hash,
                }
              : null;
            const sealed = sealRecord(rec, tail, integrityKey());
            chain.push(sealed);
            onEvent({
              type: 'audit',
              runId,
              at: new Date().toISOString(),
              record: sealed,
              chainLength: chain.length,
            });
            return sealed;
          },
        };
        const agent = new AgentContainment(verdict.agent_id);
        const issuer: CommandIssuer = {
          async issue(cmd) {
            return agent.execute(cmd);
          },
        };
        const cm = new ContainmentModule({ audit, issuer });

        const cStart = Date.now();
        // The dial comes from the caller. At MONITOR_ONLY the module decides NOT to execute and the
        // reason below is the module's own string, verbatim. Nothing here synthesises a message.
        const out = await cm.handleVerdict(verdict, dial, true, {
          incidentId: runId,
          // Carry the allow-list reason into the permanent record, so "the suppression is auditable"
          // becomes true of the exported chain and not just of an SSE frame nobody keeps.
          suppressionReason: suppressionAtVerdict,
        });
        latency.containment_wall_ms = Date.now() - cStart;

        containmentExecuted = out.result?.outcome === 'EXECUTED';
        disposition = out.decision.disposition;

        onEvent({
          type: 'kontainmen',
          runId,
          at: new Date().toISOString(),
          decision: out.decision,
          executed: containmentExecuted,
          outcome: out.result?.outcome ?? null,
          outcomeReason: out.result?.reason ?? null,
          actionRecordId: out.actionRecordId,
          command: out.command
            ? {
                command_id: out.command.command_id,
                command_type: out.command.command_type,
                target_host_id: out.command.target_host_id,
                action_record_id: out.command.authorization.action_record_id,
                rollback_deadline: out.command.rollback_deadline,
              }
            : null,
        });
      }
    }

    await rm(scratch, { recursive: true, force: true });
    scratchRemoved = true;

    const summary: SelesaiEvent = {
      type: 'selesai',
      runId,
      at: new Date().toISOString(),
      scenarioId: s.id,
      finalVerdict: verdict ? 'MASS_ENCRYPTION' : lastVerdictLabel,
      destructiveVerdictReached: verdict !== null,
      containmentExecuted,
      disposition,
      auditChainLength: chain.length,
      auditHeadHash: chain.length ? (chain[chain.length - 1] as ActionRecord).record_hash : null,
      counts: { ...counts },
      latency: { ...latency },
      scratchRemoved,
    };
    onEvent(summary);
    return { runId, summary, chain };
  } finally {
    if (!scratchRemoved) await rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
}

/* -------------------------------------------------------------------------- */
/* Audit verification + tamper demonstration                                   */
/* -------------------------------------------------------------------------- */

/** Recompute and verify a chain with the real @crown/audit verifier. No hashing is reimplemented here. */
export function verifyChain(records: ActionRecord[]): ChainVerificationResult {
  return verifyChainWithKey(records, integrityKey());
}

/**
 * Tamper demonstration. Copies the chain, mutates ONE record's `detail`, and reports which link breaks.
 * The real chain is never touched: every record is copied before mutation.
 */
export function tamperDemo(records: ActionRecord[]): TamperDemoResult {
  const before = verifyChain(records);
  if (records.length === 0) {
    return {
      mutatedIndex: -1,
      mutatedChainSeq: null,
      mutatedField: 'detail',
      before,
      after: before,
      link: null,
    };
  }
  const idx = Math.min(1, records.length - 1); // a middle link where possible, so the break is visible
  const copy: ActionRecord[] = records.map((r) => ({ ...r }));
  const target = copy[idx] as ActionRecord;
  const mutated: ActionRecord = { ...target, detail: `${target.detail ?? ''} [DIUBAH]`.trim() };
  copy[idx] = mutated;

  const after = verifyChain(copy);
  const next = copy[idx + 1] ?? null;
  return {
    mutatedIndex: idx,
    mutatedChainSeq: mutated.chain_seq,
    mutatedField: 'detail',
    before,
    after,
    link: {
      chain_seq: mutated.chain_seq,
      expected_record_hash: computeRecordHash(mutated, integrityKey()),
      stored_record_hash: mutated.record_hash,
      next_stored_prev_hash: next ? next.prev_hash : null,
    },
  };
}
