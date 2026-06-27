import {
  type AgentCommand,
  type AgentCommandResult,
  AgentCommandResult as AgentCommandResultSchema,
  AgentCommand as AgentCommandSchema,
  SCHEMA_VERSION,
} from '@crown/contracts';
import { type MtlsCerts, SecureControlPlane, secureSend } from './mtls.js';

/** Applies a command locally (the agent's containment executor); injected to avoid a package cycle. */
export type CommandExecutor = (cmd: AgentCommand) => AgentCommandResult | Promise<AgentCommandResult>;

/**
 * Agent-side actuation endpoint: an mTLS server that accepts C6 AgentCommands ONLY from a control plane
 * whose certificate chains to the trusted CA (and, optionally, whose CN matches the pinned issuer). An
 * unauthenticated/rogue caller never gets past the TLS handshake (AC-SEC-01). The command is schema-
 * validated at the boundary, then executed; the agent's own C6 authz (rejectionReason) still applies.
 */
export class AgentCommandServer {
  private cp: SecureControlPlane;

  constructor(
    certs: MtlsCerts,
    executor: CommandExecutor,
    opts: { trustedIssuerCN?: string; agentId?: string } = {}
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
      if (opts.trustedIssuerCN && peerCN !== opts.trustedIssuerCN) {
        return reject(`untrusted control-plane identity '${peerCN}'`);
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
