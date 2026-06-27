import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENV_KEYS, loadConfig } from '@crown/detection';
import { describe, expect, it } from 'vitest';

/**
 * .env.example must document EXACTLY the detection env-var names the engine reads (review HIGH: the old
 * file documented CROWN_ENTROPY_DELTA_THRESHOLD etc. which the code never read, so operator knobs silently
 * no-op'd). ENV_KEYS is the single source of truth; this test fails closed on any drift.
 */
const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

describe('config drift: .env.example matches @crown/detection ENV_KEYS', () => {
  it('every CROWN_DET_* var the engine reads is documented in .env.example', async () => {
    const env = await readFile(resolve(ROOT, '.env.example'), 'utf8');
    const documented = new Set(
      env
        .split('\n')
        .map((l) => l.match(/^([A-Z0-9_]+)=/)?.[1])
        .filter((x): x is string => !!x)
    );
    for (const key of Object.values(ENV_KEYS)) {
      expect(documented.has(key)).toBe(true);
    }
  });

  it('the documented defaults parse and respect the safety floors', async () => {
    const env = await readFile(resolve(ROOT, '.env.example'), 'utf8');
    const parsed: NodeJS.ProcessEnv = {};
    for (const line of env.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m?.[1]?.startsWith('CROWN_DET_')) parsed[m[1]] = m[2];
    }
    const cfg = loadConfig(parsed);
    expect(cfg.minCorroboration).toBeGreaterThanOrEqual(2);
    expect(cfg.windowSize).toBeGreaterThanOrEqual(1);
  });
});
