import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSimulator } from '@crown/simulator';
import { describe, expect, it } from 'vitest';
import { runBenignSuite } from './benign.js';
import { GroundTruthRegistry } from './scenario.js';

describe('oracle blindness boundary', () => {
  it('exposes ONLY {scenario_id, events} to the detector; truth held separately', async () => {
    const reg = new GroundTruthRegistry();
    const dir = await mkdtemp(join(tmpdir(), 'crown-blind-'));
    const sim = createSimulator({
      targetDir: dir,
      mode: 'FULL',
      filesPerSecond: 100,
      fileTypes: ['docx'],
      encryptedExtension: '.vntr',
      keepKey: true,
      seed: 'blind',
      family: 'LockBit-3.0',
    });
    await sim.seed(4);
    const blind = reg.fromSimulator(await sim.run());

    // The blinded view leaks nothing: no 'groundTruth', 'family', 'mode', or key on the object.
    expect(Object.keys(blind).sort()).toEqual(['events', 'scenario_id']);
    expect(JSON.stringify(blind)).not.toContain('LockBit'); // family never reaches the detector
    expect(JSON.stringify(blind)).not.toContain('ATTACK');

    // Truth is resolvable ONLY via the registry, by opaque id, after the fact.
    expect(reg.truthFor(blind.scenario_id)?.kind).toBe('ATTACK');
    expect(reg.truthFor('nonexistent')).toBeUndefined();
  });

  it('benign runs register as BENIGN truth without leaking the workload into events payload shape', async () => {
    const reg = new GroundTruthRegistry();
    const dir = await mkdtemp(join(tmpdir(), 'crown-blind-'));
    const runs = await runBenignSuite(dir);
    const blind = reg.fromBenign(runs[0] as (typeof runs)[number]);
    expect(reg.truthFor(blind.scenario_id)?.kind).toBe('BENIGN');
    expect(reg.size()).toBe(1);
  });
});
