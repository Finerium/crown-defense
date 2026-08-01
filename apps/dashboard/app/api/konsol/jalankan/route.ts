/**
 * ============================================================================
 * INVARIANT: THE CONSOLE HAS NO CODE PATH TO AN ALERT.
 * ============================================================================
 * Pressing a console button starts a workload and does nothing else. This route accepts a scenarioId,
 * validates it against the catalogue and enqueues a four-field WorkloadRequest. It returns exactly
 * { runId, accepted: true }: no verdict, no severity, no signal, no action, no message a UI could render
 * as an alert.
 *
 * The enforcement is architectural, not a promise:
 *   - this module does not import @crown/detection, @crown/containment, @crown/audit or ../lib/server/runner,
 *     and neither does anything it imports. ./scenarios imports @crown/simulator only; ./store imports
 *     node:fs and types. There is no reachable code here that can construct a DetectionVerdict.
 *   - WorkloadRequest has exactly four fields (runId, scenarioId, requestedAt, requestedBy). There is no
 *     field an alert could travel in.
 *   - the detection engine runs server side inside the telemetry stream (app/api/telemetri/aliran) and
 *     decides on its own from C1 telemetry. That route is the ONLY producer of a verdict.
 * ============================================================================
 */
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../../lib/server/auth';
import { envLimit, limit } from '../../../../lib/server/ratelimit';
import { SCENARIO_IDS } from '../../../../lib/server/scenarios';
import { store } from '../../../../lib/server/store';
import type { JalankanResponse, PesanResponse } from '../../../../lib/server/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  scenarioId: z.enum(SCENARIO_IDS as [string, ...string[]]),
});

export async function POST(req: Request): Promise<NextResponse<JalankanResponse | PesanResponse>> {
  const session = requireSession(req);
  if (!session) {
    return NextResponse.json({ pesan: 'Sesi tidak ditemukan. Silakan masuk kembali.' }, { status: 401 });
  }

  const perSession = limit(
    `jalankan:${session.email}`,
    envLimit('KONSOL_RUN_MAX', 6),
    envLimit('KONSOL_RUN_WINDOW_MS', 5 * 60 * 1000)
  );
  if (!perSession.allowed) {
    return NextResponse.json(
      { pesan: 'Terlalu banyak beban kerja dijalankan. Coba lagi beberapa menit lagi.' },
      { status: 429 }
    );
  }
  const global = limit(
    'jalankan:global',
    envLimit('KONSOL_RUN_GLOBAL_MAX', 40),
    envLimit('KONSOL_RUN_GLOBAL_WINDOW_MS', 60 * 60 * 1000)
  );
  if (!global.allowed) {
    return NextResponse.json(
      { pesan: 'Batas global per jam tercapai. Demo dijeda sementara untuk menjaga biaya.' },
      { status: 429 }
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ pesan: 'Skenario tidak dikenal.' }, { status: 400 });
  }

  const runId = `run-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
  const accepted = store.enqueue({
    runId,
    scenarioId: parsed.data.scenarioId,
    requestedAt: new Date().toISOString(),
    requestedBy: session.email,
  });
  if (!accepted) {
    return NextResponse.json(
      { pesan: 'Antrean beban kerja penuh. Tunggu proses berjalan selesai.' },
      { status: 429 }
    );
  }

  // Exactly this shape. Nothing else may ever be added to it.
  return NextResponse.json({ runId, accepted: true } satisfies JalankanResponse);
}
