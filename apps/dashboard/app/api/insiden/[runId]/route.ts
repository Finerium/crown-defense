/**
 * One incident in full, including its hash chain. This is what makes the audit claim checkable rather
 * than merely stated: two people on two devices fetch the same runId and get byte-identical hashes.
 */
import { NextResponse } from 'next/server';
import { ambilInsiden } from '../../../../lib/server/insiden';
import type { CatatanInsiden } from '../../../../lib/server/insiden';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> }
): Promise<NextResponse<CatatanInsiden | { pesan: string }>> {
  const { runId } = await ctx.params;
  const c = await ambilInsiden(runId);
  if (!c) return NextResponse.json({ pesan: 'Insiden tidak ditemukan.' }, { status: 404 });
  return NextResponse.json(c);
}
