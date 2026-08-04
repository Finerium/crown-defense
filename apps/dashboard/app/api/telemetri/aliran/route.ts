/**
 * The telemetry stream. THE ONLY PLACE A VERDICT CAN COME FROM.
 *
 * Public Server-Sent Events. It heartbeats an idle baseline continuously, so the dashboard is visibly
 * alive and completely boring before anything happens. When a pending workload request appears in the
 * store it runs the real closed loop (runScenario) and streams the real ticks, the real C2 verdict, the
 * real containment decision, the real hash-chained audit records and the measured latencies.
 *
 * Nothing the console sent influences what is streamed beyond WHICH workload runs. The detection engine
 * runs here, server side, inside the telemetry stream, and decides on its own from C1 telemetry.
 *
 * Node runtime, not edge: SSE works fine on the default Node runtime on Vercel and the runner needs
 * node:fs and node:crypto.
 */
import { randomBytes } from 'node:crypto';
import type { ActionRecord } from '@crown/contracts';
import type { NextRequest } from 'next/server';
import { type CatatanInsiden, simpanInsiden } from '../../../../lib/server/insiden';
import { runScenario } from '../../../../lib/server/runner';
import { scenarioById, summarize } from '../../../../lib/server/scenarios';
import { claimRun, getDial, publishRun, readRun, setChain, store } from '../../../../lib/server/store';
import type { AliranEvent, SelesaiEvent } from '../../../../lib/server/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function envNum(key: string, dflt: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return dflt;
  const n = Number(raw);
  return Number.isFinite(n) ? n : dflt;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function GET(req: NextRequest): Promise<Response> {
  const encoder = new TextEncoder();
  const heartbeatMs = envNum('TELEMETRI_HEARTBEAT_MS', 2000);
  // Each poll is a Runtime Cache round trip on Vercel, so this trades button-press latency against cache
  // traffic: fast enough that a press shows up while the presenter's finger is still on the mouse, slow
  // enough not to hammer the cache for the whole length of an idle stream.
  const pollMs = envNum('TELEMETRI_POLL_MS', 750);
  // How long a broadcast that never finished blocks the next run before it is treated as dead.
  const runGuardMs = envNum('TELEMETRI_RUN_GUARD_MS', 30000);
  // How often the executing stream republishes an in-flight run for everyone else to follow.
  const SIAR_FLUSH_MS = envNum('TELEMETRI_SIAR_MS', 400);

  let closed = false;
  req.signal.addEventListener('abort', () => {
    closed = true;
  });

  // No lease and no token: see store.publishRun for why every exclusivity scheme failed here. Exactly one
  // stream executes a given run because takePending() is a pop, and every stream replays the run from the
  // broadcast, so it does not matter which one won.
  const streamId = `s-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  // True only while THIS stream is the one executing. Informational, it gates nothing.
  let aktif = false;
  // Replay bookkeeping for runs this stream did not execute itself.
  let seenRunId: string | null = null;
  let seenIndex = 0;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (e: AliranEvent): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true; // client vanished mid-write
        }
      };

      const pump = async (): Promise<void> => {
        let seq = 0;
        let sinceHeartbeat = heartbeatMs; // beat immediately so a new client sees life at once
        try {
          while (!closed) {
            // ONE RUN ON THE WIRE AT A TIME. publishRun writes a single shared key, so two runs that
            // overlap overwrite each other's broadcast. Measured on production: a six-event run was
            // clobbered mid-flight by a thirty-six-event run, and NO viewer, not even the executor's own
            // dashboard, received its last three ticks or its `selesai`. The Live tab invites exactly
            // this by asking for the same workload twice at two dial positions. Runs now wait their turn
            // instead of overlapping. The guard is time-boxed so an executor that dies cannot wedge it.
            const siaran = await readRun();
            const sedangSiar = siaran !== null && !siaran.done && Date.now() - siaran.at < runGuardMs;
            const pending = sedangSiar ? null : await store.takePending();
            // Two streams can still pop the same request; arbitrate before spending a simulator run on
            // it. The loser drops it because the winner is already holding the identical request.
            if (pending && !(await claimRun(pending.runId, streamId))) continue;
            if (pending) {
              aktif = true;
              // Buffer every event so passive dashboards can replay this run. Flushed on a timer and at
              // each milestone, never once per tick, so a run costs a handful of cache writes not forty.
              const siar: unknown[] = [];
              let dialSaatMulai: Awaited<ReturnType<typeof getDial>> = 'MONITOR_ONLY';
              let lastFlush = 0;
              const flush = (done: boolean): void => {
                void publishRun(pending.runId, [...siar], done);
                lastFlush = Date.now();
              };
              const startedAt = Date.now();
              await store.setProgress({
                runId: pending.runId,
                scenarioId: pending.scenarioId,
                phase: 'berjalan',
                eventsEmitted: 0,
                filesTouched: 0,
                elapsedMs: 0,
              });
              try {
                dialSaatMulai = await getDial();
                const result = await runScenario(
                  pending.scenarioId,
                  dialSaatMulai,
                  (e) => {
                    send(e);
                    siar.push(e);
                    // Milestones go out immediately; ticks ride the timer.
                    if (e.type !== 'tik' || Date.now() - lastFlush >= SIAR_FLUSH_MS) flush(false);
                    // Console-visible progress: counts only, never the verdict that produced them.
                    // Not awaited: onEvent is synchronous, and the run must never wait on the store. The
                    // local layer is written before setProgress yields, so only the shared write is
                    // deferred, and every write is a whole snapshot of monotonic counters.
                    if (e.type === 'tik') {
                      void store.setProgress({
                        runId: pending.runId,
                        scenarioId: pending.scenarioId,
                        phase: 'berjalan',
                        eventsEmitted: e.index + 1,
                        filesTouched: e.counts.filesTouched,
                        elapsedMs: Date.now() - startedAt,
                      });
                    }
                  },
                  { runId: pending.runId, signal: req.signal }
                );
                flush(true); // final state, so a late viewer sees the whole run rather than a truncated one
                // Only a run that actually sealed something may replace the shared chain. The three
                // legitimate workloads never reach a destructive verdict, so result.chain is empty for
                // them, and writing it unconditionally wiped the attack chain a judge had just watched
                // being sealed: the natural "now run a benign workload, now verify the chain" sequence
                // returned count 0 and a tamper demo with nothing to tamper with.
                if (result.chain.length > 0) await setChain(result.chain);
                // RECORD THE INCIDENT. Everything above this line is ephemeral: the stream frames vanish
                // when the socket closes and the shared chain is overwritten by the next run. This is the
                // only thing that outlives the session, which is what makes "we ran five attacks, where
                // are the records" answerable at all. Fails soft on purpose.
                //
                // AWAITED, not fire-and-forget. A blob write takes 150-300 ms and the previous `void`
                // left it racing the end of the function. The most common thing a viewer does is close
                // the tab the moment a run finishes, and the run they close on is the one that just
                // happened, which is precisely the record worth keeping. simpanInsiden never throws.
                await simpanInsiden(buatCatatan(pending.scenarioId, dialSaatMulai, result, siar));
                await store.setProgress({
                  runId: pending.runId,
                  scenarioId: pending.scenarioId,
                  phase: 'selesai',
                  eventsEmitted: result.summary.counts.eventsIngested,
                  filesTouched: result.summary.counts.filesTouched,
                  elapsedMs: Date.now() - startedAt,
                });
              } catch (err) {
                flush(true);
                send({
                  type: 'galat',
                  at: new Date().toISOString(),
                  runId: pending.runId,
                  pesan: `Beban kerja gagal dijalankan: ${err instanceof Error ? err.message : 'kesalahan tidak dikenal'}`,
                });
                await store.setProgress({
                  runId: pending.runId,
                  scenarioId: pending.scenarioId,
                  phase: 'selesai',
                  eventsEmitted: 0,
                  filesTouched: 0,
                  elapsedMs: Date.now() - startedAt,
                });
              }
              aktif = false;
              seenRunId = pending.runId; // already delivered live; never replay our own run
              seenIndex = siar.length;
              sinceHeartbeat = heartbeatMs;
              continue;
            }

            // Follow a run this stream did not execute. This is what makes a second dashboard, a judge's
            // phone, or a stream that connected mid-run see the same thing the presenter sees.
            if (siaran && siaran.events.length > 0) {
              if (siaran.runId !== seenRunId) {
                seenRunId = siaran.runId;
                // Join a run in progress from the beginning so the story still makes sense. A run that
                // was already finished before we arrived is NOT replayed, or every new tab would watch
                // an old attack unfold as if it were happening now.
                seenIndex = siaran.done ? siaran.events.length : 0;
              }
              while (seenIndex < siaran.events.length && !closed) {
                send(siaran.events[seenIndex] as AliranEvent);
                seenIndex++;
              }
              if (seenIndex < siaran.events.length) sinceHeartbeat = heartbeatMs;
            }

            if (sinceHeartbeat >= heartbeatMs) {
              send({
                type: 'detak',
                at: new Date().toISOString(),
                seq: seq++,
                idle: true,
                dial: await getDial(),
                aktif,
              });
              sinceHeartbeat = 0;
            }
            await sleep(pollMs);
            sinceHeartbeat += pollMs;
          }
        } finally {
          try {
            controller.close();
          } catch {
            /* already closed by the client disconnecting */
          }
        }
      };

      void pump();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

/**
 * Assemble the permanent record from what the run already produced. Nothing here is recomputed or
 * guessed: the verdict fields come from the putusan frame the engine emitted, the chain comes from the
 * containment module, and the timestamps are the UTC ones the contracts require. WIB is applied by the
 * UI at render time and never stored.
 */
function buatCatatan(
  scenarioId: string,
  dialAtStart: Awaited<ReturnType<typeof getDial>>,
  result: { runId: string; summary: SelesaiEvent; chain: ActionRecord[] },
  siar: unknown[]
): CatatanInsiden {
  const sc = scenarioById(scenarioId);
  const ring = sc ? summarize(sc) : null;
  const frames = siar as AliranEvent[];
  const mulai = frames.find((e) => e.type === 'mulai');
  const putusan = frames.find((e) => e.type === 'putusan');
  const tikTerakhir = [...frames].reverse().find((e) => e.type === 'tik');
  const kontainmen = frames.find((e) => e.type === 'kontainmen');
  const v = putusan?.verdict ?? null;

  return {
    runId: result.runId,
    scenarioId,
    scenarioLabel: ring?.labelId ?? scenarioId,
    group: (ring?.group ?? 'serangan') as 'serangan' | 'sah',
    host: ring?.host ?? '',
    segment: ring?.segment ?? '',
    family: ring?.family ?? null,
    mode: ring?.mode ?? null,
    startedAtUtc: mulai?.at ?? result.summary.at,
    finishedAtUtc: result.summary.at,
    dialAtStart,
    finalVerdict: result.summary.finalVerdict,
    destructiveVerdictReached: result.summary.destructiveVerdictReached,
    corroboratingCount: v ? v.corroborating_count : null,
    fastPath: v ? v.fast_path : null,
    signalsFired: v ? v.signals.filter((x) => x.fired).map((x) => x.signal_type) : [],
    suppressedByAllowlist: tikTerakhir?.suppressedByAllowlist ?? false,
    suppressionReason: tikTerakhir?.suppressionReason ?? null,
    disposition: result.summary.disposition,
    containmentExecuted: result.summary.containmentExecuted,
    commandIssued: kontainmen?.command != null,
    filesTouched: result.summary.counts.filesTouched,
    eventsIngested: result.summary.counts.eventsIngested,
    detectionWallMs: result.summary.latency.detection_wall_ms,
    containmentWallMs: result.summary.latency.containment_wall_ms,
    chain: result.chain,
    chainHeadHash: result.summary.auditHeadHash,
    scratchRemoved: result.summary.scratchRemoved,
  };
}
