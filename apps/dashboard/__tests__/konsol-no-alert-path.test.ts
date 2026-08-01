import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DetectionEngine, ENV_KEYS, loadConfig } from '@crown/detection';
import { familyByName } from '@crown/simulator';
import { DEFAULT_ALLOWLIST, attackTelemetry } from '@crown/test-infra';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * ADVERSARIAL VERIFICATION of the claimed invariant:
 *
 *   "Pressing a console button only starts a benign workload that writes into a sandboxed scratch
 *    directory and emits genuine C1 telemetry. The real @crown/detection engine reads that telemetry
 *    and decides on its own. There is no request, field, event or flag originating from the console
 *    that can tell the dashboard to show an alert, a verdict, a severity or an action."
 *
 * These tests are written to BREAK that claim, not to confirm it. Every assertion below is one the
 * author of the console would fail if an alert path existed. The structural checks read the real
 * source files from disk with node:fs, so they cannot be satisfied by a stub or a mock.
 *
 * Route handlers are invoked directly (Next 15 App Router handlers are plain (Request) => Response
 * functions), so the assertions are about the shipped handler, not a reimplementation of it.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..');

/* -------------------------------------------------------------------------- */
/* Static source analysis helpers                                             */
/* -------------------------------------------------------------------------- */

/** Strip block and line comments so the checks below are about CODE, not about prose in a doc banner. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

interface Edge {
  spec: string;
  /** False for `import type ...` / `export type ...`, which TypeScript ERASES: no runtime code is emitted. */
  runtime: boolean;
}

/**
 * Every import/export edge in a module, including dynamic `import(...)`, tagged with whether the edge
 * survives compilation. `import type { X } from 'p'` emits nothing, so it cannot pull `p` into the
 * shipped bundle; `import { type X, y } from 'p'` does, because `y` is a value.
 */
function edges(src: string): Edge[] {
  const code = stripComments(src);
  const out: Edge[] = [];
  const push = (re: RegExp, specGroup: number, runtime: (m: RegExpExecArray) => boolean): void => {
    let m = re.exec(code);
    while (m !== null) {
      out.push({ spec: m[specGroup] as string, runtime: runtime(m) });
      m = re.exec(code);
    }
  };
  // Statement-level `import ... from 'x'` / `export ... from 'x'`. The clause may not contain a quote or a
  // semicolon, which stops the lazy match from running past the end of its own statement and picking up a
  // later `from` (a bug the negative test below catches).
  push(
    /(?:^|[;}])\s*(import|export)\s+(type\s+)?([^;'"]*?)\bfrom\s*['"]([^'"]+)['"]/gm,
    4,
    (m) => m[2] === undefined
  );
  push(/(?:^|[;}])\s*import\s*['"]([^'"]+)['"]/gm, 1, () => true); // side-effect import
  push(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, 1, () => true); // dynamic import
  push(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, 1, () => true); // cjs
  return out;
}

/** Every specifier regardless of erasure. */
function specifiers(src: string): string[] {
  return edges(src).map((e) => e.spec);
}

function resolveRelative(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec).replace(/\.js$/, '');
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    base,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Transitive import closure over files INSIDE apps/dashboard. A direct-import-only check would be
 * defeated by adding a single re-export hop, so the walk is transitive on purpose.
 *
 * `runtimeOnly` follows only edges that survive compilation, which is the closure that decides what
 * the deployed console route can actually EXECUTE. The full closure additionally follows erased
 * `import type` edges, which is the right lens for "does this file even name that module".
 */
function closure(
  entries: string[],
  runtimeOnly: boolean
): { files: string[]; packages: string[]; typeOnlyPackageEdges: string[] } {
  const seen = new Set<string>();
  const pkgs = new Set<string>();
  const typeOnly: string[] = [];
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const edge of edges(readFileSync(file, 'utf8'))) {
      if (runtimeOnly && !edge.runtime) continue;
      const local = resolveRelative(file, edge.spec);
      if (local) queue.push(local);
      else if (edge.spec.startsWith('.'))
        continue; // a relative asset (css), not a module edge
      else if (edge.runtime) pkgs.add(edge.spec);
      else typeOnly.push(`${rel(file)} -> ${edge.spec}`);
    }
  }
  return { files: [...seen], packages: [...pkgs], typeOnlyPackageEdges: typeOnly };
}

function walkDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkDir(full));
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const rel = (f: string) => relative(APP, f);

/** Every file the console owns that exists today. app/konsol and components/konsol may not exist yet. */
function consoleEntryFiles(): string[] {
  return [
    ...walkDir(join(APP, 'app/api/konsol')),
    ...walkDir(join(APP, 'app/konsol')),
    ...walkDir(join(APP, 'components/konsol')),
  ];
}

/** Packages that can construct, decide or execute a verdict or a containment action. */
const FORBIDDEN_PACKAGES = [
  '@crown/detection',
  '@crown/containment',
  '@crown/audit',
  '@crown/agent',
  '@crown/llm',
  '@crown/test-infra',
];

/** Identifiers that only a verdict-, alert- or containment-bearing code path needs. */
const FORBIDDEN_IDENTIFIERS = [
  'MASS_ENCRYPTION',
  'ISOLATE_HOST',
  'recommended_action',
  'recommendedAction',
  'corroborating_count',
  'DetectionEngine',
  'ContainmentModule',
  'decideContainment',
  'runScenario',
  'severity',
  'fast_path',
  'fastPath',
  'DetectionVerdict',
  'AgentCommand',
];

/* -------------------------------------------------------------------------- */
/* Session + request helpers                                                  */
/* -------------------------------------------------------------------------- */

const SECRET = 'uji-rahasia-konsol-cukup-panjang-untuk-hmac';
let cookieHeader = '';

async function makeCookie(): Promise<string> {
  const { SESSION_COOKIE, issueSession } = await import('../lib/server/auth.js');
  const issued = issueSession({ email: 'penguji@contoh.id', label: 'Penguji' }, false);
  if (!issued) throw new Error('issueSession returned null: KONSOL_SECRET is not set for the test');
  return `${SESSION_COOKIE}=${encodeURIComponent(issued.value)}`;
}

function post(url: string, body: unknown, cookie = cookieHeader): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** The store mirrors its queue to a shared tmp file, so drain before asserting on queue contents. */
async function drain(): Promise<void> {
  const { store } = await import('../lib/server/store.js');
  for (let i = 0; i < 64; i++) {
    if (store.takePending() === null) return;
  }
}

beforeAll(async () => {
  process.env.KONSOL_SECRET = SECRET;
  process.env.KONSOL_RUN_MAX = '1000';
  process.env.KONSOL_RUN_GLOBAL_MAX = '1000';
  cookieHeader = await makeCookie();
});

/* ========================================================================== */
/* (a) STRUCTURAL: the console source on disk cannot reach a verdict          */
/* ========================================================================== */

