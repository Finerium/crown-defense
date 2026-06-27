#!/usr/bin/env node
// Verification-integrity deny: worker subagents (which run in git worktrees) MUST NOT write
// the test oracles / evidence. The main thread (orchestrator) may.
//
// Worker-vs-main detection (in priority order):
//   1. CROWN_WORKER=1 env (explicit) => worker.
//   2. cwd under a /worktrees/ path => worker.
//   3. nearest enclosing .git is a FILE (linked worktree) => worker; a DIR (main worktree) => main.
//      We walk UP from cwd so a worker whose cwd is a package subdir is still detected (closes the
//      subdirectory fail-open gap).
// Covers BOTH Write/Edit/NotebookEdit AND Bash (a worker could otherwise write an oracle via
// `>`, `tee`, `sed -i`, `cp`, `mv`, or node fs from a shell — closes the Bash-bypass gap).
// Mechanism: exit 2 => block. Exit 0 => allow.
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';

function read() {
  return new Promise((res) => {
    let b = '';
    process.stdin.on('data', (c) => {
      b += c;
    });
    process.stdin.on('end', () => res(b));
    process.stdin.on('error', () => res(''));
  });
}

// Protected oracle / evidence paths. The leading boundary class matches BOTH an absolute file path
// (segment preceded by `/`) AND a path token inside a shell command (preceded by space/quote/=/:).
const B = "(^|[\\s'\"=:/])";
const ORACLE = [
  /\.(test|spec)\.[tj]sx?(?![a-z])/, // *.test.ts / *.spec.tsx anywhere
  new RegExp(`${B}(tests|__tests__|__fixtures__)/`),
  new RegExp(`${B}packages/simulator/`),
  new RegExp(`${B}packages/test-infra/`),
  new RegExp(`${B}reports/`),
  new RegExp(`${B}evidence/`),
  new RegExp(`${B}\\.crown/(progress|feature-list)\\.json`),
  new RegExp(`${B}audit/[^/]*/fixtures/`),
  /\.manifest\.json/,
];
const isOracle = (p) => ORACLE.some((re) => re.test(p));

function isWorker(cwd) {
  if (process.env.CROWN_WORKER === '1') return true;
  if (/\/worktrees?\//.test(cwd)) return true;
  let dir = cwd;
  for (let i = 0; i < 40; i++) {
    try {
      const st = statSync(join(dir, '.git'));
      return st.isFile(); // linked worktree => .git is a FILE => worker
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break; // reached filesystem root
      dir = parent;
    }
  }
  return false; // no .git found => treat as main (fail open for the orchestrator)
}

function denyOracle(fp) {
  process.stderr.write(
    `BLOCKED by verification-integrity: worker/worktree may not write the test oracle or evidence file:\n  ${fp}\n` +
      'These are graded by fresh-context reviewers and written only by the main-thread orchestrator. ' +
      'Write your implementation/code instead and return a reference; do not write tests/oracles/evidence.\n'
  );
  process.exit(2);
}

const raw = await read();
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const tool = input.tool_name;
const ti = input.tool_input || {};
const cwd = String(input.cwd || process.cwd());

if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') {
  const fp = String(ti.file_path || '');
  if (isOracle(fp) && isWorker(cwd)) denyOracle(fp);
  process.exit(0);
}

if (tool === 'Bash') {
  const cmd = String(ti.command || '');
  // Does this command WRITE to a file (vs merely read)? Reads of oracles are fine.
  const writesAFile =
    /(^|[^>])>>?[^>]/.test(cmd) || // > or >> redirect
    /\btee\b/.test(cmd) ||
    /\bsed\b[^\n]*-i/.test(cmd) ||
    /\b(cp|mv|install|truncate|ln)\b/.test(cmd) ||
    /\bdd\b[^\n]*\bof=/.test(cmd) ||
    /writeFileSync|appendFileSync|createWriteStream|\.write\(/.test(cmd);
  if (writesAFile && isOracle(cmd) && isWorker(cwd)) {
    denyOracle('(via Bash) ' + cmd.slice(0, 200));
  }
  process.exit(0);
}

process.exit(0);
