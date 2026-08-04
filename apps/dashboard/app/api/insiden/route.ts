/**
 * The incident history. Public on purpose.
 *
 * A judge who scans the QR gets the same list the presenter sees, from their own phone, without
 * spending a run or a rupiah of model credit. That is the point: a system has a past that anyone can
 * inspect, a mockup does not. Nothing here can start, change or approve anything.
 */
import { NextResponse } from 'next/server';
import { daftarInsiden } from '../../../lib/server/insiden';
import type { RingkasanInsiden } from '../../../lib/server/insiden';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<RingkasanInsiden[]>> {
  return NextResponse.json(await daftarInsiden());
}