describe('(a) structural: no console source file can reach a decision-making module', () => {
  it('scans the console routes that actually exist on disk (guards against a vacuous pass)', () => {
    const entries = consoleEntryFiles().map(rel);
    // If this list ever shrinks to nothing the checks below would pass without testing anything.
    expect(entries).toContain('app/api/konsol/jalankan/route.ts');
    expect(entries).toContain('app/api/konsol/status/route.ts');
    expect(entries).toContain('app/api/konsol/katalog/route.ts');
    expect(entries).toContain('app/api/konsol/masuk/route.ts');
    expect(entries).toContain('app/api/konsol/keluar/route.ts');
    expect(entries.length).toBeGreaterThanOrEqual(5);
  });

  it('the import parser itself works, so an empty result can never be mistaken for a clean one', () => {
    // A parser that silently returns nothing would make every structural check below pass vacuously.
    const found = edges(readFileSync(join(APP, 'app/api/konsol/jalankan/route.ts'), 'utf8'));
    expect(found.map((e) => e.spec).sort()).toEqual([
      '../../../../lib/server/auth',
      '../../../../lib/server/ratelimit',
      '../../../../lib/server/scenarios',
      '../../../../lib/server/store',
      '../../../../lib/server/types',
      'next/server',
      'node:crypto',
      'zod',
    ]);
    expect(found.filter((e) => !e.runtime).map((e) => e.spec)).toEqual(['../../../../lib/server/types']);
    expect(closure(consoleEntryFiles(), true).files.length).toBeGreaterThanOrEqual(9);
  });

  it('the RUNTIME import closure of every console file contains no decision-making package', () => {
    const { files, packages } = closure(consoleEntryFiles(), true);
    const offenders = packages.filter((p) =>
      FORBIDDEN_PACKAGES.some((f) => p === f || p.startsWith(`${f}/`))
    );
    expect(
      offenders,
      `console runtime closure reaches ${offenders.join(', ')} via files: ${files.map(rel).join(', ')}`
    ).toEqual([]);
    // Allow-list, not a blocklist: adding any other workspace package to the console requires a review.
    // @crown/simulator supplies the family metadata the catalogue resolves; @crown/contracts supplies the
    // frozen schemas and PRODUCT_NAME. Neither contains a detection engine or a containment policy, so
    // neither can decide anything. Anything else appearing here is a finding.
    expect(
      packages.filter((p) => p.startsWith('@crown/')).sort(),
      'a new workspace package entered the console runtime closure and needs review'
    ).toEqual(['@crown/contracts', '@crown/simulator']);
  });

  it('any decision-making package named in the console closure is reached ONLY by an erased type import', () => {
    // NEAR MISS, pinned deliberately: lib/server/types.ts names @crown/containment and @crown/contracts so
    // the wire types stay the frozen contracts rather than restatements. Those are `import type` edges,
    // erased by the compiler, so no containment code is reachable. If anyone converts one of them into a
    // value import this test fails, and so does the runtime-closure test above.
    const full = closure(consoleEntryFiles(), false);
    const named = full.packages
      .concat(full.typeOnlyPackageEdges.map((e) => e.split(' -> ')[1] as string))
      .filter((p) => FORBIDDEN_PACKAGES.some((f) => p === f || p.startsWith(`${f}/`)));
    expect([...new Set(named)].sort()).toEqual(['@crown/containment']);
    expect(full.typeOnlyPackageEdges).toContain('lib/server/types.ts -> @crown/containment');
    expect(full.packages).not.toContain('@crown/containment');

    // And the console's own edge to that file is itself type-only, so types.ts is not even loaded.
    const jalankan = edges(readFileSync(join(APP, 'app/api/konsol/jalankan/route.ts'), 'utf8'));
    const toTypes = jalankan.filter((e) => e.spec.endsWith('lib/server/types'));
    expect(toTypes.length).toBe(1);
    expect((toTypes[0] as Edge).runtime).toBe(false);
  });

  it('the transitive import closure of every console file never reaches lib/server/runner', () => {
    const { files } = closure(consoleEntryFiles(), false);
    const runner = files.map(rel).filter((f) => f === 'lib/server/runner.ts');
    expect(
      runner,
      'the console can reach the runner, which is the only module that produces a verdict'
    ).toEqual([]);
  });

  it('no console source file mentions a verdict, action or severity identifier in CODE', () => {
    const failures: string[] = [];
    for (const file of consoleEntryFiles()) {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const id of FORBIDDEN_IDENTIFIERS) {
        if (new RegExp(`\\b${id}\\b`).test(code)) failures.push(`${rel(file)}: ${id}`);
      }
    }
    expect(failures, `console code references decision identifiers: ${failures.join(' | ')}`).toEqual([]);
  });

  it('no console file can reach the dial or the verdict stream', () => {
    // The dial is the one legitimate lever that changes whether a verdict becomes an isolation. If the
    // console could POST /api/dial it could pre-determine the outcome of a scenario it also starts, which
    // is the strongest remaining way to make the demo dishonest. It cannot: it never names the endpoint.
    // It also never opens the SSE stream, so it cannot even observe what the engine decided.
    const failures: string[] = [];
    for (const file of consoleEntryFiles()) {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const needle of ['/api/dial', '/api/telemetri', 'EventSource']) {
        if (code.includes(needle)) failures.push(`${rel(file)}: ${needle}`);
      }
    }
    expect(failures, `console code reaches the dial or the stream: ${failures.join(' | ')}`).toEqual([]);
  });

  it('no console route is among the importers of lib/server/runner (API.md "single producer")', () => {
    const all = [
      ...walkDir(join(APP, 'app')),
      ...walkDir(join(APP, 'lib')),
      ...walkDir(join(APP, 'components')),
    ];
    const importers = all
      .filter((f) =>
        edges(readFileSync(f, 'utf8')).some(
          (e) => resolveRelative(f, e.spec) === join(APP, 'lib/server/runner.ts')
        )
      )
      .map(rel);
    // Asserted as a property rather than a fixed list, because the audit routes API.md documents are not
    // all on disk yet and this must not go red the moment they land.
    expect(importers.length, 'nothing imports the runner, so this check is vacuous').toBeGreaterThan(0);
    expect(
      importers.filter((f) => f.includes('konsol')),
      `console files importing the runner: ${importers}`
    ).toEqual([]);
    expect(importers).toContain('app/api/telemetri/aliran/route.ts');
  });

  it('the only module that imports @crown/detection is the runner, reached only by the telemetry stream', () => {
    const all = [
      ...walkDir(join(APP, 'app')),
      ...walkDir(join(APP, 'lib')),
      ...walkDir(join(APP, 'components')),
    ];
    const importers = all
      .filter((f) => specifiers(readFileSync(f, 'utf8')).includes('@crown/detection'))
      .map(rel);
    expect(importers).toEqual(['lib/server/runner.ts']);

    const streamClosure = closure([join(APP, 'app/api/telemetri/aliran/route.ts')], true);
    expect(streamClosure.files.map(rel)).toContain('lib/server/runner.ts');
  });
});

