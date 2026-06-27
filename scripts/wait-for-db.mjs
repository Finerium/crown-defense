#!/usr/bin/env node
// Wait until both databases accept connections. Reads URLs from .env (dev) or process.env.
import { readFileSync } from 'node:fs';
import pg from 'pg';

function loadEnv() {
  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* env may come from the shell */
  }
}
loadEnv();

const urls = [process.env.OPERATIONAL_DB_URL, process.env.AUDIT_DB_URL].filter(Boolean);
if (urls.length === 0) {
  console.error('No DB URLs in env');
  process.exit(1);
}

async function tryOnce(url) {
  const c = new pg.Client({ connectionString: url });
  try {
    await c.connect();
    await c.query('select 1');
    await c.end();
    return true;
  } catch {
    try {
      await c.end();
    } catch {}
    return false;
  }
}

for (let i = 0; i < 40; i++) {
  const results = await Promise.all(urls.map(tryOnce));
  if (results.every(Boolean)) {
    console.log(`DB ready (${urls.length} databases).`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
console.error('DB did not become ready in time.');
process.exit(1);
