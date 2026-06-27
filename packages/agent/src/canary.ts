import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Canary management (ADR-010). The agent plants multiple decoy files per protected directory with names
 * that sort EARLY and LATE (encryptors enumerate in order, so both ends catch them) and realistic content,
 * tracks their integrity, and reports any tamper as the high-confidence fast-path signal (C1 CANARY_TOUCHED).
 */
export interface Canary {
  canary_id: string;
  path: string;
  baselineHash: string;
}

const SAMPLE = Buffer.from(
  'Confidential — quarterly reconciliation worksheet. Do not modify. Row totals below.\n'.repeat(40),
  'utf8'
);

function fnv(b: Uint8Array): string {
  let h = 2166136261;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ (b[i] as number), 16777619);
  return (h >>> 0).toString(16);
}

export class CanaryManager {
  private canaries: Canary[] = [];

  /** Plant decoys in `dir`. Names bracket the alphabet so an in-order encryptor hits one quickly. */
  async plant(dir: string): Promise<Canary[]> {
    await mkdir(dir, { recursive: true });
    const names = ['~$0001_aaa_payroll.xlsx', '~$0002_aaa_accounts.docx', 'zzz_~archive_master.docx'];
    this.canaries = [];
    for (const name of names) {
      const path = join(dir, name);
      await writeFile(path, SAMPLE);
      this.canaries.push({ canary_id: name, path, baselineHash: fnv(new Uint8Array(SAMPLE)) });
    }
    return this.canaries;
  }

  paths(): string[] {
    return this.canaries.map((c) => c.path);
  }

  /** Re-check decoy integrity. Returns the canaries whose content changed (tampered). */
  async checkTampered(): Promise<Canary[]> {
    const tampered: Canary[] = [];
    for (const c of this.canaries) {
      try {
        const now = fnv(new Uint8Array(await readFile(c.path)));
        if (now !== c.baselineHash) tampered.push(c);
      } catch {
        tampered.push(c); // deleted/renamed counts as tampered
      }
    }
    return tampered;
  }
}
