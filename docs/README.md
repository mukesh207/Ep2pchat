# Trustline Documentation

Welcome to the Trustline technical documentation index. Due to the high-security nature and complex cryptography involved in this platform, the documentation is strictly segregated by domain.

## 📂 Directory Structure

### `/architecture`
Contains deep-dives into the mathematical foundations, system boundaries, and structural software designs.
*   **`ARCHITECTURE.md`**: Broad overview of the Rust backend routing and Tauri IPC boundaries.
*   **`THREAT_MODEL_CRYPTO.md`**: Analysis of potential attack vectors, `libsodium` primitive implementations (X3DH, Double Ratchet), and mitigation strategies against rogue relays.
*   **`DATABASE_API_CONTRACT.md`**: The strict schema types, Axum API paths, and PostgreSQL Row-Level Security (RLS) policies enforcing multi-tenancy.

### `/product`
Contains the overarching vision and functional requirements.
*   **`PROJECT_OVERVIEW.md`**: The high-level executive summary, tech stack, and core value propositions (Zero-Knowledge, Passwordless).
*   **`CONCEPT.md`**: The initial conceptual outlines and feature targets.
*   **`FRD.md`**: Functional Requirements Document — detailed behavior rules for authentication, messaging, and system limits.
*   **`UI_UX_JOURNEY.md`**: User flow maps and interface state transitions for the tactical Cyberpunk aesthetic.

### `/management`
Contains development tracking, operational methodologies, and hiring profiles.
*   **`methodology.md`**: The custom "High-Assurance Agile / SecDevOps" lifecycle designed specifically for building hostile-environment encryption software.
*   **`team_requirements.md`**: Elite engineering role descriptions required to build and audit the `ep2pchat` stack safely.
*   **`frontend_redesign_walkthrough.md`**: Visual and technical verification log of the frontend redesign phase.
