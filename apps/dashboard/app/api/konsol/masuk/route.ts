/**
 * Console sign-in. Deny by default: with KONSOL_USERS or KONSOL_SECRET unset, every attempt fails.
 * Rate limited per IP so the password check cannot be ground down. No password, hash or secret is logged.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE, cookieOptions, issueSession, verifyPassword } from '../../../../lib/server/auth';
import { callerIp, envLimit, limit } from '../../../../lib/server/ratelimit';
import type { MasukResponse } from '../../../../lib/server/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().min(3).max(200),
  password: z.string().min(1).max(400),
  ingatSaya: z.boolean().optional(),
});

const GAGAL = 'Email atau kata sandi salah.';

export async function POST(req: Request): Promise<NextResponse<MasukResponse>> {
  const gate = limit(
    `masuk:${callerIp(req)}`,
    envLimit('KONSOL_LOGIN_MAX', 5),
    envLimit('KONSOL_LOGIN_WINDOW_MS', 5 * 60 * 1000)
  );
  if (!gate.allowed) {
    return NextResponse.json(
      { ok: false, label: null, pesan: 'Terlalu banyak percobaan masuk. Coba lagi dalam beberapa menit.' },
      { status: 429 }
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, label: null, pesan: GAGAL }, { status: 400 });
  }

  const user = verifyPassword(parsed.data.email, parsed.data.password);
  if (!user) {
    return NextResponse.json({ ok: false, label: null, pesan: GAGAL }, { status: 401 });
  }

  const issued = issueSession(user, parsed.data.ingatSaya === true);
  if (!issued) {
    // KONSOL_SECRET is unset: refuse to issue a session rather than fall back to an unsigned one.
    return NextResponse.json(
      { ok: false, label: null, pesan: 'Sesi tidak dapat diterbitkan pada lingkungan ini.' },
      { status: 503 }
    );
  }

  const res = NextResponse.json<MasukResponse>({ ok: true, label: user.label, pesan: null });
  res.cookies.set(SESSION_COOKIE, issued.value, cookieOptions(issued.maxAge));
  return res;
}
