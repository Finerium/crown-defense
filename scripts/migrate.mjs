#!/usr/bin/env node
// Minimal forward-only migration runner. Tracks applied files in a _migrations table per database.
// Reversibility (AC-DATA-MIG) is handled by paired down-migrations in later phases; the audit store is
// intentionally append-only/WORM and is never down-migrated destructively.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    for (const line of readFileSync(join(here, '..', '.env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv();

async function migrate(label, url, dir) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(
    'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'
  );
  const applied = new Set((await client.query('SELECT name FROM _migrations')).rows.map((r) => r.name));
  const files = readdirSync(join(here, 'migrations', dir))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  let count = 0;
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = readFileSync(join(here, 'migrations', dir, f), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      console.log(`[${label}] applied ${f}`);
      count++;
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`[${label}] FAILED ${f}: ${e.message}`);
      await client.end();
      process.exit(1);
    }
  }
  if (count === 0) console.log(`[${label}] up to date (${files.length} migrations)`);
  await client.end();
}

await migrate('operational', process.env.OPERATIONAL_DB_URL, 'operational');
await migrate('audit', process.env.AUDIT_DB_URL, 'audit');
console.log('migrations complete');
