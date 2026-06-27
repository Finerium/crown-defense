#!/usr/bin/env node
// Stop / SubagentStop gate. Conservative by design: in a long autonomous orchestration a
// blocking stop-gate that re-runs the suite invites runaway loops, so this gate is ADVISORY.
// It strictly honors the recursion guard (stop_hook_active) and only records a heartbeat.
// The real Definition-of-Done enforcement is the per-gate evidence manifest + fresh-context review.
import { mkdirSync, writeFileSync } from 'node:fs';

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
  process.exit(0);
}
if (input.stop_hook_active) process.exit(0); // recursion guard

try {
  const cwd = String(input.cwd || process.cwd());
  mkdirSync(`${cwd}/.crown`, { recursive: true });
  writeFileSync(
    `${cwd}/.crown/last-stop.txt`,
    `${input.hook_event_name || 'Stop'} ${new Date().toISOString()}\n`
  );
} catch {
  /* advisory */
}
process.exit(0);
