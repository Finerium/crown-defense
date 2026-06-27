/**
 * Internal incident-response playbook (the RAG grounding corpus, ADR-008). Scaffolded from public IR
 * frameworks (NIST SP 800-61 incident-handling phases + MITRE ATT&CK technique mappings + ransomware
 * guidance) for the build; the bank supplies its real playbook at deployment. The faithfulness gate
 * REQUIRES every recovery-plan step to cite one of these passage ids — generation that cannot be traced
 * here is blocked or routed to a human ("a safe refusal beats a fluent unsupported answer").
 */
export interface PlaybookPassage {
  id: string;
  title: string;
  content: string;
  technique_ids: string[];
}

export const IR_PLAYBOOK: PlaybookPassage[] = [
  {
    id: 'PB-CONTAIN-ISOLATE',
    title: 'Isolate the affected host',
    technique_ids: ['T1486'],
    content:
      'On confirmed mass-encryption, isolate the affected host from the network immediately to halt the spread of encryption while preserving the host for forensic imaging. Network isolation must keep the management/control channel reachable so the host can be administered.',
  },
  {
    id: 'PB-CONTAIN-LATERAL',
    title: 'Contain lateral movement',
    technique_ids: ['T1021', 'T1021.002'],
    content:
      'Block lateral movement by locking down file shares (SMB) and remote-access protocols (RDP/SSH) between the compromised segment and the rest of the fleet. Disable accounts observed performing the encryption.',
  },
  {
    id: 'PB-KILL-PROCESS',
    title: 'Terminate the encrypting process',
    technique_ids: ['T1486'],
    content:
      'Terminate the malicious encrypting process and remove its persistence mechanisms (services, scheduled tasks, run keys) to stop further file destruction on the host.',
  },
  {
    id: 'PB-RECOVER-BACKUP',
    title: 'Restore from known-good backups',
    technique_ids: [],
    content:
      'After eradication, restore affected data from known-good, offline or immutable backups. Verify backup integrity before restoring and confirm the backups predate the compromise.',
  },
  {
    id: 'PB-CREDENTIAL',
    title: 'Rotate compromised credentials',
    technique_ids: ['T1003'],
    content:
      'Rotate credentials for all accounts that touched the affected systems, reset privileged/domain-admin passwords, and revoke active sessions and tokens to prevent re-entry.',
  },
  {
    id: 'PB-CANARY',
    title: 'Canary/decoy tamper is high-confidence',
    technique_ids: ['T1486'],
    content:
      'A tripped decoy (canary) file is a high-confidence indicator of mass-encryption and should be treated as a confirmed incident, justifying immediate containment under the configured autonomy policy.',
  },
  {
    id: 'PB-SHADOW',
    title: 'Check backup/shadow-copy destruction',
    technique_ids: ['T1490'],
    content:
      'Ransomware frequently deletes Volume Shadow Copies and sabotages backups (Veeam, Hyper-V files) before encrypting. Verify whether recovery mechanisms were destroyed and escalate recovery priority accordingly.',
  },
  {
    id: 'PB-FORENSICS',
    title: 'Preserve forensic evidence',
    technique_ids: [],
    content:
      'Before remediation, capture volatile memory and disk images of the affected host to support root-cause analysis and chain-of-custody. Do not wipe the host until evidence is preserved.',
  },
  {
    id: 'PB-PATIENT-ZERO',
    title: 'Identify patient zero and initial access',
    technique_ids: ['T1566', 'T1190'],
    content:
      'Determine the initial access vector (phishing, exposed RDP, an unpatched internet-facing CVE) and the first compromised host (patient zero), then close that vector to prevent re-infection.',
  },
  {
    id: 'PB-NOTIFY-OJK',
    title: 'Regulatory notification (OJK / UU PDP)',
    technique_ids: [],
    content:
      'A regulated bank must send the initial incident notification and IT incident report to OJK, and where personal data may be affected must notify the affected data subjects and the authority within 72 hours under UU PDP. Preserve the immutable audit trail as evidence.',
  },
  {
    id: 'PB-NO-RANSOM',
    title: 'Do not pay the ransom',
    technique_ids: [],
    content:
      'Per law-enforcement guidance, do not pay the ransom; payment does not guarantee recovery and funds further crime. Engage law enforcement and the incident-response retainer.',
  },
  {
    id: 'PB-MONITOR',
    title: 'Heightened post-incident monitoring',
    technique_ids: [],
    content:
      'After recovery, heighten monitoring for re-infection and keep the autonomy dial conservative until the environment is confirmed clean. Watch for the same indicators that triggered the incident.',
  },
];

const STOP = new Set([
  'the',
  'a',
  'an',
  'to',
  'of',
  'and',
  'or',
  'for',
  'on',
  'in',
  'is',
  'be',
  'by',
  'with',
  'as',
  'at',
  'from',
  'that',
]);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/** Dependency-free TF-IDF retriever. Returns the top-k playbook passages most relevant to the query. */
export function retrieve(query: string, k = 5, corpus: PlaybookPassage[] = IR_PLAYBOOK): PlaybookPassage[] {
  const docs = corpus.map((p) => ({ p, terms: tokenize(`${p.title} ${p.content}`) }));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.terms)) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => Math.log((corpus.length + 1) / ((df.get(t) ?? 0) + 1)) + 1;
  const qTerms = tokenize(query);
  const scored = docs.map(({ p, terms }) => {
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const qt of qTerms) score += (tf.get(qt) ?? 0) * idf(qt);
    return { p, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.p);
}

export function passageById(
  id: string,
  corpus: PlaybookPassage[] = IR_PLAYBOOK
): PlaybookPassage | undefined {
  return corpus.find((p) => p.id === id);
}