/* ========================================================================== */
/* (b) CONTRACT: the console wire shapes carry no decision                    */
/* ========================================================================== */

describe('(b) contract: the console wire shapes have exactly the allowed keys', () => {
  it('POST /api/konsol/jalankan returns exactly { runId, accepted } and nothing else', async () => {
    await drain();
    const { POST } = await import('../app/api/konsol/jalankan/route.js');
    const res = await POST(post('http://t/api/konsol/jalankan', { scenarioId: 'rad-ws-radiologi' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['accepted', 'runId']);
    expect(body.accepted).toBe(true);
    expect(typeof body.runId).toBe('string');
    await drain();
  });

  it('GET /api/konsol/status returns exactly the six progress keys, none of them a decision', async () => {
    await drain();
    const { POST } = await import('../app/api/konsol/jalankan/route.js');
    await POST(post('http://t/api/konsol/jalankan', { scenarioId: 'ehr-lateral' }));
    const { GET } = await import('../app/api/konsol/status/route.js');
    const res = await GET(new Request('http://t/api/konsol/status', { headers: { cookie: cookieHeader } }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'elapsedMs',
      'eventsEmitted',
      'filesTouched',
      'phase',
      'runId',
      'scenarioId',
    ]);
    await drain();
  });

  it('the KonsolStatus type declaration on disk declares no verdict, action, severity or signal member', () => {
    const src = readFileSync(join(APP, 'lib/server/types.ts'), 'utf8');
    const block = /export interface KonsolStatus \{([\s\S]*?)\n\}/.exec(src);
    expect(block, 'KonsolStatus is no longer declared in lib/server/types.ts').not.toBeNull();
    const members = ((block as RegExpExecArray)[1] as string)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('*') && !l.startsWith('/'))
      .map((l) => (l.split(/[?:]/)[0] as string).trim());
    expect(members.sort()).toEqual([
      'elapsedMs',
      'eventsEmitted',
      'filesTouched',
      'phase',
      'runId',
      'scenarioId',
    ]);
  });

  it('the WorkloadRequest type declaration on disk has exactly four fields, none decision-bearing', () => {
    const src = readFileSync(join(APP, 'lib/server/types.ts'), 'utf8');
    const block = /export interface WorkloadRequest \{([\s\S]*?)\n\}/.exec(src);
    expect(block).not.toBeNull();
    const members = ((block as RegExpExecArray)[1] as string)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('*') && !l.startsWith('/'))
      .map((l) => (l.split(/[?:]/)[0] as string).trim());
    expect(members.sort()).toEqual(['requestedAt', 'requestedBy', 'runId', 'scenarioId']);
  });

  it('the scenario catalogue publishes no verdict, severity or recommended action', async () => {
    const { GET } = await import('../app/api/konsol/katalog/route.js');
    const res = await GET(new Request('http://t/api/konsol/katalog', { headers: { cookie: cookieHeader } }));
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body.length).toBe(8);
    const banned = ['verdict', 'severity', 'action', 'recommended_action', 'signals', 'alert', 'fired'];
    for (const entry of body) {
      for (const key of Object.keys(entry)) {
        expect(banned, `catalogue entry ${String(entry.id)} exposes key ${key}`).not.toContain(key);
      }
    }
  });
});

