/**
 * The attack simulation console, behind a SERVER-SIDE gate.
 *
 * Deny by default: requireSessionOrRedirect() verifies the signed session cookie on the server before a
 * single byte of console markup is produced, and sends anyone without a valid session to /konsol/masuk.
 * There is no client-side guard to bypass and nothing is prerendered.
 *
 * This file imports exactly two things beyond the stylesheet: the auth helper and the console component.
 * Neither reaches the detection engine, the containment module or the runner, so there is no path from
 * this route to a verdict.
 */
import { Konsol } from '../../components/konsol/Konsol';
import { requireSessionOrRedirect } from '../../lib/server/auth';
import '../konsol.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Page() {
  const sesi = await requireSessionOrRedirect();
  return <Konsol label={sesi.label} />;
}
