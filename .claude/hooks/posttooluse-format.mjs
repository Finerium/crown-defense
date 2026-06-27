#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
// PostToolUse: best-effort format the just-edited file with the local biome (if installed).
// Never blocks (always exit 0). No-op until biome is in node_modules.
import { existsSync } from 'node:fs';

function read() {
  return new Promise((res) => {
    let b = '';
    process.stdin.on('data', (c) => (b += c));
    process.stdin.on('end', () => res(b));
    process.stdin.on('error', () => res(''));
  });
}

const raw = await read();
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}
const fp = String((input.tool_input || {}).file_path || '');
if (!/\.(ts|tsx|js|jsx|mjs|cjs|json|css)$/.test(fp)) process.exit(0);

const cwd = String(input.cwd || process.cwd());
const biome = `${cwd}/node_modules/.bin/biome`;
if (existsSync(biome)) {
  try {
    execFileSync(biome, ['format', '--write', fp], { stdio: 'ignore', timeout: 15000 });
  } catch {
    /* formatting is advisory */
  }
}
process.exit(0);