/* ========================================================================== */
/* (c) INJECTION: a hostile body reaches nothing                              */
/* ========================================================================== */

describe('(c) injection: a crafted console request cannot smuggle a decision anywhere', () => {
  const SENTINEL = `KONSOL-INJEKSI-${randomBytes(6).toString('hex')}`;

  const hostile = {
    scenarioId: 'rad-ws-radiologi',
    verdict: 'MASS_ENCRYPTION',
    recommended_action: 'ISOLATE_HOST',
    recommendedAction: 'ISOLATE_HOST',
    fired: true,
    severity: 'critical',
    signals: [{ signal_type: 'CANARY_TAMPER', fired: true, score: 1 }],
    corroborating_count: 9,
    fast_path: true,
    alert: SENTINEL,
    requestedBy: SENTINEL,
    runId: SENTINEL,
    __proto__: { verdict: 'MASS_ENCRYPTION', polluted: SENTINEL },
  };

  it('none of the hostile fields reaches the response body', async () => {
    await drain();
    const { POST } = await import('../app/api/konsol/jalankan/route.js');
    const res = await POST(post('http://t/api/konsol/jalankan', hostile));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['accepted', 'runId']);
    expect(JSON.stringify(body)).not.toContain(SENTINEL);
    expect(JSON.stringify(body)).not.toContain('MASS_ENCRYPTION');
    expect(JSON.stringify(body)).not.toContain('ISOLATE_HOST');
    expect(JSON.stringify(body)).not.toContain('critical');
    await drain();
  });

  it('none of the hostile fields reaches the run state', async () => {
    await drain();
    const { POST } = await import('../app/api/konsol/jalankan/route.js');
    const { store } = await import('../lib/server/store.js');
    await POST(post('http://t/api/konsol/jalankan', hostile));

    const progress = store.getProgress() as Record<string, unknown> | null;
    expect(progress).not.toBeNull();
    expect(Object.keys(progress as Record<string, unknown>).sort()).toEqual([
      'elapsedMs',
      'eventsEmitted',
      'filesTouched',
      'phase',
      'runId',
      'scenarioId',
    ]);
    expect(JSON.stringify(progress)).not.toContain(SENTINEL);

    const pending = store.takePending() as Record<string, unknown> | null;
    expect(pending).not.toBeNull();
    expect(Object.keys(pending as Record<string, unknown>).sort()).toEqual([
      'requestedAt',
      'requestedBy',
      'runId',
      'scenarioId',
    ]);
    // requestedBy is the SESSION email, never the caller-supplied one; runId is minted server side.
    expect((pending as Record<string, unknown>).requestedBy).toBe('penguji@contoh.id');
    expect((pending as Record<string, unknown>).runId).not.toBe(SENTINEL);
    expect(JSON.stringify(pending)).not.toContain(SENTINEL);
    await drain();
  });

  it('the hostile body pollutes no prototype', async () => {
    await drain();
    const { POST } = await import('../app/api/konsol/jalankan/route.js');
    await POST(
      post(
        'http://t/api/konsol/jalankan',
        `{"scenarioId":"rad-ws-radiologi","__proto__":{"verdict":"MASS_ENCRYPTION","polluted":"${SENTINEL}"}}`
      )
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).verdict).toBeUndefined();
    expect((Object.prototype as unknown as Record<string, unknown>).polluted).toBeUndefined();
    await drain();
  });

  it('an unknown scenarioId is rejected, including prototype-shaped and injected ones', async () => {
    const { POST } = await import('../app/api/konsol/jalankan/route.js');
    const { store } = await import('../lib/server/store.js');
    await drain();
    for (const bad of [
      '__proto__',
      'constructor',
      'prototype',
      'toString',
      'rad-ws-radiologi ',
      'RAD-WS-RADIOLOGI',
      '../../etc/passwd',
      '',
      null,
      42,
      { id: 'rad-ws-radiologi' },
      ['rad-ws-radiologi'],
    ]) {
      const res = await POST(post('http://t/api/konsol/jalankan', { scenarioId: bad }));
      expect(res.status, `scenarioId ${JSON.stringify(bad)} was accepted`).toBe(400);
      expect(store.takePending(), `scenarioId ${JSON.stringify(bad)} was enqueued`).toBeNull();
    }
    // A body that is not an object at all must not throw a 500 either.
    for (const raw of ['null', '[]', '"x"', 'not json']) {
      const res = await POST(post('http://t/api/konsol/jalankan', raw));
      expect(res.status, `raw body ${raw} was accepted`).toBe(400);
    }
    await drain();
  });

  it('an unauthenticated caller cannot enqueue anything at all', async () => {
    await drain();
    const { POST } = await import('../app/api/konsol/jalankan/route.js');
    const { store } = await import('../lib/server/store.js');
    const res = await POST(post('http://t/api/konsol/jalankan', { scenarioId: 'rad-ws-radiologi' }, ''));
    expect(res.status).toBe(401);
    expect(store.takePending()).toBeNull();
  });

  it('a forged session cookie is rejected, so the console cannot be driven without the secret', async () => {
    const { SESSION_COOKIE } = await import('../lib/server/auth.js');
    const { POST } = await import('../app/api/konsol/jalankan/route.js');
    const forged = Buffer.from(
      JSON.stringify({ email: 'penyerang@contoh.id', label: 'X', exp: Date.now() / 1000 + 3600 }),
      'utf8'
    ).toString('base64url');
    const res = await POST(
      post(
        'http://t/api/konsol/jalankan',
        { scenarioId: 'rad-ws-radiologi' },
        `${SESSION_COOKIE}=${forged}.AAAA`
      )
    );
    expect(res.status).toBe(401);
  });
});

