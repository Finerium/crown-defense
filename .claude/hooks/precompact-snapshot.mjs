#!/usr/bin/env node
// PreCompact: snapshot the durable handoff state so a compaction can never lose it.
// Copies .crown/progress.json + docs/internal/notes.md into a timestamped snapshot. Never blocks.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

function read() {
  return new Promise((res) => {
    let b = '';
    process.stdin.on('data', (c) => (b += c));
    process.stdin.on('end', () => res(b));
    process.stdin.on('error', () => res(''));
  });
}

const raw = await read();
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  /* still snapshot */
}
try {
  const cwd = String(input.cwd || process.cwd());
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = `${cwd}/.crown/snapshots/${stamp}`;
  mkdirSync(dir, { recursive: true });
  // notes.md moved to docs/internal/ during the public-repo hygiene pass; keep snapshotting it.
  for (const rel of ['.crown/progress.json', '.crown/feature-list.json', 'docs/internal/notes.md']) {
    const src = `${cwd}/${rel}`;
    if (existsSync(src)) copyFileSync(src, `${dir}/${rel.split('/').pop()}`);
  }
} catch {
  /* advisory */
}
process.exit(0);
