import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

/**
 * Console session auth. DENY BY DEFAULT at every step.
 *
 * Accounts come from KONSOL_USERS, a JSON array of { email, label, salt, hash } where
 *   hash = scryptSync(password, salt, 64).toString('hex')
 * If KONSOL_USERS is missing, malformed, or empty, NOBODY can log in. There is no fallback account and
 * there is no bypass. Likewise, if KONSOL_SECRET is unset we refuse to issue OR accept any session.
 *
 * Nothing here logs a password, a hash, a salt or the secret.
 */

export const SESSION_COOKIE = 'konsol_sesi';

const KonsolUser = z.object({
  email: z.string().min(3),
  label: z.string().min(1),
  salt: z.string().min(8),
  hash: z.string().min(32),
});
type KonsolUser = z.infer<typeof KonsolUser>;

const DEFAULT_TTL_S = 8 * 60 * 60;
const REMEMBER_TTL_S = 30 * 24 * 60 * 60;

export interface Session {
  email: string;
  label: string;
  exp: number; // seconds since epoch
}

function users(): KonsolUser[] {
  const raw = process.env.KONSOL_USERS;
  if (!raw) return [];
  try {
    const parsed = z.array(KonsolUser).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return []; // unparseable config means nobody logs in, never means everybody does
  }
}

function secret(): string | null {
  const s = process.env.KONSOL_SECRET;
  return s && s.length >= 16 ? s : null;
}

function eq(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verify a password. Always runs one scrypt, even for an unknown email, so response time does not reveal
 * which accounts exist.
 */
export function verifyPassword(email: string, password: string): KonsolUser | null {
  const all = users();
  const found = all.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  const salt = found?.salt ?? 'garam-pengganti-waktu-tetap';
  const expected = Buffer.from(found?.hash ?? '00'.repeat(64), 'hex');
  const actual = scryptSync(password, salt, 64);
  const ok = eq(actual, expected);
  return ok && found ? found : null;
}

/* -------------------------------------------------------------------------- */
/* Signed cookie                                                               */
/* -------------------------------------------------------------------------- */

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function sign(value: string, key: string): string {
  return b64url(createHmac('sha256', key).update(value).digest());
}

export interface IssuedSession {
  value: string;
  maxAge: number;
}

/** Build the signed cookie value. Returns null when KONSOL_SECRET is unset (refuse to issue). */
export function issueSession(
  user: { email: string; label: string },
  remember: boolean
): IssuedSession | null {
  const key = secret();
  if (!key) return null;
  const maxAge = remember ? REMEMBER_TTL_S : DEFAULT_TTL_S;
  const exp = Math.floor(Date.now() / 1000) + maxAge;
  const value = b64url(Buffer.from(JSON.stringify({ email: user.email, label: user.label, exp }), 'utf8'));
  return { value: `${value}.${sign(value, key)}`, maxAge };
}

/** Cookie attributes shared by set and clear. `secure` is off only on plain-HTTP local dev. */
export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

/** Verify signature and expiry. Any doubt returns null. */
export function readSession(cookieValue: string | undefined | null): Session | null {
  const key = secret();
  if (!key || !cookieValue) return null;
  const dot = cookieValue.lastIndexOf('.');
  if (dot <= 0) return null;
  const value = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  if (!eq(Buffer.from(sig), Buffer.from(sign(value, key)))) return null;
  try {
    const parsed = z
      .object({ email: z.string(), label: z.string(), exp: z.number() })
      .safeParse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (!parsed.success) return null;
    if (parsed.data.exp * 1000 <= Date.now()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/** Every protected route calls this. No session means no access, with no second opinion. */
export function requireSession(req: Request): Session | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eqAt = part.indexOf('=');
    if (eqAt < 0) continue;
    if (part.slice(0, eqAt).trim() !== SESSION_COOKIE) continue;
    // A malformed percent-escape makes decodeURIComponent THROW, and this runs on every protected
    // route, so `Cookie: konsol_sesi=%` turned four gated endpoints into 500s. No access was granted,
    // but the highest-value auth path in the app must deny rather than throw: fail-safe means the
    // failure mode is a closed door, not an error page.
    let mentah: string;
    try {
      mentah = decodeURIComponent(part.slice(eqAt + 1).trim());
    } catch {
      return null;
    }
    return readSession(mentah);
  }
  return null;
}

/** For the /konsol server component: return the session or send the operator to the sign-in page. */
export async function requireSessionOrRedirect(to = '/konsol/masuk'): Promise<Session> {
  const jar = await cookies();
  const session = readSession(jar.get(SESSION_COOKIE)?.value);
  if (!session) redirect(to);
  return session;
}

/** True when the deployment is capable of authenticating anyone at all. Useful for an honest setup hint. */
export function authConfigured(): boolean {
  return secret() !== null && users().length > 0;
}
