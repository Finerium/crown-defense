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
import type { NextRequest } from 'next/server';
import { runScenario } from '../../../../lib/server/runner';
import { getDial, setChain, store } from '../../../../lib/server/store';
import type { AliranEvent } from '../../../../lib/server/types';

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
  const pollMs = envNum('TELEMETRI_POLL_MS', 400);

  let closed = false;
  req.signal.addEventListener('abort', () => {
    closed = true;
  });

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
            const pending = store.takePending();
            if (pending) {
              const startedAt = Date.now();
              store.setProgress({
                runId: pending.runId,
                scenarioId: pending.scenarioId,
                phase: 'berjalan',
                eventsEmitted: 0,
                filesTouched: 0,
                elapsedMs: 0,
              });
              try {
                const result = await runScenario(
                  pending.scenarioId,
                  getDial(),
                  (e) => {
                    send(e);
                    // Console-visible progress: counts only, never the verdict that produced them.
                    if (e.type === 'tik') {
                      store.setProgress({
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
                setChain(result.chain);
                store.setProgress({
                  runId: pending.runId,
                  scenarioId: pending.scenarioId,
                  phase: 'selesai',
                  eventsEmitted: result.summary.counts.eventsIngested,
                  filesTouched: result.summary.counts.filesTouched,
                  elapsedMs: Date.now() - startedAt,
                });
              } catch (err) {
                send({
                  type: 'galat',
                  at: new Date().toISOString(),
                  runId: pending.runId,
                  pesan: `Beban kerja gagal dijalankan: ${err instanceof Error ? err.message : 'kesalahan tidak dikenal'}`,
                });
                store.setProgress({
                  runId: pending.runId,
                  scenarioId: pending.scenarioId,
                  phase: 'selesai',
                  eventsEmitted: 0,
                  filesTouched: 0,
                  elapsedMs: Date.now() - startedAt,
                });
              }
              sinceHeartbeat = heartbeatMs;
              continue;
            }

            if (sinceHeartbeat >= heartbeatMs) {
              send({
                type: 'detak',
                at: new Date().toISOString(),
                seq: seq++,
                idle: true,
                dial: getDial(),
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
