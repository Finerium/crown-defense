/**
 * The scenario catalogue the console renders its buttons from. Labels, hosts, families and honesty notes
 * only. See the invariant banner in ../jalankan/route.ts: nothing here is a verdict.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/server/auth';
import { CATALOGUE } from '../../../../lib/server/scenarios';
import type { PesanResponse, ScenarioSummary } from '../../../../lib/server/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse<ScenarioSummary[] | PesanResponse>> {
  const session = requireSession(req);
  if (!session) {
    return NextResponse.json({ pesan: 'Sesi tidak ditemukan. Silakan masuk kembali.' }, { status: 401 });
  }
  return NextResponse.json(CATALOGUE);
}
