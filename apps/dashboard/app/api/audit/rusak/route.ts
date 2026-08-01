/**
 * Tamper demonstration. Copies the last run's chain, mutates one record's `detail`, and shows exactly
 * which link breaks and why. The stored chain is never modified: the copy is discarded with the response.
 */
import { NextResponse } from 'next/server';
import { tamperDemo } from '../../../../lib/server/runner';
import { getChain } from '../../../../lib/server/store';
import type { TamperDemoResult } from '../../../../lib/server/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse<TamperDemoResult>> {
  return NextResponse.json(tamperDemo(getChain()));
}
