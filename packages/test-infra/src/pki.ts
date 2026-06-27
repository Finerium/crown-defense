import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Generates a throwaway test PKI with real OpenSSL: a trusted CA, a server (agent) cert and a good client
 * (control-plane) cert that both chain to it, and a ROGUE client cert from a DIFFERENT CA. Used to verify
 * the mTLS channel mutually authenticates and rejects untrusted peers (AC-SEC-01). Nothing is committed —
 * these keys live only in a temp dir for the duration of a test run.
 */
export interface TestPki {
  dir: string;
  ca: string;
  serverKey: string;
  serverCert: string;
  clientKey: string;
  clientCert: string;
  rogueKey: string;
  rogueCert: string;
  clientCN: string;
  serverCN: string;
}

function ossl(args: string[], cwd: string): void {
  execFileSync('openssl', args, { cwd, stdio: 'pipe' });
}

export function genTestPki(clientCN = 'control-plane-001', serverCN = 'agent-001'): TestPki {
  const dir = mkdtempSync(join(tmpdir(), 'crown-pki-'));
  const subj = (cn: string) => `/CN=${cn}`;
  ossl(
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'ca.key',
      '-out',
      'ca.crt',
      '-days',
      '1',
      '-subj',
      '/CN=Crown Test CA',
    ],
    dir
  );
  ossl(
    [
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'server.key',
      '-out',
      'server.csr',
      '-subj',
      subj(serverCN),
    ],
    dir
  );
  ossl(
    [
      'x509',
      '-req',
      '-in',
      'server.csr',
      '-CA',
      'ca.crt',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-out',
      'server.crt',
      '-days',
      '1',
    ],
    dir
  );
  ossl(
    [
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'client.key',
      '-out',
      'client.csr',
      '-subj',
      subj(clientCN),
    ],
    dir
  );
  ossl(
    [
      'x509',
      '-req',
      '-in',
      'client.csr',
      '-CA',
      'ca.crt',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-out',
      'client.crt',
      '-days',
      '1',
    ],
    dir
  );
  // rogue: a client cert from an UNTRUSTED CA (does not chain to ca.crt)
  ossl(
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'rca.key',
      '-out',
      'rca.crt',
      '-days',
      '1',
      '-subj',
      '/CN=Rogue CA',
    ],
    dir
  );
  ossl(
    [
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'rogue.key',
      '-out',
      'rogue.csr',
      '-subj',
      '/CN=attacker',
    ],
    dir
  );
  ossl(
    [
      'x509',
      '-req',
      '-in',
      'rogue.csr',
      '-CA',
      'rca.crt',
      '-CAkey',
      'rca.key',
      '-CAcreateserial',
      '-out',
      'rogue.crt',
      '-days',
      '1',
    ],
    dir
  );
  const read = (f: string) => readFileSync(join(dir, f), 'utf8');
  return {
    dir,
    ca: read('ca.crt'),
    serverKey: read('server.key'),
    serverCert: read('server.crt'),
    clientKey: read('client.key'),
    clientCert: read('client.crt'),
    rogueKey: read('rogue.key'),
    rogueCert: read('rogue.crt'),
    clientCN,
    serverCN,
  };
}
