import type { TelemetryEvent } from '@crown/contracts';
import type { GroundTruth, SimulatorRunSummary } from '@crown/simulator';
import type { BenignRun } from './benign.js';

/**
 * Oracle blindness boundary (Phase-1 review fix). The Phase-2 detection engine must reach a verdict from
 * C1 telemetry ALONE — it must not peek at the ground-truth label, the encryption key, or the family.
 * This module enforces that structurally: a scenario is exposed to the detector as ONLY {scenario_id,
 * events}; the truth is held in a SEPARATE registry the detector never receives. The grading harness
 * resolves truth by scenario_id AFTER the detector has decided, so detection cannot cheat off the label.
 */

export interface BlindScenario {
  scenario_id: string; // opaque; carries NO information about the label
  events: TelemetryEvent[]; // the ONLY thing the detector receives
}

export class GroundTruthRegistry {
  private truth = new Map<string, GroundTruth>();
  private seq = 0;

  /** Register a labeled run and return the blinded, telemetry-only view for the detector. */
  fromSimulator(sum: SimulatorRunSummary): BlindScenario {
    return this.register(sum.events, sum.groundTruth);
  }

  fromBenign(run: BenignRun): BlindScenario {
    return this.register(run.events, run.groundTruth);
  }

  private register(events: TelemetryEvent[], truth: GroundTruth): BlindScenario {
    const scenario_id = `sc-${(this.seq++).toString(36)}-${events.length}`;
    this.truth.set(scenario_id, truth);
    return { scenario_id, events };
  }

  /** Resolve the held-out truth — call ONLY in the grading harness, never in the detector path. */
  truthFor(scenario_id: string): GroundTruth | undefined {
    return this.truth.get(scenario_id);
  }

  size(): number {
    return this.truth.size;
  }
}
