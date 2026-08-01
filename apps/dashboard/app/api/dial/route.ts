/**
 * The autonomy dial. Four positions, Zod-validated against the frozen C5 enum, so a client can never set
 * an arbitrary string. Default MONITOR_ONLY (CROWN_DIAL_DEFAULT).
 *
 * GET is public so the dashboard can display the current position. POST requires a console session: the
 * dial gates destructive autonomous action, so moving it is an operator act, not a page visitor's.
 */
import { AutonomyMode } from '@crown/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../lib/server/auth';
import { getDial, setDial } from '../../../lib/server/store';
import type { DialResponse, PesanResponse } from '../../../lib/server/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ position: AutonomyMode });

export async function GET(): Promise<NextResponse<DialResponse>> {
  return NextResponse.json({ position: getDial() });
}

export async function POST(req: Request): Promise<NextResponse<DialResponse | PesanResponse>> {
  const session = requireSession(req);
  if (!session) {
    return NextResponse.json({ pesan: 'Mengubah dial otonomi memerlukan sesi operator.' }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ pesan: 'Posisi dial tidak dikenal.' }, { status: 400 });
  }
  setDial(parsed.data.position);
  return NextResponse.json({ position: getDial() });
}
