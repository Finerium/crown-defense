// Load .env into process.env for tests that touch the local DB substrate. Dev-only; never in prod.
import { readFileSync } from 'node:fs';

try {
  for (const line of readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  /* env may be provided by the shell / CI */
}
