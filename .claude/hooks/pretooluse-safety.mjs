#!/usr/bin/env node
// PreToolUse safety net (deny-by-default backstop, NOT a replacement for judgment).
// Blocks: destructive shell ops, secret exposure (.env reads/commits), writing the real .env.
// Mechanism: exit 2 => block + stderr fed back to the model. Exit 0 => allow.
// Fails OPEN on parse error (this is a backstop layer; the orchestrator is the primary control).
import { basename } from 'node:path';

function read() {
  return new Promise((res) => {
    let b = '';
    process.stdin.on('data', (c) => (b += c));
    process.stdin.on('end', () => res(b));
    process.stdin.on('error', () => res(''));
  });
}

const DESTRUCTIVE = [
  /\brm\s+(-[a-z]*\s+)*-[a-z]*r[a-z]*f|\brm\s+(-[a-z]*\s+)*-[a-z]*f[a-z]*r/i, // rm -rf / -fr
  /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // fork bomb
  /\bmkfs\b/i,
  /\bdd\b[^\n]*\bof=\/dev\//i,
  />\s*\/dev\/(sd|nvme|disk)/i,
  /\bgit\s+push\b[^\n]*(--force\b|--force-with-lease=?\s*$|\s-f\b)[^\n]*\b(origin|main|master)\b/i,
  /\bgit\s+filter-branch\b/i,
  /\bgit\s+reset\s+--hard\s+origin\//i,
  /\bchmod\s+-R?\s*777\s+\//i,
  /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba)?sh\b/i, // pipe remote to shell
];

// Secret exposure: printing or committing the real .env (allow .env.example).
const SECRET_EXPOSURE = [
  /\b(cat|less|more|head|tail|xxd|od|strings|nl|bat)\b[^\n]*(^|[\s'"\/])\.env(\s|$|['"])(?!\.example)/i,
  /\bgrep\b[^\n]*\s\.env(\s|$)(?!\.example)/i,
  /\bgit\s+add\b[^\n]*\s\.env(\s|$)(?!\.example)/i,
  /\becho\b[^\n]*\$(DEEPSEEK_API_KEY|AUDIT_INTEGRITY_KEY|CONTROL_PLANE_TOKEN_SECRET)/i,
  /\bprintenv\b[^\n]*(DEEPSEEK_API_KEY|AUDIT_INTEGRITY_KEY|CONTROL_PLANE_TOKEN_SECRET)/i,
];

function deny(msg) {
  process.stderr.write(msg + '\n');
  process.exit(2);
}

const raw = await read();
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0); // fail open: backstop only
}

const tool = input.tool_name;
const ti = input.tool_input || {};

if (tool === 'Bash') {
  const cmd = String(ti.command || '');
  // Clean, leak-free hook-liveness probe sentinel.
  if (cmd.includes('CROWN_HOOK_PROBE')) {
    deny('BLOCKED by pretooluse-safety: CROWN_HOOK_PROBE sentinel — safety hook is ACTIVE.');
  }
  for (const re of DESTRUCTIVE) {
    if (re.test(cmd))
      deny(
        `BLOCKED by pretooluse-safety: destructive command pattern (${re}). If intentional, do it manually and explain.`
      );
  }
  for (const re of SECRET_EXPOSURE) {
    if (re.test(cmd))
      deny(
        'BLOCKED by pretooluse-safety: this would expose or commit secrets (.env / signing keys). Read only the specific value via code at runtime; never print or commit secrets.'
      );
  }
}

if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') {
  const fp = String(ti.file_path || '');
  const base = basename(fp);
  if (base === '.env' || /(^|\/)\.env(\.(local|development|production|test))?$/.test(fp)) {
    deny(
      'BLOCKED by pretooluse-safety: refusing to write the real .env (secrets file). Edit .env.example instead.'
    );
  }
}

process.exit(0);
