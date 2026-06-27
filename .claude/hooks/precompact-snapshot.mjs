#!/usr/bin/env node
// PreCompact: snapshot the durable handoff state so a compaction can never lose it.
// Copies .crown/progress.json + .crown/notes.md into a timestamped snapshot. Never blocks.
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
  for (const f of ['progress.json', 'notes.md', 'feature-list.json']) {
    const src = `${cwd}/.crown/${f}`;
    if (existsSync(src)) copyFileSync(src, `${dir}/${f}`);
  }
} catch {
  /* advisory */
}
process.exit(0);
