# Trustline Elite Engineering Team Requirements

To build and maintain an enterprise-grade, Zero-Knowledge, end-to-end encrypted (E2EE) messaging platform like Trustline, a standard development team is insufficient. This project requires tier-one talent—engineers with deep domain expertise in applied cryptography, hyper-scalable infrastructure, and high-performance desktop clients.

Below is the breakdown of the highly specialized, world-class talent required to bring this platform to market securely.

---

### 1. Principal Cryptography Architect (Zero-Knowledge & E2EE Core)
*   **The Mandate:** Design, implement, and rigorously audit the mathematical foundation of Trustline's Zero-Knowledge architecture. This role ensures that mathematical proofs guarantee data invisibility, even in the event of a total server compromise.
*   **Responsibilities:** Architecting and implementing the bespoke X3DH key exchange protocol and the Double Ratchet algorithm. They will manage low-level `libsodium` cryptographic primitives globally across all state machines, and engineer foolproof FIDO2/Passkey biometric and physical hardware authentication layers.
*   **Required Skills:** World-class expertise in Applied Cryptography, deep knowledge of the Signal Protocol and its vulnerabilities, mastery of Public Key Infrastructure (PKI), and advanced threat modeling against nation-state actors.
*   **Experience Level:** 10+ years in cryptographic engineering. Post-graduate degree in Cryptography or Mathematics preferred. Proven track record of building E2EE systems that have passed independent security audits.

### 2. Staff Distributed Systems Engineer (Rust / High-Performance Backend)
*   **The Mandate:** Forge a hyper-scalable, memory-safe routing engine capable of ferrying millions of encrypted packets globally with near-zero latency, while absolutely blinding the backend to the payload contents.
*   **Responsibilities:** Architect the core backend using Rust and Tokio for fearless concurrency. Construct the Axum HTTP API and highly concurrent WebSocket relay servers. Design advanced PostgreSQL schemas leveraging strict Row-Level Security (RLS) policies, and deploy distributed NATS Jetstream clusters for cross-region, horizontally scaled message brokering.
*   **Required Skills:** Elite proficiency in Rust, asynchronous programming (`tokio`, `async-std`), heavily optimized WebSocket protocols, PostgreSQL mastery (indexing, RLS, tuning), and distributed systems architecture (actor models, message queues).
*   **Experience Level:** 8+ years in systems programming building high-throughput, low-latency backends. Deep understanding of memory management, network protocols, and multi-threaded execution environments.

### 3. Lead Desktop & Client Architect (Tauri / High-Fidelity React)
*   **The Mandate:** Translate a tactical, high-fidelity Cyberpunk UI into a blazing-fast native desktop application that seamlessly manages complex cryptographic states locally without exposing keys to the V8 engine heap any longer than absolutely necessary.
*   **Responsibilities:** Build and maintain the native desktop client using the Tauri framework and React. They will craft intricate, high-performance CSS animations (glassmorphism, scan-lines, dynamic ticking), orchestrate local state management securely (IndexedDB with local encryption layers), and meticulously manage Tauri's IPC (Inter-Process Communication) to guarantee safe boundaries between the Rust core and the React webview.
*   **Required Skills:** Mastery of TypeScript, React internals, and Vite. Elite CSS engineering capabilities (animations, performance profiling). Advanced knowledge of Tauri/Electron architecture, Rust IPC bindings, and browser security models.
*   **Experience Level:** 7+ years in frontend engineering, specifically with complex, state-heavy SPA applications and native desktop wrappers.

### 4. Principal DevSecOps & Availability Architect
*   **The Mandate:** Construct an impenetrable, auto-scaling fortress. This role ensures the server infrastructure is hardened against sophisticated DDoS attacks, zero-day exploits, and physical cluster breaches, guaranteeing 99.999% uptime.
*   **Responsibilities:** Deploying and orchestrating the Rust routing servers across globally distributed edges. Designing Kubernetes per-tenant architectures, managing massive PostgreSQL deployments, and implementing rigorous GitOps CI/CD pipelines. They will lock down the Linux host kernels and manage continuous compliance auditing.
*   **Required Skills:** Mastery of Kubernetes, Docker, and Infrastructure as Code (Terraform/Pulumi). Elite Linux server hardening, advanced network routing, Postgres cluster tuning, and deep familiarity with Cloud Provider (AWS/GCP) security boundaries.
*   **Experience Level:** 8+ years building, securing, and scaling cloud-native infrastructure for highly sensitive data environments.

### 5. Principal UX/Product Director (Security/Tactical Focus)
*   **The Mandate:** Bridge the impossibly thick gap between hardcore, unforgiving cryptography and a flawless user experience. The interface must feel like a premium, tactical military dashboard while guiding non-technical operators through complex security operations safely.
*   **Responsibilities:** Designing complex user flows that mask cryptographic difficulty—such as managing multi-device key syncs, backing up recovery phrases, and handling compromised identities. They will refine and evolve the HUD/Cyberpunk design system, ensuring accessibility without breaking immersion.
*   **Required Skills:** Master-level Figma prototyping, intricate state-machine mapping, deep understanding of behavioral psychology in security contexts, and an elite eye for high-fidelity interactive design.
*   **Experience Level:** 7+ years in Product Design, ideally with experience designing cybersecurity tooling, fintech, or complex enterprise dashboards.

### 6. Offensive Security Lead / Principal Penetration Tester
*   **The Mandate:** Ruthlessly tear the platform apart before the adversaries do. This role exists to assume the mindset of a highly funded external attacker.
*   **Responsibilities:** Continuously execute red-team operations against the live platform. They will hunt for side-channel metadata leaks, fuzz the Axum API and Tauri IPC layers, attempt FIDO2 bypasses, stress-test the WebSocket relays under load, and decompile the frontend code looking for logic flaws.
*   **Required Skills:** Advanced Penetration Testing, reverse engineering, fuzzing, automated continuous security testing (Cypress/Playwright with malicious payloads), and deep knowledge of the OWASP Top 10 and beyond.
*   **Experience Level:** CEH, OSCP, or equivalent elite certifications. 5+ years of dedicated offensive security or bounty hunting experience on E2EE platforms.
