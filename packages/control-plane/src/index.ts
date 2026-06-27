/**
 * @crown/control-plane — the hardened, deny-by-default control plane (Phase 3, ADR-007/012).
 * Mutual-TLS agent<->control-plane channel with certificate identity (AC-SEC-01); deny-by-default
 * authorization on every privileged action (AC-SEC-03); the C6 actuation channel bound to that identity.
 */
export { type MtlsCerts, type MtlsHandler, SecureControlPlane, secureSend } from './mtls.js';
export { type AuthzDecision, AuthorizationPolicy, type PrivilegedAction } from './authz.js';
export { AgentCommandServer, type CommandExecutor, MtlsCommandChannel } from './command-channel.js';
