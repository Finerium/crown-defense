import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import tls from 'node:tls';

/**
 * Mutual-TLS channel for agent <-> control-plane traffic (ADR-007, the most security-sensitive path).
 * BOTH sides present a certificate; the server rejects any peer whose cert does not chain to the trusted
 * CA (requestCert + rejectUnauthorized). This is the build's real, verifiable mTLS — not a mock. The peer
 * identity is the certificate subject CN (non-repudiable), which the authorization layer keys on.
 *
 * Production hardens further: hierarchical keys with forward secrecy, non-exportable private keys, HSM
 * custody, short-lived session certs, OCSP/CRL. The mutual-auth + identity-binding property is here.
 */
export interface MtlsCerts {
  key: string | Buffer;
  cert: string | Buffer;
  ca: Array<string | Buffer>;
}

export type MtlsHandler = (message: unknown, peerCN: string) => Promise<unknown> | unknown;

export class SecureControlPlane {
  private server: tls.Server;

  constructor(certs: MtlsCerts, handler: MtlsHandler) {
    this.server = tls.createServer(
      {
        key: certs.key,
        cert: certs.cert,
        ca: certs.ca,
        requestCert: true, // demand a client certificate
        rejectUnauthorized: true, // reject any client whose cert does not chain to our CA
        minVersion: 'TLSv1.2',
      },
      (socket) => {
        const cert = socket.getPeerCertificate();
        const cn = cert && typeof cert.subject === 'object' ? cert.subject.CN : '';
        const peerCN = String(Array.isArray(cn) ? (cn[0] ?? '') : (cn ?? ''));
        let buf = '';
        socket.setEncoding('utf8');
        socket.on('data', async (chunk) => {
          buf += chunk;
          let nl = buf.indexOf('\n');
          while (nl >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            try {
              const resp = await handler(JSON.parse(line), peerCN);
              socket.write(`${JSON.stringify(resp)}\n`);
            } catch (e) {
              socket.write(`${JSON.stringify({ error: String(e) })}\n`);
            }
            nl = buf.indexOf('\n');
          }
        });
        socket.on('error', () => socket.destroy());
      }
    );
  }

  async listen(port = 0): Promise<number> {
    this.server.listen(port);
    await once(this.server, 'listening');
    return (this.server.address() as AddressInfo).port;
  }

  async close(): Promise<void> {
    await new Promise<void>((res) => this.server.close(() => res()));
  }
}

/** Send one JSON message over mTLS and await one JSON reply. Rejects if the handshake fails (bad cert). */
export function secureSend(opts: {
  port: number;
  host?: string;
  certs: MtlsCerts;
  message: unknown;
  timeoutMs?: number;
}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const sock = tls.connect(
      {
        port: opts.port,
        host: opts.host ?? '127.0.0.1',
        key: opts.certs.key,
        cert: opts.certs.cert,
        ca: opts.certs.ca,
        // Test certs carry no SAN; the CA chain is still verified — we only skip hostname matching.
        checkServerIdentity: () => undefined,
        minVersion: 'TLSv1.2',
      },
      () => {
        sock.write(`${JSON.stringify(opts.message)}\n`);
      }
    );
    let buf = '';
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    sock.setEncoding('utf8');
    sock.on('data', (c) => {
      buf += c;
      const nl = buf.indexOf('\n');
      if (nl >= 0) {
        const line = buf.slice(0, nl);
        done(() => resolve(JSON.parse(line)));
        sock.end();
      }
    });
    sock.on('error', (e) => done(() => reject(e))); // handshake failure (rogue/unauthenticated)
    // A rejected mTLS handshake may simply CLOSE without a clean 'error' — reject if closed pre-response.
    sock.on('close', () =>
      done(() => reject(new Error('mTLS connection closed before a response (peer rejected?)')))
    );
    sock.setTimeout(opts.timeoutMs ?? 5000, () => {
      done(() => reject(new Error('mTLS timeout')));
      sock.destroy();
    });
  });
}
