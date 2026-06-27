import { createHash } from 'node:crypto';

/**
 * Agent self-protection / anti-tamper (ADR-007; AC-SEC-02). Ransomware's first move is to disable security
 * tooling (Play/Medusa via BYOVD). This component models the build's USERSPACE protections:
 *  - integrity baseline: the agent's hardened config/critical files are hashed; any unauthorized change is
 *    DETECTED and SELF-HEALED (the hardened baseline is re-applied) and an alert is raised.
 *  - unauthorized stop/uninstall is BLOCKED — only an admin-console-authorized stop succeeds.
 *
 * PRODUCTION (OQ-4, human-gated): a signed kernel-mode minifilter/driver with HVCI + a driver blocklist
 * provides tamper resistance the userspace layer cannot (anti-BYOVD). That driver signing is out of build
 * scope; this models the detect-and-self-heal behavior the acceptance criteria verify.
 */
export interface IntegrityResult {
  intact: boolean;
  healed: boolean;
  alert: string | null;
}

export class AgentSelfProtection {
  private baselineHash: string;
  private hardenedConfig: Uint8Array;
  private running = true;
  private stopAttempts = 0;
  private healCount = 0;

  constructor(hardenedConfig: Uint8Array) {
    this.hardenedConfig = hardenedConfig.slice();
    this.baselineHash = this.hash(this.hardenedConfig);
  }

  private hash(b: Uint8Array): string {
    return createHash('sha256').update(b).digest('hex');
  }

  /**
   * Check the current config against the hardened baseline. If tampered, self-heal by returning the
   * hardened baseline to re-apply, and raise an alert. Returns the config the agent should now run with.
   */
  verifyIntegrity(current: Uint8Array): { result: IntegrityResult; config: Uint8Array } {
    if (this.hash(current) === this.baselineHash) {
      return { result: { intact: true, healed: false, alert: null }, config: current };
    }
    this.healCount++;
    return {
      result: {
        intact: false,
        healed: true,
        alert: 'agent integrity tamper detected; hardened baseline re-applied; alert raised',
      },
      config: this.hardenedConfig.slice(),
    };
  }

  /** Unauthorized stop/uninstall is rejected. Only an admin-console-authorized stop succeeds. */
  requestStop(authorized: boolean): { stopped: boolean; alert: string | null } {
    if (!authorized) {
      this.stopAttempts++;
      return { stopped: false, alert: 'unauthorized agent stop attempt blocked (anti-tamper)' };
    }
    this.running = false;
    return { stopped: true, alert: null };
  }

  isRunning(): boolean {
    return this.running;
  }
  unauthorizedStopAttempts(): number {
    return this.stopAttempts;
  }
  healCounter(): number {
    return this.healCount;
  }
}
