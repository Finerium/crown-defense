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

export async function GET(): Promise<
  NextResponse<{ lapis: string; baris: RingkasanInsiden[] } | { pesan: string }>
> {
  const { status, rows } = await daftarInsiden();
  // The response names its own tier. 'hidup' is durable storage, 'sesi' is the bounded fallback, and the
  // UI states the difference rather than presenting weaker data as if it were the stronger kind.
  // 'gagal' is a 503, because "nothing has happened yet" and "the record store is down" must never look
  // identical to a reader.
  if (status === 'gagal') {
    return NextResponse.json(
      { pesan: 'Penyimpanan catatan insiden sedang tidak dapat dihubungi.' },
      { status: 503 }
    );
  }
  return NextResponse.json({ lapis: status, baris: rows });
}
