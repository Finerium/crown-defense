import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsObserver } from '@crown/agent';
import { loadConfig } from '@crown/detection';
import { SafeSimulator, generateFile } from '@crown/simulator';
import { describe, expect, it } from 'vitest';
import { runDetection } from './detection-harness.js';

/**
 * End-to-end at the detection layer: the AGENT observes real files (computing C1 with its OWN validators),
 * and the resulting telemetry drives the detection engine. This is the live producer->consumer path that
 * Phase 6 wires fully (agent -> detection -> containment -> LLM -> dashboard).
 */
const cfg = loadConfig({});

describe('agent observer -> detection (live C1 path)', () => {
  it('observes an IN-PLACE intermittent campaign and detection reaches MASS_ENCRYPTION', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crown-e2e-'));
    const sim = new SafeSimulator({
      targetDir: dir,
      mode: 'INTERMITTENT_EVERY_N_BYTES',
      filesPerSecond: 120,
      fileTypes: ['png', 'docx'],
      encryptedExtension: '.x',
      keepKey: true,
      seed: 'e2e',
      rename: false, // in-place so the observer matches each file to its pre-image (same-offset delta)
    });
    await sim.seed(12);
    const obs = new FsObserver({ agentId: 'a1', hostId: 'h1' });
    await obs.snapshot(dir); // baseline BEFORE encryption
    await sim.run(); // encrypt in place
    const events = await obs.poll(dir, Date.parse('2026-06-28T00:00:01.000Z'));

    expect(events.length).toBe(12);
    // The agent INDEPENDENTLY found the files structurally invalid (magic intact => the format signal).
    expect(events.some((e) => e.file.format_valid === false)).toBe(true);
    expect(events.every((e) => e.file.header_changed === false)).toBe(true); // intermittent preserves magic
    const r = runDetection('e2e-attack', events, 'ATTACK', cfg);
    expect(r.verdict).toBe('MASS_ENCRYPTION');
    await sim.restore();
    await rm(dir, { recursive: true, force: true });
  });

  it('observes a benign create-many-valid-files workload and does NOT recommend isolation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crown-e2e-b-'));
    const out = join(dir, 'backup');
    await mkdir(out, { recursive: true });
    const obs = new FsObserver({ agentId: 'a1', hostId: 'h1' });
    await obs.snapshot(out);
    for (let i = 0; i < 10; i++) await writeFile(join(out, `snap_${i}.docx`), generateFile('docx', 8000, i)); // valid archives
    const events = await obs.poll(out, Date.parse('2026-06-28T00:00:01.000Z'));

    expect(events.length).toBe(10);
    expect(events.every((e) => e.file.format_valid === true)).toBe(true); // valid archives
    expect(events.every((e) => e.file.entropy_read === null)).toBe(true); // creates => no same-offset delta
    const r = runDetection('e2e-benign', events, 'BENIGN', cfg);
    expect(r.recommendedAction).not.toBe('ISOLATE_HOST'); // high entropy + high op-freq, but only 1 signal
    await rm(dir, { recursive: true, force: true });
  });
});
