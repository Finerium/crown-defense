import { AgentContainment, AgentSelfProtection } from '@crown/agent';
import { type AuditSink, ContainmentModule } from '@crown/containment';
import {
  type ActionRecord,
  type AgentCommand,
  type DetectionVerdict,
  SCHEMA_VERSION,
} from '@crown/contracts';
import {
  AgentCommandServer,
  AuthorizationPolicy,
  MtlsCommandChannel,
  secureSend,
} from '@crown/control-plane';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestPki, genTestPki } from './pki.js';

let pki: TestPki;
beforeAll(() => {
  pki = genTestPki('control-plane-001', 'agent-001');
});

function ping(): AgentCommand {
  return {
    schema_version: SCHEMA_VERSION,
    command_id: 'cmd-ping',
    issued_at: '2026-06-28T00:00:00.000Z',
    target_agent_id: 'agent-001',
    target_host_id: 'host-1',
    command_type: 'PING',
    params: { pid: null, share_paths: null, update_ref: null },
    authorization: {
      autonomy_mode: 'FULL_AUTO',
      verdict_id: 'v',
      approver_id: null,
      requestor_id: null,
      action_record_id: 'a',
    },
    rollback_deadline: null,
  };
}

function isolateVerdict(): DetectionVerdict {
  return {
    schema_version: SCHEMA_VERSION,
    verdict_id: 'vd-1',
    host_id: 'host-1',
    agent_id: 'agent-001',
    decided_at: '2026-06-28T00:00:00.000Z',
    verdict: 'MASS_ENCRYPTION',
    confidence: 0.85,
    fast_path: true,
    signals: [{ signal_type: 'CANARY_TAMPER', fired: true, score: 1, detail: 'decoy' }],
    corroborating_count: 1,
    recommended_action: 'ISOLATE_HOST',
    evidence_ref: 'e',
  };
}

describe('AC-SEC-01: mutual-TLS agent <-> control-plane channel', () => {
  it('accepts a CA-trusted control plane and REJECTS a rogue / unauthenticated peer', async () => {
    const agent = new AgentContainment('agent-001');
    const server = new AgentCommandServer(
      { key: pki.serverKey, cert: pki.serverCert, ca: [pki.ca] },
      (cmd) => agent.execute(cmd),
      {
        agentId: 'agent-001',
        trustedIssuerCN: 'control-plane-001',
      }
    );
    const port = await server.listen();
    try {
      // good control plane (cert chains to the CA) -> command flows
      const good = new MtlsCommandChannel({
        port,
        certs: { key: pki.clientKey, cert: pki.clientCert, ca: [pki.ca] },
      });
      expect((await good.issue(ping())).outcome).toBe('EXECUTED');

      // rogue control plane (cert from an UNTRUSTED CA) -> handshake rejected
      const rogue = new MtlsCommandChannel({
        port,
        certs: { key: pki.rogueKey, cert: pki.rogueCert, ca: [pki.ca] },
      });
      await expect(rogue.issue(ping())).rejects.toBeDefined();

      // unauthenticated (no client cert) -> rejected
      await expect(
        secureSend({ port, certs: { key: '', cert: '', ca: [pki.ca] }, message: ping(), timeoutMs: 3000 })
      ).rejects.toBeDefined();
    } finally {
      await server.close();
    }
  }, 25000);

  it('binds the control-plane identity (cert CN) and can pin a trusted issuer', async () => {
    const agent = new AgentContainment('agent-001');
    // pin a DIFFERENT trusted issuer CN than the client's -> command rejected even though the cert is valid
    const server = new AgentCommandServer(
      { key: pki.serverKey, cert: pki.serverCert, ca: [pki.ca] },
      (cmd) => agent.execute(cmd),
      {
        agentId: 'agent-001',
        trustedIssuerCN: 'some-other-control-plane',
      }
    );
    const port = await server.listen();
    try {
      const chan = new MtlsCommandChannel({
        port,
        certs: { key: pki.clientKey, cert: pki.clientCert, ca: [pki.ca] },
      });
      const r = await chan.issue(ping());
      expect(r.outcome).toBe('REJECTED');
      expect(r.reason).toContain('unauthorized control-plane identity');
    } finally {
      await server.close();
    }
  });
});

describe('AC-SEC-03: deny-by-default control-plane authorization', () => {
  it('denies the unauthenticated, denies the ungranted, allows only the explicitly granted', () => {
    const authz = new AuthorizationPolicy()
      .grant('soc-lead', 'CHANGE_DIAL')
      .grant('soc-lead', 'APPROVE_ACTION');
    expect(authz.authorize(null, 'CHANGE_DIAL').allowed).toBe(false); // unauthenticated
    expect(authz.authorize('intern', 'CHANGE_DIAL').allowed).toBe(false); // not granted
    expect(authz.authorize('soc-lead', 'APPLY_UPDATE').allowed).toBe(false); // granted other actions, not this
    expect(authz.authorize('soc-lead', 'CHANGE_DIAL').allowed).toBe(true); // explicitly granted
  });
});

