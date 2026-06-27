import {
  type AgentCommand,
  type AgentCommandResult,
  AgentCommandResult as AgentCommandResultSchema,
  AgentCommand as AgentCommandSchema,
  SCHEMA_VERSION,
} from '@crown/contracts';
import type { AuthorizationPolicy } from './authz.js';
import { type MtlsCerts, SecureControlPlane, secureSend } from './mtls.js';

/** Applies a command locally (the agent's containment executor); injected to avoid a package cycle. */
export type CommandExecutor = (cmd: AgentCommand) => AgentCommandResult | Promise<AgentCommandResult>;

/**
 * Agent-side actuation endpoint: an mTLS server that accepts C6 AgentCommands ONLY from the AUTHORIZED
 * control plane. mTLS proves the peer chains to the fleet CA; that is NECESSARY but NOT SUFFICIENT (a
 * compromised peer agent reuses a fleet cert), so issuer identity MUST be authorized too (deny-by-default,
 * review HIGH): either the peer CN matches the pinned trustedIssuerCN, OR an AuthorizationPolicy grants it
 * ISSUE_COMMAND. With NEITHER configured the server denies every command (fail-closed). The command is then
 * schema-validated and the agent's own C6 authz (rejectionReason) applies.
 */
export class AgentCommandServer {
  private cp: SecureControlPlane;

  constructor(
    certs: MtlsCerts,
    executor: CommandExecutor,
    opts: { trustedIssuerCN?: string; authz?: AuthorizationPolicy; agentId?: string } = {}
  ) {
    this.cp = new SecureControlPlane(certs, async (msg, peerCN) => {
      const reject = (reason: string): AgentCommandResult => ({
        schema_version: SCHEMA_VERSION,
        command_id: (msg as { command_id?: string })?.command_id ?? 'unknown',
        agent_id: opts.agentId ?? '',
        completed_at: new Date().toISOString(),
        outcome: 'REJECTED',
        reason,
      });
      // MANDATORY issuer authorization (deny-by-default): bare CA-chain membership is NOT authority.
      const pinned = opts.trustedIssuerCN !== undefined && peerCN === opts.trustedIssuerCN;
      const granted = opts.authz?.authorize(peerCN, 'ISSUE_COMMAND').allowed === true;
      if (!pinned && !granted) {
        return reject(
          `unauthorized control-plane identity '${peerCN}' (no trusted issuer / ISSUE_COMMAND grant)`
        );
      }
      const parsed = AgentCommandSchema.safeParse(msg);
      if (!parsed.success) return reject('malformed AgentCommand (schema rejected at boundary)');
      return executor(parsed.data);
    });
  }

  listen(port = 0): Promise<number> {
    return this.cp.listen(port);
  }
  close(): Promise<void> {
    return this.cp.close();
  }
}

/**
 * Control-plane-side CommandIssuer: sends a C6 AgentCommand to an agent over mTLS and returns its result.
 * Compatible with @crown/containment's CommandIssuer interface (duck-typed: `issue`). The result is
 * schema-validated on return (assume hostile/garbled responses).
 */
export class MtlsCommandChannel {
  private opts: { port: number; host?: string; certs: MtlsCerts };

  constructor(opts: { port: number; host?: string; certs: MtlsCerts }) {
    this.opts = opts;
  }

  async issue(cmd: AgentCommand): Promise<AgentCommandResult> {
    const resp = await secureSend({ ...this.opts, message: cmd });
    const r = AgentCommandResultSchema.safeParse(resp);
    if (!r.success) throw new Error(`invalid AgentCommandResult from agent: ${JSON.stringify(resp)}`);
    return r.data;
  }
}