/* ========================================================================== */
/* (d) PROVENANCE: the verdict is minted by DetectionEngine, not by the console */
/* ========================================================================== */

describe('(d) provenance: a destructive verdict comes from DetectionEngine.ingest over C1 telemetry', () => {
  const SENTINEL = `KONSOL-INJEKSI-${randomBytes(6).toString('hex')}`;

  /** The runner's own detection config policy, reproduced so the comparison engine is configured alike. */
  function detectionConfig() {
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (!env[ENV_KEYS.allowlist]) env[ENV_KEYS.allowlist] = DEFAULT_ALLOWLIST.join(',');
    return loadConfig(env);
  }

  it('the streamed verdict for a console-started scenario is reproduced exactly by a fresh engine', async () => {
    process.env.CROWN_DEMO_RUN_WINDOW_MS = '0';
    process.env.CROWN_DEMO_TICK_MIN_MS = '0';
    await drain();

    // 1) Drive the REAL console route with a hostile body carrying a pre-baked verdict.
    const { POST } = await import('../app/api/konsol/jalankan/route.js');
    const { store, getDial } = await import('../lib/server/store.js');
    const res = await POST(
      post('http://t/api/konsol/jalankan', {
        scenarioId: 'rad-ws-radiologi',
        verdict: 'MASS_ENCRYPTION',
        recommended_action: 'ISOLATE_HOST',
        fired: true,
        severity: 'critical',
        alert: SENTINEL,
      })
    );
    expect(res.status).toBe(200);

    // 2) Consume it exactly as app/api/telemetri/aliran does: runId + scenarioId + the dial. Nothing else.
    const pending = store.takePending();
    expect(pending).not.toBeNull();
    const { runScenario } = await import('../lib/server/runner.js');
    const events: Array<Record<string, unknown>> = [];
    await runScenario(
      (pending as { scenarioId: string }).scenarioId,
      getDial(),
      (e) => events.push(e as unknown as Record<string, unknown>),
      { runId: (pending as { runId: string }).runId }
    );

    const putusan = events.find((e) => e.type === 'putusan') as
      | { verdict: Record<string, unknown> }
      | undefined;
    expect(putusan, 'the flagship attack scenario produced no verdict at all').toBeDefined();
    const streamed = (putusan as { verdict: Record<string, unknown> }).verdict;

    // 3) The verdict_id format `vd-<host>-<seq>` is minted ONLY inside DetectionEngine.ingest.
    expect(String(streamed.verdict_id)).toMatch(/^vd-mrh-rad-ws-07-\d+$/);

    // 4) Reproduce the identical C1 telemetry independently and run it through a FRESH real engine.
    const fam = familyByName('BrainCipher');
    expect(fam).not.toBeNull();
    const raw = await attackTelemetry(fam as NonNullable<typeof fam>, { plantCanary: true, seeds: 36 });
    const engine = new DetectionEngine(detectionConfig());
    let independent: Record<string, unknown> | null = null;
    for (const e of raw) {
      const r = engine.ingest({ ...e, host_id: 'mrh-rad-ws-07', agent_id: 'agent-mrh-rad-ws-07' });
      if (r.verdict.verdict === 'MASS_ENCRYPTION') {
        independent = r.verdict as unknown as Record<string, unknown>;
        break;
      }
    }
    expect(
      independent,
      'a fresh engine over the same C1 telemetry produced no destructive verdict'
    ).not.toBeNull();
    const indep = independent as Record<string, unknown>;

    // 5) SAME verdict. If the console could influence the outcome these would diverge.
    for (const field of [
      'verdict',
      'recommended_action',
      'corroborating_count',
      'fast_path',
      'confidence',
      'host_id',
      'agent_id',
      'verdict_id',
    ]) {
      expect(
        streamed[field],
        `field ${field} differs between the streamed and the independent verdict`
      ).toEqual(indep[field]);
    }
    expect(JSON.stringify(streamed.signals)).toEqual(JSON.stringify(indep.signals));
    expect(streamed.verdict).toBe('MASS_ENCRYPTION');
    expect(streamed.recommended_action).toBe('ISOLATE_HOST');

    // 6) Nothing the console sent appears anywhere in the entire streamed event sequence.
    const wire = JSON.stringify(events);
    expect(wire).not.toContain(SENTINEL);
    expect(wire).not.toContain('"severity"');
    expect(wire).not.toContain('critical');
  }, 120000);

  it('a benign scenario started from the console produces no destructive verdict, whatever the body claimed', async () => {
    process.env.CROWN_DEMO_RUN_WINDOW_MS = '0';
    process.env.CROWN_DEMO_TICK_MIN_MS = '0';
    await drain();
    const { POST } = await import('../app/api/konsol/jalankan/route.js');
    const { store, getDial } = await import('../lib/server/store.js');
    await POST(
      post('http://t/api/konsol/jalankan', {
        scenarioId: 'backup-terjadwal',
        verdict: 'MASS_ENCRYPTION',
        recommended_action: 'ISOLATE_HOST',
        fast_path: true,
        corroborating_count: 9,
      })
    );
    const pending = store.takePending() as { runId: string; scenarioId: string };
    const { runScenario } = await import('../lib/server/runner.js');
    const events: Array<Record<string, unknown>> = [];
    const result = await runScenario(pending.scenarioId, getDial(), (e) => events.push(e as never), {
      runId: pending.runId,
    });

    expect(events.some((e) => e.type === 'putusan')).toBe(false);
    expect(result.summary.destructiveVerdictReached).toBe(false);
    expect(result.summary.containmentExecuted).toBe(false);
    const ticks = events.filter((e) => e.type === 'tik');
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((t) => t.recommendedAction !== 'ISOLATE_HOST')).toBe(true);
  }, 120000);
});