describe('AC-SEC-02: agent anti-tamper / self-protection', () => {
  it('detects tamper and self-heals; blocks unauthorized stop; allows authorized stop', () => {
    const hardened = new TextEncoder().encode(
      'autonomy=monitor_only;kill_switch=deny_default;protected=true'
    );
    const sp = new AgentSelfProtection(hardened);

    // intact config verifies clean
    expect(sp.verifyIntegrity(hardened).result.intact).toBe(true);

    // tampered config -> detected + self-healed back to the hardened baseline
    const tampered = new TextEncoder().encode('autonomy=full_auto;kill_switch=off;protected=false');
    const v = sp.verifyIntegrity(tampered);
    expect(v.result.intact).toBe(false);
    expect(v.result.healed).toBe(true);
    expect(new TextDecoder().decode(v.config)).toBe(new TextDecoder().decode(hardened)); // restored

    // unauthorized stop blocked; authorized stop allowed
    expect(sp.requestStop(false).stopped).toBe(false);
    expect(sp.isRunning()).toBe(true);
    expect(sp.unauthorizedStopAttempts()).toBe(1);
    expect(sp.requestStop(true).stopped).toBe(true);
    expect(sp.isRunning()).toBe(false);
  });
});

describe('secure end-to-end: verdict -> audit -> mTLS command -> agent isolates', () => {
  it('a FULL_AUTO verdict isolates the host over the mutually-authenticated channel', async () => {
    const agent = new AgentContainment('agent-001');
    const server = new AgentCommandServer(
      { key: pki.serverKey, cert: pki.serverCert, ca: [pki.ca] },
      (cmd) => agent.execute(cmd),
      {
        agentId: 'agent-001',
        trustedIssuerCN: 'control-plane-001',
      }
    );
    const port = await server.listen();
    try {
      const appended: string[] = [];
      const audit: AuditSink = {
        async append(rec) {
          appended.push(rec.action_type);
          return { ...rec, chain_seq: 0, prev_hash: '0', record_hash: 'h' } as ActionRecord;
        },
      };
      const issuer = new MtlsCommandChannel({
        port,
        certs: { key: pki.clientKey, cert: pki.clientCert, ca: [pki.ca] },
      });
      const cm = new ContainmentModule({ audit, issuer });
      const out = await cm.handleVerdict(isolateVerdict(), 'FULL_AUTO', true);
      expect(out.decision.disposition).toBe('EXECUTE');
      expect(out.result?.outcome).toBe('EXECUTED');
      expect(agent.isIsolated('host-1')).toBe(true);
      // two-phase audit: QUEUED intent (audit precedes the command) + EXECUTED terminal (records the result)
      expect(appended).toEqual(['ISOLATE_HOST', 'ISOLATE_HOST']);
    } finally {
      await server.close();
    }
  });
});

describe('control-plane review fixes: fail-closed issuer authorization', () => {
  it('a CA-trusted client with NO pinned issuer / NO grant is DENIED (CA membership is not authority)', async () => {
    const agent = new AgentContainment('agent-001');
    // server configured with NEITHER trustedIssuerCN NOR an authz policy => deny-by-default
    const server = new AgentCommandServer(
      { key: pki.serverKey, cert: pki.serverCert, ca: [pki.ca] },
      (c) => agent.execute(c),
      { agentId: 'agent-001' }
    );
    const port = await server.listen();
    try {
      const chan = new MtlsCommandChannel({
        port,
        certs: { key: pki.clientKey, cert: pki.clientCert, ca: [pki.ca] },
      });
      const r = await chan.issue(ping());
      expect(r.outcome).toBe('REJECTED');
      expect(r.reason).toContain('unauthorized control-plane identity');
    } finally {
      await server.close();
    }
  }, 15000);

  it('an explicit ISSUE_COMMAND grant authorizes the control plane', async () => {
    const agent = new AgentContainment('agent-001');
    const authz = new AuthorizationPolicy().grant('control-plane-001', 'ISSUE_COMMAND');
    const server = new AgentCommandServer(
      { key: pki.serverKey, cert: pki.serverCert, ca: [pki.ca] },
      (c) => agent.execute(c),
      { agentId: 'agent-001', authz }
    );
    const port = await server.listen();
    try {
      const chan = new MtlsCommandChannel({
        port,
        certs: { key: pki.clientKey, cert: pki.clientCert, ca: [pki.ca] },
      });
      expect((await chan.issue(ping())).outcome).toBe('EXECUTED');
    } finally {
      await server.close();
    }
  }, 15000);
});

afterAll(() => {
  /* temp PKI dir is left in os tmp; reaped by the OS */
});
