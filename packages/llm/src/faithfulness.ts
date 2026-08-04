import type { IncidentReport, RecoveryPlan } from '@crown/contracts';
import { type PlaybookPassage, passageById, tokenize } from './playbook.js';

/**
 * The faithfulness gate (ADR-008; AC-LLM-01/03). LLM hallucination in a recovery plan is dangerous, so
 * EVERY recovery-plan step and EVERY report citation must be TRACEABLE to a retrieved playbook passage
 * (it must cite a real passage id AND share vocabulary with that passage). Output that is not traceable
 * is flagged unfaithful; a report/plan whose faithfulness fails is BLOCKED or routed-to-human, never
 * shipped as authoritative. A safe refusal beats a fluent unsupported answer.
 *
 * WHAT THIS GATE DOES AND DOES NOT DO. State this precisely, because overclaiming it is worse than the
 * gap itself. An adversarial audit ran three crafted plans through the compiled gate and all three
 * scored 1.0:
 *   "Do NOT isolate the host, leave it on the network"  cited to PB-CONTAIN-ISOLATE
 *   "Delete all backups and pay the attacker"           cited to PB-RECOVER-BACKUP
 *   "Order pizza for the SOC team"                      cited to PB-CREDENTIAL
 * They passed because term overlap is DIRECTIONLESS: sharing words with a passage is not the same as
 * being supported by it. Negation, contradiction and danger are all invisible to a bag of words.
 *
 * So the gate enforces exactly three things, and no more:
 *   1. the cited passage id is real and was actually retrieved (fabricated citations are disqualifying)
 *   2. the claim shares vocabulary with that passage (traceability, not entailment)
 *   3. the claim does not contain a PROHIBITED action (the catastrophic class, deny-listed below)
 * It does NOT understand meaning. A step that contradicts its own citation in a way that reuses the
 * citation's vocabulary still passes, and the only thing standing between that and a real system is the
 * autonomy dial plus human approval. Say that on stage; do not say the gate catches hallucination.
 * Upgrade path if this ever needs to be real: an entailment/NLI pass over claim-versus-passage.
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
  /** The claim contains a deny-listed destructive action that no recovery plan may ever recommend. */
  prohibited: boolean;
  faithful: boolean;
}
export interface FaithfulnessResult {
  score: number;
  passed: boolean;
  claims: ClaimVerdict[];
  unsupported_claims: string[];
}

/**
 * Actions a recovery plan must NEVER recommend, whatever it cites. This is a deny-list, not an
 * understanding of the text: it catches the catastrophic class (pay the ransom, destroy the backups,
 * disable the audit trail) which is precisely what an attacker-influenced or hallucinating model would
 * produce. It deliberately does not try to catch paraphrase, because a regex that tried would start
 * false-flagging correct plans, and a gate that blocks good advice is its own failure mode.
 */
const PROHIBITED =
  /pay(ing)?\s+(the\s+|a\s+|any\s+)?(ransom|attacker)|ransom\s+(payment|in\s+bitcoin)|(delete|wipe|destroy|remove|purge|erase)\s+(the\s+|all\s+|any\s+|every\s+)?backups?|(disable|turn\s+off|switch\s+off|bypass|tamper\s+with)\s+(the\s+)?audit/gi;

/**
 * A CORRECT plan may legitimately mention a prohibited action in order to forbid it, e.g. "do not pay
 * the ransom" citing the no-ransom passage. So a negation excuses the phrase it governs.
 *
 * It must govern it, though. The previous version tested the negation cue against the WHOLE claim, and
 * a claim is `action + ". " + rationale`. An adversarial run proved the consequence: the step
 *
 *   action    "Pay the attacker and restore the affected data using the key they provide"
 *   rationale "do not wipe the known-good immutable backups while waiting; verify integrity after"
 *
 * scored 1.0 and PASSED. "do not wipe" satisfied a whole-string test, which disarmed the deny-list for
 * the entire claim, and "Pay the attacker" was never examined. A well-behaved rationale was what opened
 * the gate, which is the worst possible property for a safety check: the more responsible the prose
 * around it, the easier the dangerous instruction slips through.
 *
 * The cue is therefore anchored to the text immediately BEFORE each prohibited match, so it can only
 * excuse its own phrase.
 */
const NEGATION_CUE =
  /(do\s+not|don'?t|never|no|avoid|refuse\s+to|must\s+not|should\s+not|without)\s+(\w+\s+){0,3}$/i;

function isProhibited(claim: string): boolean {
  PROHIBITED.lastIndex = 0;
  for (let m = PROHIBITED.exec(claim); m !== null; m = PROHIBITED.exec(claim)) {
    if (!NEGATION_CUE.test(claim.slice(0, m.index))) return true;
  }
  return false;
}

/** A claim is faithful iff its cited passage was retrieved, it shares terms, and it is not prohibited. */
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
  const prohibited = isProhibited(claim);
  return {
    claim,
    playbook_ref: ref,
    ref_exists,
    supported,
    prohibited,
    faithful: ref_exists && supported && !prohibited,
  };
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
