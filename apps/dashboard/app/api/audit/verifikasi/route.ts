/**
 * Recompute the last run's hash chain with the real @crown/audit verifier. Read only: nothing here
 * mutates the stored chain. Returns { valid, brokenAt, reason, count }.
 */
import { NextResponse } from 'next/server';
import { verifyChain } from '../../../../lib/server/runner';
import { getChain } from '../../../../lib/server/store';
import type { ChainVerificationResult } from '../../../../lib/server/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse<ChainVerificationResult>> {
  return NextResponse.json(verifyChain(getChain()));
}
