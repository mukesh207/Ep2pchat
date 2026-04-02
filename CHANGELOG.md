# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-04-02

### Added
- X3DH + Double Ratchet end-to-end encryption (`crypto_core` crate)
- WebAuthn/FIDO2 passwordless authentication
- Real-time WebSocket messaging with NATS JetStream distributed routing
- PostgreSQL Row-Level Security for multi-tenant isolation
- SQLCipher encrypted local vault with FTS5 full-text search
- Admin panel: user approvals, device revocation, audit logs
- OTPK auto-replenishment system (Rust key generation)
- Offline message persistence and replay on reconnect
- Typing indicators and read receipts
- Docker development and production deployment (Traefik TLS)
- Playwright E2E integration tests (WebSocket protocol, receipts, revocation, tenant isolation)
- CI pipeline (GitHub Actions): backend tests, web build, integration E2E
- Comprehensive documentation: ADRs, architecture, threat model, FRD
