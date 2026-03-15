# Trustline: Functional Requirements Document (FRD)

**Project:** Trustline (encryptedchat.in)
**Version:** 1.0
**Date:** March 2026

This document outlines the specific functional behavior, features, and constraints of the Trustline application to ensure alignment before development begins.

---

## 1. User Roles & Permissions

The system explicitly maps two primary user roles within a Tenant (Organization):

*   **Standard Employee (User):**
    *   Can register a single identity (via waitlist).
    *   Can register multiple devices (e.g., phone, laptop) to their single identity.
    *   Can initiate and participate in 1-to-1 End-to-End Encrypted (E2EE) chats.
    *   Can revoke their own lost devices.
*   **Tenant Administrator (Admin):**
    *   Inherits all Standard Employee capabilities.
    *   Can view the global pending queue of new user registrations.
    *   Can explicitly approve or deny pending queue access.
    *   Can view the audit log of hardware registrations and revocations.
    *   Can forcefully revoke a specific user's device.
    *   *Cannot* read encrypted messages.

---

## 2. Core Functional Modules

### A. Authentication & Onboarding
1.  **REQ-AUTH-01 (Waitlist):** A user shall be able to request access to a specific tenant (e.g., `acme.encryptedchat.in`) by providing their corporate email.
2.  **REQ-AUTH-02 (Admin Gate):** The system shall put requested identities into a 'Pending' state until explicitly unblocked by a Tenant Admin.
3.  **REQ-AUTH-03 (Passwordless):** The system shall *not* accept passwords. Upon Admin approval, the user shall be prompted to register via WebAuthn/FIDO2 (Passkeys).
4.  **REQ-AUTH-04 (Cryptographic Identity):** Upon Passkey registration, the client device shall silently generate an `X25519` Identity Key and submit the public component to the server.

### B. Device Management
1.  **REQ-DEV-01 (Multi-Device Ring):** A user shall be able to link multiple physical devices to their identity. Each device acts as an independent cryptographic endpoint.
2.  **REQ-DEV-02 (Immediate Revocation):** If a device is revoked (by User or Admin), the server shall immediately sever any active WebSockets for that device ID and wipe its public keys from the database, preventing future message routing to that hardware.

### C. Real-Time Messaging (The Vault)
1.  **REQ-MSG-01 (Blind Routing):** The server shall route messages strictly based on `recipient_device_id`. The `ciphertext` payload shall be impenetrable by the server.
2.  **REQ-MSG-02 (X3DH Key Request):** To initiate a new chat, the client shall request a "One-Time Pre-Key" bundle for the target user from the server.
3.  **REQ-MSG-03 (Asynchronous Delivery):** If Bob is offline, the server shall store Alice's encrypted message.
4.  **REQ-MSG-04 (Offline Syncing):** When Bob comes online, the server shall deliver all queued messages in order.
5.  **REQ-MSG-05 (Read Receipts):** The system shall support E2EE status updates (Sent, Delivered, Read).
6.  **REQ-MSG-06 (Typing Indicators):** The system shall securely route ephemeral "User is typing..." events without storing them.

### D. Search & Organization
1.  **REQ-UI-01 (Local Search):** The user interface shall provide a search bar to find past messages. This search must operate *entirely client-side* against a secure local database (e.g., SQLite via Tauri), as the server cannot perform server-side string searching on encrypted blobs.
2.  **REQ-UI-02 (Tenant Roster):** A user shall be able to see a verified roster of approved colleagues within their specific organization.

---

## 3. Non-Functional Requirements (NFRs)

1.  **NFR-SEC-01 (Tenant Isolation):** Data must be strictly separated at the database level using PostgreSQL Row-Level Security (RLS). A software bug must not result in cross-tenant data leakage.
2.  **NFR-SEC-02 (Forward Secrecy):** The compromise of a device's long-term keys shall not compromise past messages (achieved via the Double Ratchet Algorithm).
3.  **NFR-PERF-01 (WebSocket Concurrency):** The Rust/Tokio backend must be capable of sustaining 10,000+ concurrent idle WebSockets per standard compute node.
4.  **NFR-UX-01 (High-Fidelity UI):** The client UI must maintain 60FPS fluid animations and utilize modern, dark-mode-first aesthetics without visual jank during cryptographic operations.
