import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Evidence report writer. Phase gates parse these artifacts fail-closed, so they must be well-formed,
 * stable JSON. Reports live under reports/ (a TEST-ORACLE/evidence path: worker-write-denied). The
 * main-thread orchestrator writes them via this helper.
 */
export interface EvidenceReport {
  id: string; // criterion id (e.g. SIM-MODES)
  gate: number;
  generated_at: string;
  pass: boolean;
  detail: Record<string, unknown>;
}

export async function writeReport(absPath: string, report: EvidenceReport): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export function evidence(
  id: string,
  gate: number,
  pass: boolean,
  detail: Record<string, unknown>
): EvidenceReport {
  return { id, gate, generated_at: new Date().toISOString(), pass, detail };
}
