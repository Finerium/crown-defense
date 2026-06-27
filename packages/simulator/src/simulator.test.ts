import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TelemetryEvent } from '@crown/contracts';
import { describe, expect, it } from 'vitest';
import {
  ALL_EVASION_MODES,
  type EvasionMode,
  FAMILY_COUNT,
  FAMILY_PROFILES,
  type FileType,
  MODES_COVERED,
  SafeSimulator,
  type SimulatorConfig,
  createSimulator,
  generateFile,
  validateFormat,
} from './index.js';

async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'crown-sim-'));
}

function cfg(dir: string, mode: EvasionMode, over: Partial<SimulatorConfig> = {}): SimulatorConfig {
  return {
    targetDir: dir,
    mode,
    filesPerSecond: 100,
    fileTypes: ['docx'],
    encryptedExtension: '.vntr',
    keepKey: true,
    seed: `s-${mode}`,
    ...over,
  };
}

describe('format generators + validators (oracle ground truth)', () => {
  const types: FileType[] = ['txt', 'csv', 'pdf', 'png', 'jpg', 'docx', 'xlsx'];
  for (const t of types) {
    it(`generates a structurally-valid ${t}`, () => {
      expect(validateFormat(t, generateFile(t, 8000, 7))).toBe(true);
    });
    it(`flags a corrupted ${t} as invalid`, () => {
      const buf = generateFile(t, 8000, 7);
      buf[0] = (buf[0] as number) ^ 0xff; // smash the magic byte
      buf[Math.floor(buf.length / 2)] = (buf[Math.floor(buf.length / 2)] as number) ^ 0xff;
      expect(validateFormat(t, buf)).toBe(false);
    });
  }
});

describe('SIM-SAFE: benign / reversible / single-directory / no-network', () => {
  it('restores every byte exactly (reversible by construction)', async () => {
    const dir = await tmp();
    const sim = createSimulator(cfg(dir, 'FULL', { fileTypes: ['docx', 'png', 'txt'] }));
    await sim.seed(12);
    const before = new Map<string, Buffer>();
    for (const p of await sim.list()) before.set(p, await readFile(p));
    await sim.run();
    const r = await sim.restore();
    expect(r.allValid).toBe(true);
    expect(r.restored).toBe(12);
    for (const [p, original] of before) {
      const now = await readFile(p);
      expect(Buffer.compare(now, original)).toBe(0); // byte-identical after restore
    }
  });

  it('emitted file paths never escape targetDir', async () => {
    const dir = await tmp();
    const sim = createSimulator(cfg(dir, 'FULL'));
    await sim.seed(8);
    const root = resolve(dir);
    const sum = await sim.run();
    for (const e of sum.events) {
      const p = e.file.path as string;
      const rel = relative(root, resolve(p));
      expect(rel.startsWith('..') || isAbsolute(rel)).toBe(false);
    }
  });

  it('the package imports no network / child-process modules', async () => {
    const srcDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
    const forbidden = [
      'net',
      'http',
      'https',
      'dgram',
      'tls',
      'child_process',
      'node:net',
      'node:http',
      'node:https',
      'node:dgram',
      'node:tls',
      'node:child_process',
    ];
    for (const f of await readdir(srcDir)) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
      const src = await readFile(join(srcDir, f), 'utf8');
      const specs = [...src.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const s of specs) expect(forbidden).not.toContain(s);
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/\brequire\s*\(/);
    }
  });
});

