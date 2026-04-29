# Git Repository Rules

To maintain the cryptographic integrity and high-assurance security of Trustline, all contributors must adhere to these rules.

## 1. Branching & Merging
*   **No Direct Pushes:** Pushing directly to `main` or `production` is strictly prohibited.
*   **Mandatory Pull Requests:** Every change must be submitted via a Pull Request (PR).
*   **Two-Key Approval Rule:** No PR can be merged without at least **two senior engineer approvals**.
*   **Cryptographic Veto:** Changes to `crypto_core` or X3DH/Ratchet logic require approval from the **Principal Cryptography Architect**.

## 2. Commit Standards
*   **Atomic Commits:** Small, logical, and testable changes.
*   **Prefixes:** Use `feat:`, `fix:`, `docs:`, `security:`, or `infra:`.
    *   *Example:* `security(backend): harden RLS policies for tenant isolation`

## 3. Automated CI/CD Gates (Pre-Merge)
*   **100% Test Coverage:** Mandatory for cryptographic/security modules.
*   **Security Audits:** `cargo audit` and `npm audit` must pass.
*   **Linting:** `cargo clippy` and strict ESLint must have zero warnings.
*   **Integration Tests:** Playwright E2E and multi-tenant isolation tests must pass.
*   **Fuzzing:** Core API and WebSocket handlers are subjected to automated fuzzing.

## 4. Security Hygiene
*   **Zero-Knowledge Environment:** Never commit `.env` files, private keys, or development databases.
*   **Memory Safety:** Adhere to Rust's strict ownership model. Use of `unsafe` requires justification and specific review.
*   **IPC Isolation:** Maintain a "Zero-Trust" boundary between the Rust backend and the React webview (Tauri).
