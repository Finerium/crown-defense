/**
 * Workload progress ONLY. See the invariant banner in ../jalankan/route.ts.
 *
 * KonsolStatus has no verdict field, no severity field and no action field, and must never gain one. The
 * console genuinely does not know what the detection engine decided about the telemetry it produced.
 * Returns null when no run has been requested yet.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/server/auth';
import { store } from '../../../../lib/server/store';
import type { KonsolStatus, PesanResponse } from '../../../../lib/server/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse<KonsolStatus | null | PesanResponse>> {
  const session = requireSession(req);
  if (!session) {
    return NextResponse.json({ pesan: 'Sesi tidak ditemukan. Silakan masuk kembali.' }, { status: 401 });
  }
  return NextResponse.json(await store.getProgress());
}