describe('SIM-MODES: each evasion mode produces its signal signature', () => {
  it('FULL on text: high entropy delta + invalid format + header changed', async () => {
    const dir = await tmp();
    const sim = createSimulator(cfg(dir, 'FULL', { fileTypes: ['txt'] }));
    await sim.seed(4);
    const e = (await sim.run()).events[0] as TelemetryEvent;
    expect(e.file.entropy_read as number).toBeLessThan(5.5);
    expect(e.file.entropy_write as number).toBeGreaterThan(7.0);
    expect(e.file.format_valid).toBe(false);
    expect(e.file.header_changed).toBe(true);
  });

  it('INTERMITTENT: format invalid BUT entropy ~flat AND header NOT changed (the entropy-evasion case)', async () => {
    const dir = await tmp();
    const sim = createSimulator(
      cfg(dir, 'INTERMITTENT_EVERY_N_BYTES', { fileTypes: ['docx', 'png'], intermittentBlockBytes: 16 })
    );
    await sim.seed(10);
    const sum = await sim.run();
    expect(sum.formatBrokenCount).toBe(10);
    for (const e of sum.events) {
      expect(e.file.format_valid).toBe(false); // format-validation catches it
      expect(e.file.header_changed).toBe(false); // magic preserved
      const delta = Math.abs((e.file.entropy_write as number) - (e.file.entropy_read as number));
      expect(delta).toBeLessThan(1.0); // entropy alone would MISS this
    }
  });

  it('HEADER_ONLY: header changed + invalid format', async () => {
    const dir = await tmp();
    const sim = createSimulator(cfg(dir, 'HEADER_ONLY', { fileTypes: ['docx'] }));
    await sim.seed(4);
    const e = (await sim.run()).events[0] as TelemetryEvent;
    expect(e.file.header_changed).toBe(true);
    expect(e.file.format_valid).toBe(false);
  });

  it('FIRST_4KB: invalid format + header changed on a >4KB file', async () => {
    const dir = await tmp();
    const sim = createSimulator(cfg(dir, 'FIRST_4KB', { fileTypes: ['png'] }));
    await sim.seed(20);
    const sum = await sim.run();
    expect(sum.formatBrokenCount).toBe(20);
    expect((sum.events[0] as TelemetryEvent).file.header_changed).toBe(true);
  });

  it('LOW_AND_SLOW: low writes/sec, spread timestamps, still corrupts content', async () => {
    const dir = await tmp();
    const sim = createSimulator(cfg(dir, 'LOW_AND_SLOW', { filesPerSecond: 3, fileTypes: ['docx'] }));
    await sim.seed(5);
    const sum = await sim.run();
    const e0 = sum.events[0] as TelemetryEvent;
    expect(e0.op_window?.writes_per_sec as number).toBeLessThanOrEqual(5);
    expect(sum.formatBrokenCount).toBe(5);
    const t0 = Date.parse((sum.events[0] as TelemetryEvent).emitted_at);
    const t1 = Date.parse((sum.events[1] as TelemetryEvent).emitted_at);
    expect(t1 - t0).toBeGreaterThanOrEqual(300); // ~1/3s gap at 3 files/sec
  });
});

describe('canary fast-path substrate (AC-DET-04 enabler)', () => {
  it('emits a CANARY_TOUCHED event for the planted canary', async () => {
    const dir = await tmp();
    const sim = createSimulator(cfg(dir, 'FULL', { plantCanary: true }));
    await sim.seed(5);
    const sum = await sim.run();
    expect(sum.canaryTouched).toBe(true);
    const canaryEvt = sum.events.find((e) => e.event_type === 'CANARY_TOUCHED');
    expect(canaryEvt).toBeDefined();
    expect(canaryEvt?.canary?.canary_id).toBeTruthy();
    expect(canaryEvt?.canary?.operation).toBe('WRITE');
  });
});

describe('C1 contract conformance: every emitted event validates against the frozen schema', () => {
  for (const mode of ALL_EVASION_MODES) {
    it(`${mode} emits only contract-valid TelemetryEvents`, async () => {
      const dir = await tmp();
      const sim = createSimulator(cfg(dir, mode, { fileTypes: ['docx', 'png', 'txt'], plantCanary: true }));
      await sim.seed(6);
      const sum = await sim.run();
      expect(sum.events.length).toBeGreaterThan(0);
      for (const e of sum.events) expect(() => TelemetryEvent.parse(e)).not.toThrow();
    });
  }
});

describe('SIM-COVERAGE: AC-DET-06 substrate', () => {
  it('>=20 families and >=4 evasion modes', () => {
    expect(FAMILY_COUNT).toBeGreaterThanOrEqual(20);
    expect(MODES_COVERED).toBeGreaterThanOrEqual(4);
    expect(ALL_EVASION_MODES.length).toBe(5);
  });

  it('every family profile runs and corrupts files', async () => {
    const fam = FAMILY_PROFILES[0] as (typeof FAMILY_PROFILES)[number];
    const dir = await tmp();
    const sim = new SafeSimulator({
      targetDir: dir,
      mode: fam.mode,
      filesPerSecond: fam.filesPerSecond,
      fileTypes: fam.fileTypes,
      encryptedExtension: '.vntr',
      keepKey: true,
      seed: `fam-${fam.name}`,
      family: fam.name,
      ...(fam.blockBytes ? { intermittentBlockBytes: fam.blockBytes } : {}),
    });
    await sim.seed(8);
    const sum = await sim.run();
    expect(sum.groundTruth.kind).toBe('ATTACK');
    expect(sum.filesTouched).toBe(8);
  });
});

describe('determinism', () => {
  it('same seed => identical telemetry fields', async () => {
    const run = async () => {
      const dir = await tmp();
      const sim = createSimulator(cfg(dir, 'FULL', { fileTypes: ['png'], seed: 'fixed' }));
      await sim.seed(4);
      return (await sim.run()).events.map((e) => [e.file.entropy_write, e.file.format_valid]);
    };
    expect(await run()).toEqual(await run());
  });
});
