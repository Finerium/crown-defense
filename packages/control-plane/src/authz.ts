/**
 * Deny-by-default authorization for the hardened control plane (ADR-007, ADR-012; AC-SEC-03).
 * Every privileged operation requires an AUTHENTICATED principal (the mTLS certificate CN) that has been
 * EXPLICITLY granted that operation. Anything else — an unauthenticated caller, an authenticated-but-
 * ungranted principal, an unknown action — is denied. There is no implicit allow.
 */
export type PrivilegedAction =
  | 'ISSUE_COMMAND' // issue a containment AgentCommand to an agent
  | 'CHANGE_DIAL' // change the autonomy dial
  | 'APPROVE_ACTION' // dual-control approval
  | 'APPLY_UPDATE' // push a signed agent update
  | 'READ_AUDIT' // export/read the audit log
  | 'ENROLL_AGENT'; // register a new agent

export interface AuthzDecision {
  allowed: boolean;
  reason: string;
}

export class AuthorizationPolicy {
  private grants = new Map<string, Set<PrivilegedAction>>();

  /** Grant a principal (by mTLS cert CN) a privileged action. The ONLY way to allow anything. */
  grant(principal: string, action: PrivilegedAction): this {
    const set = this.grants.get(principal) ?? new Set<PrivilegedAction>();
    set.add(action);
    this.grants.set(principal, set);
    return this;
  }

  revoke(principal: string, action: PrivilegedAction): void {
    this.grants.get(principal)?.delete(action);
  }

  /** Deny-by-default authorization check. `principal` is null for an unauthenticated caller. */
  authorize(principal: string | null | undefined, action: PrivilegedAction): AuthzDecision {
    if (!principal) return { allowed: false, reason: 'unauthenticated: deny-by-default' };
    if (this.grants.get(principal)?.has(action)) return { allowed: true, reason: 'granted' };
    return { allowed: false, reason: `principal '${principal}' not granted '${action}': deny-by-default` };
  }
}
