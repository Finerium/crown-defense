/**
 * PROOF OF LIFE. Numbers a mockup would not bother to have.
 *
 * The owner of this product suspected his own DeepSeek integration was fake. He was wrong, but the
 * suspicion was fair: the interface asserted "LIVE" in words and offered nothing checkable. Words are
 * not evidence.
 *
 * So this route publishes things that are cheap for a real deployment to know and awkward for a fake one
 * to fabricate convincingly: the exact commit SHA currently serving, which a judge can paste into GitHub
 * and compare; the server's own clock, which advances while you watch; the deployment region; and how
 * many incidents have actually been recorded, which grows only when work really happens.
 *
 * Public and read-only. It reveals nothing an attacker gains from: the SHA is already public in an
 * open-source repository, and the rest is metadata about the running process.
 */
import { NextResponse } from 'next/server';
import { daftarInsiden } from '../../../lib/server/insiden';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface Bukti {
  /** Full commit SHA now serving. Compare it against github.com/Finerium/crown-defense. */
  commit: string | null;
  commitPendek: string | null;
  cabang: string | null;
  wilayah: string | null;
  lingkungan: string | null;
  /** Server clock, UTC ISO-8601 as the contracts require. Rendered WIB by the UI. */
  waktuServerUtc: string;
  /** Incidents durably recorded so far. Only grows when a run genuinely completes. */
  insidenTercatat: number;
  penyimpananInsidenAktif: boolean;
}

export async function GET(): Promise<NextResponse<Bukti>> {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const rows = await daftarInsiden();
  return NextResponse.json({
    commit,
    commitPendek: commit ? commit.slice(0, 7) : null,
    cabang: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    wilayah: process.env.VERCEL_REGION ?? null,
    lingkungan: process.env.VERCEL_ENV ?? null,
    waktuServerUtc: new Date().toISOString(),
    insidenTercatat: rows.length,
    penyimpananInsidenAktif: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  });
}
