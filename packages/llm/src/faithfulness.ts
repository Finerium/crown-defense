import type { IncidentReport, RecoveryPlan } from '@crown/contracts';
import { type PlaybookPassage, passageById, tokenize } from './playbook.js';

/**
 * The faithfulness gate (ADR-008; AC-LLM-01/03). LLM hallucination in a recovery plan is dangerous, so
 * EVERY recovery-plan step and EVERY report citation must be TRACEABLE to a retrieved playbook passage
 * (it must cite a real passage id AND its content must be supported by that passage). Output that is not
 * traceable is flagged unfaithful; a report/plan whose faithfulness fails is BLOCKED or routed-to-human,
 * never shipped as authoritative. A safe refusal beats a fluent unsupported answer.
 */
export interface FaithfulnessConfig {
  /** Minimum fraction of faithful claims to PASS. */
  threshold: number;
  /** Minimum shared meaningful terms between a claim and its cited passage to count as "supported". */
  minSupportTerms: number;
}
export const DEFAULT_FAITHFULNESS: FaithfulnessConfig = { threshold: 0.8, minSupportTerms: 2 };

export interface ClaimVerdict {
  claim: string;
  playbook_ref: string;
  ref_exists: boolean;
  supported: boolean;
  faithful: boolean;
}
export interface FaithfulnessResult {
  score: number;
  passed: boolean;
  claims: ClaimVerdict[];
  unsupported_claims: string[];
}

/** A claim is supported iff its cited passage exists AND shares >= minSupportTerms meaningful terms. */
function verifyClaim(
  claim: string,
  ref: string,
  retrieved: PlaybookPassage[],
  cfg: FaithfulnessConfig
): ClaimVerdict {
  const passage = retrieved.find((p) => p.id === ref) ?? passageById(ref);
  const ref_exists = passage !== undefined && retrieved.some((p) => p.id === ref);
  let supported = false;
  if (passage && ref_exists) {
    const pTerms = new Set(tokenize(`${passage.title} ${passage.content}`));
    const shared =
      new Set(tokenize(claim)).size === 0
        ? 0
        : [...new Set(tokenize(claim))].filter((t) => pTerms.has(t)).length;
    supported = shared >= cfg.minSupportTerms;
  }
  return { claim, playbook_ref: ref, ref_exists, supported, faithful: ref_exists && supported };
}

/** Gate a recovery plan + report against the retrieved passages. */
export function checkFaithfulness(
  report: Pick<IncidentReport, 'summary' | 'citations'>,
  plan: Pick<RecoveryPlan, 'steps'>,
  retrieved: PlaybookPassage[],
  cfg: FaithfulnessConfig = DEFAULT_FAITHFULNESS
): FaithfulnessResult {
  const claims: ClaimVerdict[] = [];
  for (const step of plan.steps) {
    claims.push(verifyClaim(`${step.action}. ${step.rationale}`, step.playbook_ref, retrieved, cfg));
  }
  for (const c of report.citations) {
    claims.push(verifyClaim(c.claim, c.playbook_ref, retrieved, cfg));
  }
  const faithful = claims.filter((c) => c.faithful).length;
  const score = claims.length === 0 ? 0 : faithful / claims.length;
  // PASS requires meeting the threshold AND that no cited ref is fabricated (a fake citation is disqualifying).
  const noFabricated = claims.every((c) => c.ref_exists);
  const passed = claims.length > 0 && score >= cfg.threshold && noFabricated;
  return {
    score: Math.round(score * 1000) / 1000,
    passed,
    claims,
    unsupported_claims: claims.filter((c) => !c.faithful).map((c) => c.claim),
  };
}
