# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ Active |

## Responsible Disclosure Policy

If you discover a security vulnerability, we appreciate your help in disclosing it to us in a responsible manner.

## Contact

Please contact us at **security@trustline.app**.

PGP key available upon request.

## Scope

The scope of this program covers:
- `crates/backend` — API server and WebSocket routing
- `crates/crypto_core` — X3DH, Double Ratchet, and cryptographic primitives
- `apps/desktop/src-tauri` — Tauri commands handling private keys and encryption
- `apps/desktop/src/lib/vault.ts` — Local encrypted storage

## Response Time

We commit to a **48-hour** response time for all security reports submitted to the email above.

## Exclusions

The following are out of scope:
- UI-only issues that don't affect data security
- Denial of service against development infrastructure
