# Trustline Backend Audit & Analysis (Phase 1)

## 1. Architecture Analysis

### Current State
The backend is built as a monolithic Axum application with a flat module structure. While it uses asynchronous Rust (Tokio) and handles multi-tenancy via RLS, it suffers from several "early-stage" architectural patterns that limit enterprise readiness.

### Identified Issues
- **Monolithic State:** `AppState` is a "god object" containing database pools, NATS clients, WebSocket registries, and security configurations.
- **Implicit RLS:** Row-Level Security context is applied manually via `with_rls_context` wrappers. This is prone to developer error (omission).
- **Service Leakage:** Business logic (e.g., protocol handshakes, organization seeding) is scattered across HTTP handlers and the `main.rs` entry point.
- **Unmanaged Task Lifecycle:** WebSocket connections spawn 4 independent Tokio tasks per client without a formal supervisor or structured concurrency management.
- **Lack of Graceful Shutdown:** The server terminates immediately on SIGINT/SIGTERM, potentially dropping in-flight messages or leaving NATS subscriptions dangling.

---

## 2. Security Audit

### Risks & Vulnerabilities
- **Session DOS Vector:** Every REST request triggers a `SELECT 1 FROM sessions` query. An attacker could saturate the DB connection pool with high-frequency unauthorized requests.
- **Non-Distributed Rate Limiting:** The `RateLimiter` is in-memory only. In a multi-node cluster, an attacker could bypass limits by hitting different backend instances.
- **Implicit Organization Creation:** Organizations are created automatically based on email domains. This allows anyone with a new domain to create a tenant, potentially causing "ghost organization" bloat.
- **Key Depletion:** One-Time Pre-Keys (OTPK) are consumed upon request. A malicious user could "scrub" all OTPKs for a victim by repeatedly requesting keys, breaking the victim's ability to receive new handshakes.

---

## 3. Scalability & Performance Analysis

### Bottlenecks
- **DB N+1 Queries:** Key bundle retrieval and bulk admin actions perform database operations inside loops instead of using batched statements.
- **Unbounded Task Spawning:** Routing messages via NATS uses `tokio::spawn` for every delivery. High-volume bursts could lead to resource exhaustion or "task storms."
- **Memory Pressure:** Offline message synchronization loads all pending messages into a `Vec` before sending. Large backlogs for long-offline devices could spike memory usage.
- **Connection Registry Contention:** While `DashMap` is used, a single global map for all connections may become a hotspot as the cluster scales to hundreds of thousands of concurrent users.

---

## 4. Concurrency Analysis

### Risks
- **Race in Connection Management:** There is a potential race between connection cleanup and new connection initialization for the same `device_id`.
- **NATS Delivery Guarantees:** Currently using "fire and forget" publishing. Critical control messages (e.g., `DEVICE_REVOKED`) could be lost if NATS is momentarily unreachable.
- **Heartbeat Logic:** WebSocket heartbeats are handled via a manual interval per task. This adds significant timer overhead at scale.

---

## 5. Code Quality Analysis

### Technical Debt
- **Duplicated Logic:** Device revocation and approval logic is partially duplicated between `users.rs`, `admin.rs`, and `ws.rs`.
- **Error Consistency:** Inconsistent use of `AppError` vs. raw Axum `(StatusCode, Json)` tuples.
- **Test Coverage:** Existing tests are likely unit-focused and don't simulate complex distributed failure modes (e.g., NATS partitions).

---

## Proposed Transition: Phase 2 (Clean Architecture)
We will refactor the backend into the following structure:
- `domain/`: Pure business logic and types (E2EE protocol states, User/Org entities).
- `application/`: Use cases and services (MessageRouter, IdentityManager).
- `infrastructure/`: Implementations of DB, NATS, and WebSocket registries.
- `transport/`: Axum handlers and protocol definitions.
- `observability/`: Tracing, metrics, and health supervision.