/* ========================================================================== */
/* (e) NEGATIVE: the checks above have teeth                                  */
/* ========================================================================== */

describe('(e) negative: the structural checks would FAIL if an alert path were added later', () => {
  const real = () => readFileSync(join(APP, 'app/api/konsol/jalankan/route.ts'), 'utf8');

  it('detects an added @crown/detection import (transitive, one hop away)', () => {
    // Simulate the closure result of a future edit rather than mutating the repo.
    const patched = real().replace(
      "import { NextResponse } from 'next/server';",
      "import { NextResponse } from 'next/server';\nimport { DetectionEngine } from '@crown/detection';"
    );
    expect(patched).not.toEqual(real());
    const offenders = edges(patched).filter(
      (e) => e.runtime && FORBIDDEN_PACKAGES.some((f) => e.spec === f || e.spec.startsWith(`${f}/`))
    );
    expect(offenders.map((e) => e.spec)).toEqual(['@crown/detection']);
  });

  it('tells an erased type import apart from a real one, so the runtime check is not fooled either way', () => {
    const asType = `${real()}\nimport type { DetectionVerdict } from '@crown/detection';`;
    const asValue = `${real()}\nimport { DetectionEngine } from '@crown/detection';`;
    const runtimeSpecs = (s: string) =>
      edges(s)
        .filter((e) => e.runtime)
        .map((e) => e.spec);
    expect(runtimeSpecs(asType)).not.toContain('@crown/detection');
    expect(runtimeSpecs(asValue)).toContain('@crown/detection');
    // A mixed import is a VALUE import: `{ type X, y }` still emits a require for y.
    const mixed = `${real()}\nimport { type DetectionVerdict, DetectionEngine } from '@crown/detection';`;
    expect(runtimeSpecs(mixed)).toContain('@crown/detection');
  });

  it('detects an added runner import', () => {
    const patched = real().replace(
      "import { store } from '../../../../lib/server/store';",
      "import { store } from '../../../../lib/server/store';\nimport { runScenario } from '../../../../lib/server/runner';"
    );
    expect(patched).not.toEqual(real());
    const resolved = specifiers(patched)
      .map((s) => resolveRelative(join(APP, 'app/api/konsol/jalankan/route.ts'), s))
      .filter((f): f is string => f !== null)
      .map(rel);
    expect(resolved).toContain('lib/server/runner.ts');
  });

  it('detects a verdict identifier added to console CODE while ignoring the same word in a comment', () => {
    const inCode = `${real()}\nconst x = { verdict: 'MASS_ENCRYPTION', recommended_action: 'ISOLATE_HOST' };`;
    const hits = FORBIDDEN_IDENTIFIERS.filter((id) => new RegExp(`\\b${id}\\b`).test(stripComments(inCode)));
    expect(hits).toContain('MASS_ENCRYPTION');
    expect(hits).toContain('ISOLATE_HOST');
    expect(hits).toContain('recommended_action');

    // The shipped file says the same words in its doc banner. Prose must NOT trip the check, otherwise
    // the honest banner would have to be deleted to keep the suite green.
    const inComment = `${real()}\n// verdict MASS_ENCRYPTION ISOLATE_HOST recommended_action severity`;
    expect(
      FORBIDDEN_IDENTIFIERS.filter((id) => new RegExp(`\\b${id}\\b`).test(stripComments(inComment)))
    ).toEqual([]);
  });

  it('detects an extra key added to the jalankan response contract', () => {
    // The contract check is Object.keys equality, so any added field fails it. Proven here directly.
    const withAlert = { runId: 'run-x', accepted: true, verdict: 'MASS_ENCRYPTION' };
    expect(Object.keys(withAlert).sort()).not.toEqual(['accepted', 'runId']);
  });

  it('detects an extra member added to the KonsolStatus declaration', () => {
    const src = readFileSync(join(APP, 'lib/server/types.ts'), 'utf8');
    const patched = src.replace(
      'export interface KonsolStatus {\n  runId: string;',
      'export interface KonsolStatus {\n  runId: string;\n  verdict: string;'
    );
    expect(patched).not.toEqual(src);
    const block = /export interface KonsolStatus \{([\s\S]*?)\n\}/.exec(patched) as RegExpExecArray;
    const members = (block[1] as string)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('*') && !l.startsWith('/'))
      .map((l) => (l.split(/[?:]/)[0] as string).trim());
    expect(members).toContain('verdict');
  });
});
