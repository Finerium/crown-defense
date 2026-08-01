/** Console sign-out: clear the session cookie. Always succeeds, so a stuck session is never a trap. */
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, cookieOptions } from '../../../../lib/server/auth';
import type { PesanResponse } from '../../../../lib/server/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse<PesanResponse>> {
  const res = NextResponse.json<PesanResponse>({ pesan: 'Sesi diakhiri.' });
  res.cookies.set(SESSION_COOKIE, '', cookieOptions(0));
  return res;
}
