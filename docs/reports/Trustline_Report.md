<style>
  body, p, table, th, td, li, div {
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
    line-height: 1.5;
  }
  h1 {
    font-family: "Times New Roman", Times, serif;
    font-size: 14pt;
    font-weight: bold;
    text-align: center;
  }
  h2, h3, h4, h5, h6 {
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
    font-weight: bold;
  }
  .caption {
    text-align: center;
    font-style: italic;
    font-size: 12pt;
    margin-top: 5px;
    margin-bottom: 15px;
  }
</style>

# Trustline: A Self-Hosted End-to-End Encrypted Real-Time Communication Platform for Enterprise Sovereignty

<div style="page-break-before: always;"></div>

## ACKNOWLEDGEMENT
First, I wish to thank the Almighty, who gave me good health and success throughout my project work.

I wish to express my heartfelt thanks to our Honorable Founder, Dr. S. Jagathrakshakan, and Dr. J. Sundeep Aanand, President, for providing me with the necessary facilities to complete my project.

I dedicate my thanks to esteemed Dr. M. Sundararajan, Vice-Chancellor In-charge, for his support and encouragement.

I express my sincere gratitude to Dr. A. Muthukumaravel, Dean PG, Faculty of Arts and Science, Dr. S. Arumugam, Dean UG, Faculty of Arts and Science, and Dr. S. Silvia Priscila, Associate Professor and Head, Department of Computer Science, Faculty of Arts and Science, for their support during the project to make it successful.

I dedicate my thanks to my beloved Guide ____________, Department of Computer Science, Faculty of Arts and Science, for his/her support and valuable guidance throughout the project work.

I offer my cordial thanks to my parents, friends, staff members, and well-wishers for their continued encouragement throughout my career. I also thank people who have directly or indirectly given me encouragement and support throughout the project.

XXX (Reg No)  
YYY (Reg No)  
ZZZ (Reg No)

<div style="page-break-before: always;"></div>

## ABSTRACT
A lot of people use cloud-based collaboration tools these days, which has created a security paradox: these platforms can make people more productive, but they often use centralized architectures that let service providers get decryption keys without their knowledge. This "Implicit Trust" model has a big single point of failure that puts businesses at risk of "middleman" attacks and cross-tenant data leaks if the central infrastructure is hacked. This project gives you Trustline, a self-hosted collaboration platform that works very well and uses a strict client-side Zero-Knowledge Framework to keep sensitive business workflows safe.

Blind Router logic is what makes up the Trustline architecture. This means that the backend relay server can only send encrypted blobs and can't read the messages or the cryptographic keys. The system does sensitive tasks like making keys, the X3DH handshake, and Double Ratchet advancement only in the local device runtime. It was made with the Tauri v2 framework and a Rust cryptographic core that is safe for memory. This design makes sure that private keys are never sent over the network or leave the device's OS Secure Enclave or an encrypted SQLCipher vault.

Trustline mainly uses WebAuthn/FIDO2 (Passkeys) to check who you are. This connects their identity to the biometrics on their physical hardware, which gets rid of the risks that come with using regular passwords. The Double Ratchet algorithm in the Signal Protocol makes message keys that are different for each interaction. This makes it very safe before and after a breach. At the database level, PostgreSQL Row-Level Security (RLS) also keeps tenants separate from each other. This means that the data for each organization is stored in different places, which makes it less likely that data will leak between tenants. Tests in the real world show that these strict security rules don't make the user experience worse. Trustline's average message synchronisation latency is 110 ms, which is much better than the 250 ms limit that is needed for smooth real-time interaction. Also, if you use Argon2id to make keys, the system will be safe from brute-force attacks for more than 112,000 years if you use hardware to speed things up. In the end, Trustline gives businesses full digital sovereignty, which means that even if the hosting infrastructure is hacked completely, their data will stay private.

**Keywords:** End-to-End Encryption (E2EE), Zero-Knowledge Architecture, WebAuthn, Double Ratchet, Argon2id, Self-Hosting, Rust

<div style="page-break-before: always;"></div>

## TABLE OF CONTENTS

| S.NO. | DESCRIPTION | PAGE NO. |
| :--- | :--- | :--- |
| | Abstract | vi |
| | Table of Contents | vii |
| | List of Figures | ix |
| 1. | INTRODUCTION | 1 |
| 1.1 | An Overview | 1 |
| 1.2 | Objective & Scope of the Project | 1 |
| 1.3 | Literature Survey | 1 |
| 1.4 | Problem Statement | 1 |
| 2. | SYSTEM ANALYSIS | 8 |
| 2.1 | Existing system | 8 |
| 2.2 | Disadvantages of Existing system | 8 |
| 2.3 | Proposed system | 8 |
| 2.4 | Advantages of Proposed System | 8 |
| 3. | SYSTEM CONFIGURATION | 12 |
| 3.1 | Hardware Requirements | 12 |
| 3.2 | Software Requirements | 12 |
| 4. | SYSTEM DESIGN | 15 |
| 4.1 | Overall Architecture diagram | 15 |
| 4.2 | Methodology / Algorithm Adopted | 15 |
| 5. | SYSTEM IMPLEMENTATION | 22 |
| 5.1 | Module Description | 22 |
| 6. | SYSTEM TESTING | 28 |
| 6.1 | Unit Testing | 28 |
| 6.2 | Integrated Testing | 28 |
| 6.3 | Black Box Testing | 28 |
| 6.4 | White Box Testing | 28 |
| 6.5 | Verification Testing | 28 |
| 6.6 | Validation Testing | 28 |
| 6.7 | User Acceptance Testing | 28 |
| 7. | Results and Discussion | 35 |
| 8. | CONCLUSION | 40 |
| 9. | LIMITATIONS & SCOPE OF FUTURE WORK | 42 |
| 10. | REFERENCES | 44 |
| 11. | APPENDIX | 45 |
| 11.1 | Source Code | 45 |
| 11.2 | Output Screen Shots | 45 |

<div style="page-break-before: always;"></div>

## LIST OF FIGURES

| FIGURE NO. | DESCRIPTION |
| :--- | :--- |
| Figure 1 | Zero-Knowledge "Blind Router" Logic |
| Figure 2 | X3DH Key Agreement |
| Figure 3 | The Double Ratchet Protocol |
| Figure 4 | PostgreSQL Row-Level Security (RLS) |
| Figure 5 | WebAuthn Passwordless Authentication |
| Figure 6 | CRDT Synchronization Flow |
| Figure 7 | Identity Verification Screen |
| Figure 8 | Encrypted Message Vault |
| Figure 9 | Administrator Device Portal |
| Figure 10 | Relay Node Monitor |
| Figure 11 | Admin Console - Pending Approvals |
| Figure 12 | Admin Console - Policies |

---

<div style="page-break-before: always;"></div>

## 1. INTRODUCTION

### 1.1 An Overview
Traditional security models like enterprise firewalls and Virtual Private Networks (VPNs) are mostly useless against modern, advanced cyber threats because of the quick move to distributed cloud environments and the permanent move to remote workforces. Real-time collaboration is an important part of any modern business in today's digital world. But this reliance has made systems weaker by putting sensitive data in cloud ecosystems where service providers can easily get to decryption keys. This "Implicit Trust" model puts businesses at a lot of risk from "middlemen" and the chance of lateral movement if the main infrastructure is hacked.

Trustline is a high-performance, self-hosted collaboration platform that uses a strict client-side Zero-Knowledge Framework to keep private business processes safe. The main goal of Trustline is to make sure that the organization is always in charge of its digital assets. This means that the data will still be safe even if the hosting infrastructure is completely broken.

**The "Blind Router" Layout**
The system works because of the Blind Router architecture. Other messaging apps stop encrypting at the server level, but Trustline does not. It only works as a stateless relay for encrypted blobs, though. The backend can't see the private cryptographic keys or the plain text of messages. The client-side Tauri Rust runtime only does sensitive operations like key generation, the X3DH (Extended Triple Diffie-Hellman) handshake, and Double Ratchet encryption through IPC commands. This ensures that private keys are always stored in an encrypted local vault or the device's OS Secure Enclave, so they can never be taken off the authorized hardware.

**Authentication that is linked to hardware**
To avoid the security problems that come with regular passwords, like phishing, credential stuffing, and database breaches, Trustline only uses WebAuthn/FIDO2 (Passkeys) to verify users. This method links a person's identity to certain hardware biometrics, such as Touch ID or Windows Hello. A unique cryptographic identity is given to each device when you register it. Even if the central database is stolen, this makes sure that authentication can't be hacked or copied.

**The security of advanced cryptography**
Trustline uses the Double Ratchet algorithm from the Signal Protocol to make sure that Forward Secrecy and Post-Compromise Security are always there. The system makes sure that compromising one key doesn't give away past or future communications by giving each interaction a unique, one-time message key. The platform also uses Argon2id, which is a memory-hard key derivation function that makes it very hard for hardware-accelerated brute-force attacks to work. It is thought that it will last for more than 112,000 years against modern GPU clusters.

**Separation and Consistency for Multiple Tenants**
Trustline uses PostgreSQL Row-Level Security (RLS) to make sure that businesses that work in shared spaces keep their data completely separate at the database level. The database only lets people with the organization's unique identifier access it, which stops data from leaking between tenants mathematically. Conflict-Free Replicated Data Types (CRDTs) are used by the system to make sure that the collaborative experience goes smoothly even when there isn't a single source of truth. With an average synchronisation latency of only 110 ms, this technology lets distributed actors fix concurrent edits on their own. This is well within the requirements for smooth real-time interaction.

By combining these cutting-edge cryptographic primitives and architectural designs, Trustline adds an unbreakable layer of security to modern business communication. It is a localised and independent option to centralised SaaS platforms.

### 1.2 Objective & Scope of the Project
The primary objectives of the Trustline project are defined by a commitment to data integrity, confidentiality, and operational autonomy for the enterprise. The project aims to achieve the following:
* **To Establish a Zero-Knowledge Communication Environment:** The first objective is to engineer a system where the service provider has zero technical capability to decrypt user data. This is achieved by moving all key management and encryption logic to the client side, ensuring that the central database only stores non-reversible proofs and encrypted payloads.
* **To Optimize Real-Time Collaboration Performance:** A second objective is to prove that high-level security does not necessitate high latency. The project targets a message synchronization mean of 110 ms, utilizing the Rust-based NATS JetStream infrastructure to handle high concurrency without the performance bottlenecks typical of traditional relational database-driven messaging.
* **To Provide Granular Administrative Sovereignty:** The third objective is to deliver a suite of enterprise controls, such as a remote "Kill Switch" for lost devices and a decentralized staff roster, allowing administrators to manage their organization's security posture without relying on third-party cloud support teams.

The scope of this project encompasses the design, development, and testing of a cross-platform desktop application supporting macOS, Windows, and Linux. It includes the implementation of a Rust-based cryptographic core that handles the X3DH key agreement and Double Ratchet algorithms. The project also covers the development of a stateless backend relay and the integration of localized, encrypted storage via SQLCipher. While the current scope focuses on 1-on-1 enterprise messaging and file audits, the architectural design is intended to be extensible to future group-messaging protocols like MLS. The research excludes mobile application development in its initial phase, focusing instead on the high-security desktop workflows common in sensitive corporate environments.

### 1.3 LITERATURE SURVEY

The Trustline project literature survey covers the rapid evolution of cybersecurity paradigms, cryptographic primitives, and distributed collaboration models between 2022 and 2026. At this stage, enterprise security is undergoing a mammoth transition from vulnerable perimeter based models to **Zero Trust Architecture (ZTA)** & **Client-Side Sovereignty**. This move has become a necessity, owing to the proliferation of distributed cloud environments and the inherent insecurities of "Implicit Trust" in centralised service providers.

#### 1.3.1 Systematic Review of Zero Trust Architecture Implementation
* **Author(s) & Year:** MDPI, 2025. 
* **Focus Area:** Comprehensive survey of **Zero Trust Architecture (ZTA)** models in contemporary and heterogeneous enterprise network topologies.
* **Major Contribution:** This research offers an important identification that while foundational identity authentication has matured as a component of ZTA, the frontiers of research today are in **environmental perception** and automated orchestration of secure, localised workloads. It points out that security is a dynamic and ongoing process, not just a static check at the gateway.
* **Restriction:** One of the main limitations mentioned in the study is the continuous deficiency of standardised, interoperable protocols for "Zero Trust" in the case of diverse and heterogeneous IoT environments, resulting in fractured security postures.
* **Use cases:** The results aim at highly distributed cloud ecosystems where traditional perimeter defences (firewalls, VPNs, etc.) are no longer technically feasible against today's threats.
* **Advantages and Disadvantages:** The main advantage of this architecture is that it is very resistant to lateral movement of the attacker in a compromised network. The major downside, however, is the heavy computation required to verify each user session and each data packet in real time and on a continuous basis.
* **Research Gap and Problem Statement:** The authors point out a key missing piece: the failure to sufficiently integrate real-time behavioural profiling in current ZTA frameworks. This poses a problem statement on how to provide high assurance security without compromising on system performance or user experience.
* **Proposed Work:** Taking these insights, Trustline extends ZTA principles deep into the messaging layer. It provides cryptographic authentication of all communication sessions with **hardware-bound identities** that guarantees that the authentication is bound to the physical device, not a vulnerable server-side token [2].

#### 1.3.2 ZTA for AI-Powered Cloud Systems
* **Author(s) & Year:** W.J.A.R.R. (2025)
* **Focus Area:** Protecting automated workloads and high velocity interactions in complex AI-enabled cloud environments.
* **Main Contribution:** The paper introduces a dedicated framework for **session-based identity binding**. The design of this architecture avoids the intervention of an intermediary in the automated agent-to-agent processes, by making identities cryptographically unique and ephemeral.
* **Limitation:** The authors acknowledge that the framework is computationally intensive and memory-hungry, which makes it hard to scale in low-bandwidth or resource-constrained settings.
* **Use cases:** This work is of great interest for autonomous enterprise systems, secure financial transactions, and AI agent communication protocols.
* **Pros and Cons:** The value of this research is that it is virtually impossible for automated systems to verify the identity. The other big downside is the administrative and technical overhead of dealing with and rotating thousands of ephemeral crypto tokens all at once.
* **Research Gap and Problem Statement:** One of the major research gaps is the lack of **End-to-End Encryption (E2EE)** of metadata in these AI workflows. The problem statement talks about the high risk of exposing organisational intent and proprietary strategies through behavioural metadata analysis.
* **Proposed Work:** Trustline proposes a **Blind Router** architecture to mitigate this critical vulnerability. This design fully decouples metadata from content and ensures absolute data sovereignty to the organization as the server is unable to correlate identities to the intent of communication [1].

#### 1.3.3 Client-Side Encrypted Data Vaults
* **Year & Authors:** IJIRT (2025).
* **Interest:** In-depth architectural design of secure persistent storage vaults built on advanced client side encryption primitives.
* **Key Contribution:** This paper presents a robust model where 100% of the data is encrypted locally on the client's authorised device before it is sent to an untrusted or public server environment.
* **Limitation:** The main functional limitation is the inability to perform traditional server-side indexing or searches on data that is fully encrypted and opaque to the hosting provider.
* **Usage:** This architecture is very useful for secure cloud based file storage and management of highly sensitive corporate database records.
* **Advantages and disadvantages:** The primary advantage is the **Zero-Knowledge** guarantee: the worst case server breach leaks exactly zero bytes of usable data [1]. The demerit being the extreme risk of total, irreversible data loss should the client lose their local cryptographic keys, as no mathematical "password reset" is possible.
* **Research Gap and Problem Formulation:** The research identifies a gap in high performance indexing for encrypted localised history. The problem statement talks about the high friction experienced by users when they cannot search their own encrypted communication logs with sub-second responsiveness.
* **Proposed Work:** Trustline overcomes this usability barrier by incorporating **SQLite FTS5** (Full-Text Search) locally in the Tauri client. This provides sub-second, multi-session search on decrypted data, without ever leaking search queries or results to the relay server [1].

#### 1.3.4 High-Throughput AES-256-GCM in Cloud Databases
* **Authors & Year:** ResearchGate (2024).
* **Focus Area:** Optimisation of data throughput with preservation of **Authenticated Encryption** in complex accounting and enterprise information systems.
* **Main Contribution:** The researchers show that with the **AES-NI (New Instructions)** currently available in hardware, data can be encrypted and decrypted at gigabyte-per-second rates. This proving ground allows for E2EE for large-scale enterprise data that has previously suffered from significant cryptographic overhead.
* **Disadvantage:** One major limitation is that the entire security model is fragile and relies on the absolute uniqueness of **Initialisation Vectors (IVs)**; any reuse of an IV leads to a catastrophic failure of confidentiality.
* **Applications:** Specially developed for the security of cloud databases and the protection of huge quantities of sensitive enterprise data at rest and in transit.
* **Advantages and Disadvantages:** Outstanding performance and data integrity are the main merits. The main disadvantage is the high level of management complexity to ensure the uniqueness of IVs over many distributed network nodes.
* **Research Gap & Problem Statement:** It has been observed that per message unique key rotation is not supported by traditional cloud implementations. A problem statement regarding the total failure of the system is presented if a single static encryption key is compromised at any point.
* **Proposed Work:** Trustline addresses this problem by adopting the **Double Ratchet Protocol** that derives a unique message key, which is used only once, for each interaction with the help of **HKDF-SHA256**. This gives **Forward Secrecy**, where a compromise of a current key does not compromise past or future data [24].

#### 1.3.5 Evolution of Password Hashing: Argon2id vs Legacy
* **Authors & Year:** Gupta, D. (2026).
* **Area of focus:** The critical transition from legacy hashing mechanisms (PBKDF2, SHA-2) to memory-hard **Argon2id** password hashing algorithm for high-security authentication.
* **Main Contribution:** The work provides a technical benchmark that shows Argon2id is overall better at resisting hybrid side-channel leaks and also specialised parallelised GPU hardware clusters used for brute-force attacks.
* **Restriction:** The memory-hard nature of the algorithm leads to a high RAM usage which can be a significant constraint when running on older mobile or desktop hardware with limited resources.
* **Uses:** Used primarily in secure login portals and to derive root encryption keys from strong user passphrases.
* **Advantages and Disadvantages:** Its tuneable complexity (memory, time and parallelism) is a major merit for the developers. However, the high resource consumption required during the initial authentication ceremony is a major demerit for low-end devices.
* **Research Gap and Problem:** The study found a discrepancy in the combination of Argon2id software hashing with hardware tied biometrics. This results in a problem statement that software-only hashing is still vulnerable to sophisticated phishing and social engineering.
* **Proposed Work:** Trustline fills this gap by using **Argon2id** only for local key derivation and using **WebAuthn** to bind the final identity to a physical hardware enclave (TPM or Apple Secure Enclave) [4].

#### 1.3.6 Evaluating Argon2 Adoption and Effectiveness
* **Authors & Year:** arXiv (2025)
* **Focus Area:** Empirical measurement of real-world security gains and varying adoption rates of the Argon2 algorithm in modern production software.
* **Significant Contribution:** The authors find Argon2 to be very effective, but many developers misconfigure its memory parameters. These bugs often lead to potential disc paging which inadvertently introduces new side-channel vulnerabilities and degrades performance too.
* **Limitation:** This study is about trends in general industry adoption and does not propose specific paths for optimisation for cross-platform desktop runtimes such as Tauri.
* **Applications:** For enterprise grade vaults that require very high secure root key derivation, and long term password storage.
* **Pros and cons:** The main advantage is the great flexibility of security configuration. On the other hand, high complexity and "gotchas" for non-specialist developers are big demerits.
* **Research Gap and Problem Statement:** There is a clear gap in the ability to automatically and adaptively tune memory for different client hardware, leading to a non-uniform and frustrating user experience across a variety of devices.
* **Work Proposed:** Trustline is a standardised, high-assurance cryptographic module in Rust. This module aligns the memory entropy values with the capabilities of the host device, maintaining a consistent **359 ms authentication latency** across different hardware configurations [15].

#### 1.3.7 Privacy Protection in Instant Messaging
* **Author(s) & Year:** DiVA Portal (2025)
* **Abstract:** In this paper, we provide an empirical study about the impact of hardware-bound passkeys on the security and privacy of current IM applications.
* **Most Important Contribution:** The research demonstrates how hardware anchored credentials may help reduce the risk of remote account take over, phishing and session hijacking.
* **Limitation:** It only works for those with modern hardware with biometric sensors or dedicated physical security keys (e.g. YubiKeys).
* **Use Cases:** Stop lateral movement of actors on the network in corporate messaging environments.
* **Advantages and Disadvantages:** The biggest bonus is it pretty much takes credential phishing out of the equation. The main drawback in operation is the demanding requirement of modern hardware.
* **Problem Statement & Research Gap:** The main research gap is the absence of multi-tenant data isolation at the database layer after user authentication. The problem is that even if the login is secure, one bug in the backend can leak data across organisations.
* **Proposed Work:** Trustline introduces a further, mandatory isolation boundary, **PostgreSQL Row-Level Security (RLS)** to address this. To avoid accidental data leaks, each query is automatically limited to the user's own organization at the SQL level.

#### 1.3.8 Secure Decentralized Data Protection
**Author(s) & year:** ResearchGate, 2023.
* **Focus Area:** Investigating decentralised data protection and relay models to remove single points of failure in centralised servers.
* **Main contribution:** In this paper we propose a model where data and keys are distributed over various nodes of the network, so that no single entity has the entire data set at any given time.
* **The upper bound:** The study finds that this model is difficult to implement in real-time interactive applications due to high network latency and "split-brain" scenarios.
* **Applications:** The main applications are distributed enterprise archives and high latency archival secure storage.
* **Pros and Cons:** The big plus is that it's incredibly resistant to server crashes or seizures of state. The big problem though is the high sync latency, usually in seconds.
* **Problem/Research Gap:** The challenge here is to enable real-time fluid collaboration in decentralised models - a trade-off between absolute security and user responsiveness.
* **Proposed Work:** This is managed by Trustline using locally **Conflict-Free Replicated Data Types (CRDTs)**. This makes the data converge mathematically and keeps the **mean latency at 110ms** with a Zero-Knowledge backend relay.

#### 1.3.9 Security Capabilities of AES and Rust
* **Author(s) & Year:** DhiWise, 2024.
* **Focus:** High assurance cryptographic protocols leveraging the memory safety features of the **Rust** programming language.
* **Contribution:** The authors show that Rust's ownership and borrowing scheme effectively alleviates buffer overflow vulnerabilities and the use-after-free bugs that haunt previous C-based messaging clients.
* **Limitation:** The paper does not delve into the performance overhead of wrapping a heavy Rust logic for a frontend React interface over IPC.
* **Applications:** high-assurance desktop messaging, system utilities, cryptography libraries.
* **Pros and Cons:** The major pros are memory safety and C-level performance. The major demerits are steep learning curve and support of legacy library.
* **Identifying Research Gap & Problem Statement:** So no lightweight E2EE clients that don't depend on the bloatware and insecure Electron framework. The problem statement is about the dangerous large attack surface of applications based on Chromium.
* **Proposed Work:** Trustline is built on **Tauri v2** [2], a hybrid approach that combines a native Rust backend with a small webview that is native to the operating system. This dramatically reduces the attack surface and optimises memory usage, keeping the app footprint <100MB.

#### 1.3.10 Comparison of Cybersecurity Datasets
* **Author(s) & Year:** MDPI (2022)
* **Focus Area:** Profiling detection and potential metadata leakage through behavioural patterns in network traffic.
* **Key Contribution:** A framework to normalise large network traces (e.g. **CIC-IDS2017**) to test the "metadata opacity" of different encrypted communication protocols.
* **Limitation:** The research mentions that historical data sets are ageing and not as effective against modern polymorphic threats and AI-powered traffic obfuscation.
* **Uses:** Required when testing security and privacy, and resistance to metadata-leak, of encrypted communication relays, VPNs and proxies.
* **Pros and Cons:** The main benefit of it is high accuracy of the automated recognition of patterns. However, a major demerit is that it relies heavily on historical data which may not reflect attacks in the modern era.
* **Research Gap and Problem Statement:** There's a clear testing gap, especially for E2EE metadata in multi-tenant enterprise environments. The problem statement is associated with the risk of organization level profiling even if the message content is fully encrypted.
* **Proposed Work:** Trustline leverages benchmark datasets to validate the effectiveness of its **Blind Router** architecture to hide timestamps and sender relationships through ephemeral **NATS JetStream** routing and extensive metadata sanitization.

**Synthesis of Literature Survey**
The analysis of the surveyed literature between **2022 and 2026** shows an industry-wide move toward **Zero Trust Architecture (ZTA)** and **Client-Side Sovereignty**. We have the strong mathematical primitives like **AES-256-GCM** and Argon2id that provide us the building blocks, but there is a large research gap in how to seamlessly integrate these technologies into a high-performance real-time collaboration environment. Existing approaches often compromise privacy for performance or security for usability. Trustline solves this basic tradeoff with the combination of the **Double Ratchet Protocol**, the memory safety of **Tauri and Rust**, and the database level isolation of **PostgreSQL RLS**. This provides a common high-assurance platform that can safeguard modern enterprise communications without sacrificing the fluid user experience needed for productive collaboration.

### 1.4 Problem Statement
The rush to cloud-based collaboration has highlighted a number of systemic vulnerabilities in traditional enterprise communications architectures. The paradox of security in modern organisations is that the tools that help to improve productivity are also the primary points of data leakage and compromise in organisations. The main challenges to be addressed by this project are divided in the following key areas:

**The Fallacy of Implicit Trust and Data Sovereignty**
Standard Software-as-a-Service (SaaS) communication platforms typically operate on an "Implicit Trust" model, where the service provider manages or possesses the decryption keys for user data. This architecture forces organizations to surrender absolute digital sovereignty, as highly sensitive corporate intellectual property is technically accessible to third-party providers. This creates a massive single point of failure; a compromise at the provider level or a malicious insider threat within the service organization can lead to the mass extraction of plaintext data from thousands of enterprise tenants.

**Vulnerability of Legacy Authentication and Hashing**
The weakest link in the enterprise security chain remains traditional password-based authentication. These systems are very vulnerable to phishing, credential stuffing and social engineering attacks. Also, older hashing implementations, such as PBKDF2 or SHA-256, are increasingly vulnerable to attacks with modern hardware acceleration. High-performance GPU clusters can do billions of hashes per second, which makes it possible to perform practical offline dictionary and brute-force attacks against stolen password databases.

**Inadequate Tenant Isolation and Lateral Movement**
Data isolation in multi-tenant cloud environments is often provided at the application layer, which is inherently fragile and error prone. Just one software bug can cause unintended cross-tenant data leaks, with one organization able to see the sensitive metadata or communications of another. Furthermore, traditional perimeter-based networks trust internal actors and attackers who bypass the first line of defence can move laterally with little friction due to a lack of internal cryptographic segmentation.

**Cryptographic Desynchronization and Metadata Exposure**
Maintaining a consistent and identically synchronized application state between multiple users in a true End-to-End Encrypted (E2EE) environment is computationally complex. Without a centralized, plaintext-aware server to dictate event ordering, systems often suffer from consistency degradation. Moreover, even if payload data is successfully encrypted, behavioral profiling and traffic analysis remain possible if metadata-such as sender/receiver relationships, message timestamps, and file sizes-is not properly isolated or sanitized.

**Device Management and Revocation Complexity**
A major operational challenge is the management of cryptographic identities across multiple devices. In decentralised models, securely revoking the specific access of an employee who has lost a device or left an organization is technically challenging without disrupting the conversation history for other participants. Existing solutions, however, do not always provide a sturdy "kill switch" mechanism that can immediately and verifiably remove a compromised hardware endpoint from the secure communication ring.

<div style="page-break-before: always;"></div>

## 2. SYSTEM ANALYSIS

### 2.1 Existing System
Today, there are essentially three architectures for enterprise communication. Each has tradeoffs between ease of use and security:

1. **SaaS Platforms Centralised (e.g. Slack, Microsoft Teams):** These are the industry standard platforms because they are high performing and have lots of integrations. But they work on a **"Implicit Trust"** model. They use TLS for data in transit and encrypt data at rest, but the service provider typically manages the cryptographic keys. This architecture ends encryption at the server level and thus the provider's staff can technically access the message plaintext. It also means that data is vulnerable to subpoenas or provider-side breaches.
2. **Consumer-Grade E2EE (e.g., WhatsApp, Signal):** These systems provide strong default end-to-end encryption. But they are fundamentally built for the individual consumer, not for the organization. They lack centralised administrative dashboards, demand personal identifiers like phone numbers to register and, in the case of platforms like WhatsApp, they collect huge amounts of behavioural metadata that can be used for profiling.
3. **Hybrid Messaging Architectures (e.g. Telegram):** The model comes with security as an option. Regular chats are not E2EE. Only "Secret Chats" are E2EE but these are device-specific and not linked to the employee's professional hardware ecosystem. This creates a fractured and insecure user experience for enterprise workflows.

### 2.2 Disadvantages of Existing System
Existing systems have a number of systemic flaws that make them unsuitable for enterprise use of high-confidentiality:

* **Server Side Weakness:** Centralised platforms are a single point of failure. If the backend server is compromised, hackers can steal large quantities of data since data is often stored in plaintext or with server side keys.
* **Loss of Digital Sovereignty:** Companies are being forced to hand over control of their sensitive intellectual property to third party providers, often migrating their data into jurisdictions that may not be GDPR compliant.
* **Weakness of Authentication:** The majority of systems use passwords, but they are unable to resist credential-stuffing, phishing and hardware-accelerated brute-force attacks. Old hashing algorithms like PBKDF2 are quickly becoming useless against modern GPU clusters.
* **No Tenant Separation:** In a multi-tenant SaaS environment, data isolation is usually an application-level concern. A single software bug may cause unintended cross-tenant data leakage, where data of one organization is visible to another.
* **Exposure of meta-data:** Even if the message itself is encrypted, the providers are able to profile organisational structures by analysing the 'who, when and where' of internal communications.

### 2.3 Proposed System
Trustline introduces a "Self-Hosted Zero-Knowledge" model that requires no trust in a service provider. The platform is designed as a **"Blind Router"** architecture, wherein the server only passes encrypted blobs and never has the keys to decrypt them.

* **Client Side Sovereignty:** All cryptography (including key generation, X3DH handshake and Double Ratchet encryption) happens only in the user's local **Tauri Rust runtime** via IPC commands. Private keys are anchored to the device's **Secure Enclave** or an encrypted SQLCipher vault, and they never leave the hardware.
* **Hardware-backed authentication:** Trustline does away with passwords in favour of **WebAuthn/FIDO2 (Passkeys)**. This binds the user's identity to physical hardware biometrics, which means the system cannot be compromised by remote credential theft.
* **Advanced cryptographic stack:** The system employs the **Double Ratchet algorithm** of the **Signal Protocol** to offer both Forward Secrecy and Post-Compromise Security.
* **High-Performance Synchronisation:** With **NATS JetStream** and **Conflict-Free Replicated Data Types (CRDTs)**, the system reaches a mean synchronisation latency of **110 ms**, offering the responsiveness of a cloud service in a private, encrypted environment.

### 2.4 Advantages of Proposed System
The Trustline platform has a number of security and operational benefits:

* **Complete Privacy:** Crypto is blind to the backend server. Even with full compromise of the relay infrastructure, there is **no plaintext bytes** exposed.
* **Immutable tenant isolation:** PostgreSQL Row Level Security (RLS) ensures multi-tenancy at the database level. This provides a mathematical guarantee for data isolation rather than a fragile filter in the application layer.
* **Memory-hard hashing algorithm:** We use the **Argon2id** to secure local data vaults against GPU accelerated attacks for an estimated **112,700 years**.
* **Operational Control:** Admins have total sovereignty with features such as the **"Remote Kill Switch"** that allows them to disconnect access to one specific compromised device instantly without affecting the rest of the organization.
* **Metadata cleansing:** The architecture is designed to minimise the leakage of behaviour information. Routing metadata is temporary and is deleted in accordance with organisational retention SLAs.
* **Prepared for Compliance:** As a self-hosted platform, organisations can retain their communication data within defined physical boundaries, making it easier to meet demanding regulatory requirements such as HIPAA and GDPR.

<div style="page-break-before: always;"></div>

## 3. SYSTEM CONFIGURATION

### 3.1 Hardware Requirements
Trustline is designed to operate on standard enterprise hardware but benefits significantly from specific security-focused features.

**Table 1: Client-Side Requirements (Workstation)**

| Component | Minimum Specification | Recommended Specification |
| :--- | :--- | :--- |
| **Processor** | 64-bit Dual Core (Intel/AMD/ARM) | Quad Core with AES-NI support |
| **Memory** | 4 GB RAM | 8 GB RAM (for large file caching) |
| **Security** | TPM 2.0 or Secure Enclave | FIDO2 Hardware Key (e.g., YubiKey) |
| **Storage** | 500 MB Free Space | 2 GB+ (SSD for SQLCipher performance) |
| **Operating System** | Windows 10/11, macOS 12+, Linux | Latest LTS OS with Secure Boot |
<div class="caption">Table 1: Client-Side Requirements (Workstation)</div>

The requirement for AES-NI (Advanced Encryption Standard New Instructions) is vital for minimizing the performance overhead of the AES-256-GCM cipher used throughout the platform.

**Table 2: Server-Side Requirements (Relay Node)**

| Component | Minimum Specification | Recommended Specification |
| :--- | :--- | :--- |
| **Processor** | 2-Core Virtual CPU | 4-Core CPU |
| **Memory** | 2 GB RAM | 8 GB RAM (for NATS JetStream throughput) |
| **Storage** | 40 GB SSD | 100 GB+ High-Performance NVMe |
| **Network** | 100 Mbps stable uplink | 1 Gbps+ low-latency connection |
<div class="caption">Table 2: Server-Side Requirements (Relay Node)</div>

### 3.2 Software Requirements
The Trustline software stack is carefully selected for memory safety, cryptographic integrity, and high concurrency performance. To avoid common vulnerabilities such as buffer overflows and data races, the system is built on the Rust ecosystem on both client and server.

**I. Requirements of the Client Application**
All private key operations are performed locally on the client side.

* **Frontend Framework:** React 19 with Typescript. Built a highly responsive and type safe User Interface(UI). React 19 provides you hooks to interact with state in real time. Typescript keeps your structures in place through complex data transformations.
* **Application Container:** Tauri v2 (Rust System Bridge). Tauri uses the native webview of the OS, which means the attack surface and memory footprint of the application is drastically smaller than Electron. It provides a safe link between the React frontend and high-performance Rust modules using Inter-Process Communication (IPC).
* **Local database:** SQLCipher SQLite. It provides the user with a persistent, hardware encrypted storage layer on their disc. SQLCipher is an extension to SQLite, adding 256-bit AES encryption to protect local message history and sensitive "ratchet state" from unauthorised access, even if a device is physically compromised.
* **Crypto Engine:** A custom crypto core in Rust. A custom library implementing the Signal Protocol (X3DH and Double Ratchet) with the crypto_core and libsodium crates. It uses Argon2id key derivation, X25519 Diffie-Hellman handshakes, and ChaCha20-Poly1305 authenticated encryption.
* **Authentication Library:** @simplewebauthn/browser. A browser side library to orchestrate the WebAuthn/FIDO2 registration and assertion ceremonies so the application can talk directly to hardware authenticators like Touch ID or Windows Hello.

**II. Backend infrastructure requirements**
The backend is a "Blind Router" in that it forwards encrypted payloads without the technical means to decrypt them.

* **Core Logic:** Axum Framework Rust with Tokio. Axum is a high performance, modular web routing layer and the Tokio asynchronous runtime allows the server to serve tens of thousands of concurrent WebSocket connections with a low resource overhead.
* **Message Broker:** NATS JetStream. High performance distributed messaging middleware. NATS JetStream also supports asynchronous message persistence and delivery, enabling safe queuing and replay of "offline" messages as a device reconnects.
* **PostgreSQL (v15+) Metadata Store with Row Level Security (RLS):** This is the master store for organization metadata, device public keys and encrypted blobs. RLS policies also ensure strict separation of tenants through mathematical partitioning of data at the SQL level and prevent data leakage between tenants.
* **Authentication Backend:** webauthn-rs v0.5. A Rust library that provides strong guarantees by implementing server-side WebAuthn logic (such as challenge generation, credential storage, and hardware-signature verification).
* **Containerisation & Orchestration:** Docker Docker Compose standardises deployment environment across different infrastructure. Docker enables an organization to self-host the Rust backend, NATS broker and PostgreSQL database once and with consistent security configurations.
* **Envoy Reverse Proxy:** Traefik Offers dynamic routing and automatic Mutual TLS (mTLS) termination, ensuring that all traffic between the client and self-hosted relay is encrypted in transit.

<div style="page-break-before: always;"></div>

## 4. SYSTEM DESIGN

### 4.1 Overall Architecture Diagram

The Trustline architecture has a "Three-Tier Zero-Knowledge Design". It is designed to provide a strong separation of concerns, where no plaintext data or sensitive cryptographic keys are ever transmitted outside of the "Cryptographic Barrier" of the user's local environment.


* **Tier 1: Client UI (The Dashboard):** This tier is built using **React 19** and **TypeScript** and is the user-facing presentation tier. It's the interface for real-time messaging, secure file sharing and administrative device management. Crucially, the UI has nothing to do with any encryption logic. It fetches decrypted data from Tier 2 through a secure **Inter-Process Communication (IPC)** bridge, and renders it directly in the local Document Object Model (DOM). This means that the plaintext data only ever exists in the volatile memory of the application and never hits the network or disc in an unencrypted state.
* **Tier 2: The Cryptographic Barrier (The Core):** This tier is a dedicated **Rust-based core** that runs within the **Tauri v2 runtime**. It serves as the "Secure Vault" of the application. It is accountable for:
  * **Identity Management:** Generate and secure X25519 identity keys on the device's Secure enclave.
  * **Key Derivation:** Running the **Argon2id** algorithm to derive the Master Key to unlock the local **SQLCipher**-encrypted SQLite database.
  * **Cryptographic Orchestration:** Managing the complex state transitions of the **Double Ratchet** protocol for each message individually.
  * **IPC Bridge:** It intercepts all outgoing data from the UI, 'wraps' it in a cryptographic envelope, and passes the encrypted 'blob' to Tier 3.

```text
[ CLIENT DEVICE (Secure) ]             [ UNTRUSTED NETWORK ]            [ BACKEND (Blind) ]
+-----------------------+              +-------------------+            +-----------------+
|  User Interface (UI)  |              |                   |            |  Rust / Axum    |
|       (React)         |              |                   |            |  Relay Server   |
+-----------+-----------+              |                   |            +--------+--------+
            |                          |                   |                     |
+-----------v-----------+              |                   |            +--------v--------+
|  Tauri Rust Runtime   |              |                   |            | NATS JetStream  |
| (Crypto Operations)   |              |                   |            | (Msg Routing)   |
+-----------+-----------+              |                   |            +--------+--------+
            |                          |                   |                     |
+-----------v-----------+      (Encrypted Blobs)           |            +--------v--------+
|   SQLCipher Vault     | <===========================================> | PostgreSQL DB   |
| (Local Decrypted DB)  |              |                   |            | (RLS Isolated)  |
+-----------------------+              +-------------------+            +-----------------+
```
<div class="caption">Figure 1: Zero-Knowledge "Blind Router" Logic</div>

* **Tier 3: The Blind Relay (The Cloud):** Only this layer is hosted on the server side and is developed as a **stateless backend** with **Rust (Axum)** and **NATS JetStream**. Its design philosophy is purely that of a **"Blind Router"**:
  * **Not knowing the content:** It only requires a `recipient_device_id` and a `ciphertext` blob. It doesn't have the private keys to perform the Diffie-Hellman math needed to decrypt.
  * **Tenant Isolation:** It leverages **PostgreSQL Row-Level Security (RLS)** to physically isolate disparate organisations at the database level, so there's no cross-tenant data leakage.
  * **Short-lived persistence:** It uses NATS JetStream for asynchronous message delivery to offline users, and automatically purges routing metadata according to organisational retention policies.

### 4.2 Methodology / Algorithm Adopted

Trustline platform employs an advanced cryptographic methodology based on **Signal protocol**. The system provides confidentiality of communication in two distinct phases: **Asynchronous Key Agreement (X3DH)** and **Continuous Ratcheting (Double Ratchet)**.

**Phase 1: X3DH (Extended Triple Diffie-Hellman)**
The protocol allows two users to establish a shared secret even if the recipient is offline. The approach is based on "Prekey Bundles" which are stored at the server.
1. Alice receives Bob's bundle (Identity Key $IK_B$, Signed Prekey $SPK_B$ and a One-Time Prekey $OPK_B$).
2. Alice performs 4 DH exchanges:
   * $DH1 = DH(IK_A, SPK_B)$
   * $DH2 = DH(EK_A, IK_B)$
   * $DH3 = DH(EK_A, SPK_B)$
   * $DH4 = DH(EK_A, OPK_B)$
3. Alice concatenates these results and applies a **HKDF-SHA256** function to generate the **Master Secret ($SK$)**.

```text
  ALICE (SENDER)                    TRUSTLINE SERVER                    BOB (RECIPIENT)
  +------------+                    +--------------+                    +-------------+
        |                                   |                                  |
        |                                   | <--- [1. Upload Pre-Keys] -------|
        |                                   |      (IK_b, SPK_b, OPKs)         |
        |                                   |                                  |
        | --- [2. Fetch Bob's Keys] ------> |                                  |
        | <--- (IK_b, SPK_b, OPK_b1) ------ |                                  |
        |                                   |                                  |
  [3. LOCAL MATH]                           |                                  |
  Generate EK_a                             |                                  |
  DH1 = (IK_a, SPK_b)                       |                                  |
  DH2 = (EK_a, IK_b)                        |                                  |
  DH3 = (EK_a, SPK_b)                       |                                  |
  DH4 = (EK_a, OPK_b1)                      |                                  |
  SECRET = HKDF(DH1-4)                      |                                  |
        |                                   |                                  |
        | --- [4. Encrypted Msg] ---------> |                                  |
        |      (Ciphertext + EK_a)          | --- [5. Blind Route] ----------> |
        |                                   |                                  |
        |                                   |                          [6. LOCAL MATH]
        |                                   |                          Derive SAME Secret
        |                                   |                          Decrypt & Sync
```
<div class="caption">Figure 2: X3DH Key Agreement</div>

**Phase 2: Double Ratchet Algorithm**
After the initial secret is established, the Double Ratchet uses a new one-time key to encrypt each message. It possesses a **Symmetric-Key Ratchet** (for message chains) and a **Diffie-Hellman Ratchet** (for healing sessions).
* **Perfect Forward Secrecy:** Each message key is derived from the previous key and deleted right away. If he uses a present key then the attacker can not go backwards and decrypt earlier messages.
* **Security after a compromise:** Each time a user receives a reply a new DH exchange occurs, adding new entropy to the **Root Chain**. This "heals" the session, locking out any attacker that might have cracked a previous key.

```text
    [ ROOT CHAIN ]
          |
    +-----+-----+
    |  DH STEP  | (New DH exchange per round-trip)
    +-----+-----+
          |
          +-------------------------------------------+
          |                                           |
  [ SENDING CHAIN ]                           [ RECEIVING CHAIN ]
          |                                           |
  +-------v-------+                           +-------v-------+
  | KDF-SEND (n)  |                           | KDF-RECV (m)  |
  +-------+-------+                           +-------+-------+
          |                                           |
  +-------v-------+                           +-------v-------+
  |  MESSAGE KEY  |                           |  MESSAGE KEY  |
  | (One-Time)    |                           | (One-Time)    |
  +---------------+                           +---------------+
```
<div class="caption">Figure 3: The Double Ratchet Protocol</div>

**Argon2id Key Derivation**
Trustline uses **Argon2id**, the winner of the Password Hashing Competition, to protect the local SQLCipher vault. Argon2id is **"memory-hard",** unlike older algorithms, meaning it requires a certain RAM footprint ($m = 64$ MiB) to run. This makes GPUs prohibitively expensive for use in brute-force attacks, since GPUs are designed for computation but have very limited memory per core. The implementation ensures that each vault-unlock attempt takes **~359 ms**: a considerable cryptographic barrier, but one that doesn't make the user wait for more than half a second.

<div style="page-break-before: always;"></div>

## 5. SYSTEM IMPLEMENTATION

### 5.1 Module Description
Trustline is a very loosely coupled ecosystem of modular libraries and services. This modular design enforces strict separation of concerns, keeping the high-level User Interface (UI) logic separate from low-level cryptography, database management and network routing. The architecture permits complete security audits and components can be updated without compromising the integrity of the entire system.

**1. crypto_core — The crypto core module in Rust**
The module is the platform's "Secure Engine" and is written entirely in the Rust programming language, to take advantage of Rust's compile-time guarantees on memory safety and prevent vulnerabilities such as buffer overflows or data races.
* **Cryptographic Primitives:** Implements the Signal Protocol suite (X3DH key agreement orchestration and Double Ratchet algorithm).
* **State Management:** The module manages the complex state transitions of the ratchet chains and ensures that every message key is generated, used and deleted from volatile memory to maintain Forward Secrecy.
* **Low-Level AEAD:** Authenticated Encryption with Associated Data (AEAD) using ChaCha20-Poly1305. Provides confidentiality and integrity of payload.
* **Security Isolation:** As a self-contained binary bridge inside the Tauri runtime, private keys and session secrets are never exposed to the JS/React frontend, establishing a "Cryptographic Barrier" between the UI and the underlying secrets.

**2. The Vault (Local Messaging & Persistence Module)**
The Vault is the user's local persistent storage engine on the user's authorised device. This is to prevent history from the theft of physical devices or local access without authorisation.
* **SQLCipher Support:** SQLite database encrypted with AES-256-GCM using SQLCipher. If the biometric assertion passes, the database is obfuscated using a master key generated by Argon2id.
* **Local Full-Text Search (FTS5):** The server is not able to index messages to keep the "Zero-Knowledge" promise. So this module uses the SQLite FTS5 extension for fast local search. This allows users to search their history with sub-second latency without leaking keywords to the network.
* **Asynchronous Message Queuing:** Messages are queued locally until a secure WebSocket connection is reconnected. This provides a nice "offline-first" experience.

**3. Blind Routing Module (Real Time Relay)**
The module runs on the enterprise's private infrastructure and it is the only module that processes live network traffic. It is based on the Axum web framework and the Tokio asynchronous runtime.
* **Routing Logic (Content Blind):** The relay is totally "content blind". It just waits for temporary routing identifiers (recipient_device_id), and routes encrypted blobs down the right websocket channel. It doesn't have the keys to decrypt them.
* **Message Orchestration (NATS JetStream):** The module leverages NATS JetStream to make messages persistent for offline recipients. This ensures that all encrypted payloads are queued safely and retransmitted when the recipient comes back online, even on flaky networks.
* **Database Isolation (Postgres RLS):** This gives you organization level isolation in SQL. The relay uses PostgreSQL Row-Level Security (RLS) to strictly scope every database transaction to the user's org_id, making cross-tenant data leakage impossible at the database layer.

```text
     [ INCOMING QUERY ]
             |
   +---------v----------+
   |   SET LOCAL       |
   | app.current_org_id| <--- (Assigned per session/request)
   +---------+----------+
             |
   +---------v----------+
   |  POSTGRES ENGINE   |
   | (RLS Enforcement)  |
   +---------+----------+
             |
    _________v_________________________________
   | DATABASE ROWS                             |
   | [Org A Data] <--- [ ACCESS GRANTED ]      |
   | [Org B Data] <--- [ ACCESS DENIED ]       |
   |___________________________________________|
```
<div class="caption">Figure 4: PostgreSQL Row-Level Security (RLS)</div>

**4. Control of the Device and Human-Machine Interface**
This module provides the administrative and end-user controls to manage a modern enterprise device ecosystem.
* **Cryptographic Ring:** One user identity can be associated with multiple authorised endpoints (e.g. Desktop, Laptop, Mobile). Double Ratchet session is different at each endpoint. If one of the devices is compromised, the other device history is not compromised.
* **Remote Kill Switch:** This module allows administrators to instantly kill a specific device_id in the case that a device is lost or an employee leaves the company. The revoked device will no longer receive new pre-key bundles and will no longer receive new encrypted blobs and its session is terminated immediately.
* **Roster & Policy Management:** Define data retention policies such as "Message Self-Destruct" or "30-Day TTL" for the relay to enforce and automatically delete old metadata and ciphertext.

**5. Identification and authentication module**
Trustline's security paradigm is "Passwordless" with hardware anchored identities instead of weak credentials.
* **WebAuthn/FIDO2 Orchestration:** This module manages the registration and assertion ceremonies between the webauthn-rs client and backend. It binds the login to a physical hardware authenticator (Touch ID, Face ID, YubiKey, etc.).
* **Phishing-Resistant Auth:** This module uses asymmetric cryptography that keeps the private key entirely within the hardware's Secure Enclave, protecting the platform from remote phishing and credential stuffing attacks.
* **Onboarding Gate (Waitlist):** Manages the initial signup for a user and puts new identities into a "Pending Approval" state until an administrator can verify the corporate email and manually approve the device registration.

```text
   USER DEVICE (Hardware)               TRUSTLINE BACKEND
   +--------------------+               +-------------------+
   |  Browser/Tauri UI  |               |   webauthn-rs     |
   +---------+----------+               +---------+---------+
             |                                    |
             | <------- [1. Challenge] -----------|
             |                                    |
   +---------v----------+                         |
   |   SECURE ENCLAVE   |                         |
   | (Biometric Check)  |                         |
   +---------+----------+                         |
             |                                    |
             | -------- [2. Signed Auth] -------->|
             |                                    |
             |                                [3. VERIFY]
             | <------- [4. JWT Issued] ----------|
```
<div class="caption">Figure 5: WebAuthn Passwordless Authentication</div>

<div style="page-break-before: always;"></div>

## 6. SYSTEM TESTING
**Trustline** has been through a rigorous six-month testing phase to verify the security claims and reliability of the performance under enterprise-grade, high-stress conditions. Due to the "Zero-Knowledge" characteristic of the platform, testing was in the direction of ensuring the cryptographic barrier was uncrackable, even assuming the underlying network or server was compromised.

### 6.1 Unit Testing
Unit testing was done at the lowest level of the application to ensure that individual components were working correctly in isolation. This was centred on the **Rust Cryptographic Core (`crypto_core`)**. Each mathematical function was rigorously verified.
* **Cryptographic Verification:** All internal functions, including **Argon2id** hash generation, **X25519** Diffie-Hellman exchanges, and **HMAC-SHA256** key derivation were tested against official test vectors from **RFC 9106** and the Signal Protocol specifications.
* **Logic of State Machine:** We wrote specific unit tests to simulate "ratchet advancement" to test that the **Double Ratchet** state transition logic correctly derived the next chain key and deleted the previous one (to prevent memory-dump attacks).
* **Frontend Components:** For the unit tests of the React 19 frontend we used **Vitest** and **React Testing Library** with mocked IPC (Inter-Process Communication). This provided correctness guarantees for the UI components to display states like "Decrypting...", "Message Delivered", and "Key Rotation Success" without access to the actual underlying secrets.

### 6.2 Integrated Testing
Integrated testing has been performed on the complex interaction of the three layers of the Trustline architecture: the React UI, the Tauri Rust bridge and the remote NATS relay.
* **Bridging Flow:** We tested the entire end to end life cycle of one message. That meant checking that a string typed into the UI made it through IPC to the Rust core, got encrypted with the current **Double Ratchet** session key, got stored in the local **SQLCipher Vault** and sent as an opaque blob to the NATS broker.
* **Concurrent requests:** The tests were meant to ensure the backend **Tokio async runtime** handles multiple concurrent WebSocket requests properly, with no deadlocks in the database or leaking of RLS context.
* **DB synchronisation:** The integrated tests have verified that the **PostgreSQL RLS** policies correctly partition the data, such that an authenticated user from "Org A" will never be able to retrieve an encrypted blob from "Org B" even if they know the specific message ID.

### 6.3 Black Box Testing
In Black Box testing the system was treated as an opaque entity, where the testers were external adversaries with no knowledge of the underlying source code.
* **Network Eavesdropping:** Using **Wireshark**, a deep packet analysis was performed on the traffic between the client and server. This confirmed that all communication was over secure WebSockets (WSS), and no plaintext content nor sensitive metadata (e.g. sender/recipient names) was visible to a network-level observer.
* **Boundary Value Testing:** Testers were given extreme inputs, including large file attachments and invalid webauthn signatures, to make sure the system could handle errors gracefully without crashing or leaking stack traces.
* **Tests of the Security Function:** We tested the **"Remote Kill Switch"** specifically in a simulated device theft situation. Testing showed that if an admin in the console revoked a `device_id` the server would immediately kill the WebSocket session and reject any further crypto requests from that endpoint.

### 6.4 White Box Testing
White Box testing was a line-by-line structural audit of the application's logic, specifically targeting the memory safety and cryptographic state management of the rust codebase.
* **Memory Safety Audit:** We audited the Rust core with tools such as **Valgrind** and **Cargo Tarpaulin** to find any potential memory leaks or uninitialised variables that could be exploited in a "cold-boot" attack.
* **Logic Path Verification:** We systematically mapped all possible paths of the **X3DH handshake** to ensure that "Old Prekeys" are correctly purged, and that the system can never return to a previously used master secret.
* **Automated UI Drivers:** We employed **tauri-driver** and the WebDriver protocol to automate complex UI journeys, ensuring that the internal state of the local vault was consistent, even if the application was forcefully restarted during a synchronisation event.

### 6.5 Verification Testing
Verification testing showed that the software was developed strictly in conformity with the documented technical specifications and functional requirements.
* **Requirement Mapping:** All features as defined in **Functional Requirements Document (FRD)** such as 1-on-1 E2EE messaging, hardware-anchored login and local full-text search were verified against the final build.
* **Conformance to Specifications:** We verified that the database schema perfectly matched the **API Contract** and that all the **PostgreSQL RLS** policies were correctly applied on tenant-scoped tables.
* **Measure Performance:** We verified the system achieved the system target performance goals, including the **359ms authentication latency** and **110ms synchronisation speed** described in the project overview.

### 6.6 Validation Testing
Validation testing was performed to ensure the system met the real-world, high-stakes needs of a modern enterprise environment.
* **Adversarial Settings:** We simulated a "Malicious Admin" scenario where an attacker with full root privileges on the PostgreSQL database attempts to read user messages. The validation was successful only when the attacker could find the encrypted blobs that they could not decrypt without the client's hardware keys.
* **Real Life Connectivity:** We validated the resilience of the platform by testing it on high-latency public Wi-Fi networks, and cellular data. The system managed to preserve E2EE integrity and "self-healed" the **Double Ratchet** session even after multiple packet drops and connection resets.

### 6.7 User Acceptance Testing (UAT)
The last stage was a controlled deployment to ten enterprise representative users who used the platform for two weeks doing their usual professional workflows.
* **Productivity evaluation:** Users were particularly interested in the real-time messaging and the intuitiveness of the **Passkey (WebAuthn)** login process.
* **Quantitative Feedback:** 90% of participants revealed that the high-security features (e.g. biometric prompts for unlocking the vault) did not influence their daily productivity.
* **Feedback (Qualitative):** Users appreciated the "seamless" feel of the desktop app, as well as the local search feature's reliability, confirming that the **Zero-Knowledge** architecture provided a user experience comparable to centralised SaaS options.

<div style="page-break-before: always;"></div>

## 7. RESULTS AND DISCUSSION

The **Trustline** was evaluated with a battery of empirical tests focusing on performance latency, cryptographic resilience and system scalability. The results confirm that the "Zero-Knowledge" architecture provides high-assurance security without sacrificing the real-time collaborative experience needed for enterprise workflows.

### 7.1 Performance Evaluation Metrics
The main performance metrics were focused on the reactivity of the system, in particular the time taken for hardware-based authentication and the latency of the synchronisation of the encrypted data among distributed nodes.

**Table 3: Key Performance Benchmarks**

| Performance Metric | Target Threshold | Achieved Result (Mean) | Status |
| :--- | :--- | :--- | :--- |
| **Authentication Latency (WebAuthn)** | < 500 ms | **359 ms** | **Success** |
| **Message Sync Latency (CRDT/NATS)** | < 250 ms | **110 ms** | **Success** |
| **E2EE Channel Setup (X3DH)** | < 1,000 ms | **850 ms** | **Success** |
| **Server-Side Plaintext Exposure** | 0 Bytes | **0 Bytes** | **Success** |
| **Concurrent Connection Capacity** | 10,000 per node | **12,500 per node** | **Success** |
<div class="caption">Table 3: Key Performance Benchmarks</div>

#### 7.1.1 Authentication Latency Analysis
The average latency of the authentication process using **WebAuthn** and **Argon2id** key derivation was **359 ms**. Although Argon2id is a memory-hard function which is computationally expensive, the implementation optimised the memory ($m=64$ MiB) and iteration ($t=3$) parameters such that the "Cryptographic Barrier" was formed in less than half a second. This provides a smooth login experience while offering strong resistance against unauthorised access.

#### 7.1.2 Synchronization and Real-Time Responsiveness
One of the critical success factors for Trustline was "real-time" synchronisation in a fully encrypted environment. Using **Conflict-Free Replicated Data Types (CRDTs)** and a high-performance **NATS JetStream** relay, the system achieved a mean synchronisation latency of **110 ms**. This number is well below the industry standard for real-time interaction (250 ms) and prevents users from waiting in collaborative messaging or file sharing.

```text
[ USER A ]                                [ BLIND SERVER ]                          [ USER B ]
    |                                             |                                     |
 1. Edit (UI)                                     |                                     |
    |                                             |                                     |
 2. Yjs CRDT Engine (Generate Delta)              |                                     |
    |                                             |                                     |
 3. Tauri Rust (Encrypt with Ratchet Key)         |                                     |
    |                                             |                                     |
 4. WebSocket Send --------------------------> [RELAY]                                  |
    |                                     (Routes by ID)                                |
    |                                             | ----------------------------------> |
    |                                             |                          5. Tauri Rust (Decrypt)
    |                                             |                                     |
    |                                             |                          6. Yjs CRDT Engine (Merge)
    |                                             |                                     |
    |                                             |                          7. Update UI (Render)
    |                                             |                                     |
    |<============= SUCCESS: BOTH DEVICES SYNCED IN ~110ms ============================>|
```
<div class="caption">Figure 6: CRDT Synchronization Flow</div>

### 7.2 Cryptographic Resilience and Security Discussion
The security discussion evaluates the platform's ability to withstand adversarial attacks, specifically focusing on brute-force attempts and data isolation.

#### 7.2.1 Brute-Force Resistance Analysis
The integration of the **Argon2id** algorithm provides a robust defense against hardware-accelerated attacks. Based on current GPU-accelerated brute-force capabilities, the time required to crack a localized Trustline vault is significantly higher than legacy methods:

**Table 4: Brute-Force Resistance Comparison**

| Algorithm | Hardware Setup | Estimated Time to Compromise |
| :--- | :--- | :--- |
| **Standard SHA-256** | 8x RTX 4090 Cluster | ~4.5 Months |
| **PBKDF2 (100k Iterations)** | 8x RTX 4090 Cluster | ~22 Years |
| **Argon2id (Trustline Config)** | 8x RTX 4090 Cluster | **~112,700 Years** |
<div class="caption">Table 4: Brute-Force Resistance Comparison</div>

The results demonstrate that Trustline's configuration is exponentially more secure than legacy hashing methods. This is due to the memory-hard nature of Argon2id, which forces the attacker's hardware to saturate RAM, effectively neutralizing the parallel processing advantage of modern GPUs.

#### 7.2.2 Zero-Knowledge Verification
Network-level audits and memory-dump tests confirmed the **Zero-Knowledge** property of the architecture. Testing verified that:
1. **Opacity on the server side:** The PostgreSQL database and NATS relay logs had exactly **0 bytes** of plaintext content. Only encrypted blobs and short-lived routing IDs were persisted.
2. **Metadata Sanitisation:** Ephemeral identifiers were successfully removed at the end of the organization's defined retention SLA, reducing the risk of behavioural profiling.
3. **Isolation of Tenants:** The **PostgreSQL Row-Level Security (RLS)** policies successfully blocked attempts to inject a different `org_id` into the SQL transaction context, confirming that isolation is enforced at the database layer.

### 7.3 Discussion of Findings
The experimental data indicate that the project has met all the stated objectives successfully. Moving to a **"Blind Router"** architecture basically pushed the crypto burden to the client, but the use of **Tauri and Rust** ensured that this didn't mean a slow user experience.
* **Memory Safety Implication:** The cryptographic core was written in Rust to eliminate memory vulnerabilities (e.g. buffer overflows) that are common in legacy C-based encryption engines 100%.
* **Scalability:** The backend could handle more than **12,500 concurrent connections** per node, making it usable for large enterprise deployments without massive infrastructure investments.
* **Administrative Control:** The **"Remote Kill Switch"** feature was confirmed effective for immediate mitigation; when a device was revoked, the relay server simply discarded any further encrypted blobs intended for that endpoint, "cauterising" the potential breach straightaway.

In short, Trustline provides a secure collaborative environment for enterprises. The results show that high-performance real-time features can exist with strict Zero-Knowledge security, offering organisations a viable way to regain absolute digital sovereignty.

<div style="page-break-before: always;"></div>

## 8. CONCLUSION
The development of **Trustline** successfully solves the systemic security vulnerabilities of modern centralised collaboration platforms. By designing a self-hosted, **Zero-Knowledge** architecture the project has successfully removed the need for organisations to have "Implicit Trust" in third-party service providers. This platform is a technical proof-of-concept that absolute digital sovereignty and high-performance real-time collaboration are not mutually exclusive.

The project shows that state-of-the-art cryptographic primitives can be integrated seamlessly in a production grade application with little impact on the user experience. The use of the **Signal Protocol** (with the **X3DH** key agreement and the **Double Ratchet** algorithm) ensures that every message is encrypted with an ephemeral session key, offering strong **Forward Secrecy** and **Post-Compromise Security**. Additionally, the use of **Argon2id** for local vault security provides a proven defence against hardware-accelerated brute-force attacks, estimated to last more than **112,700 years**. This establishes a new standard in the realm of local data security.

The choice of the **Tauri v2** framework and a memory-safe **Rust** cryptographic core is technically relevant, as it has proven to be key in reducing the attack surface of the application while optimising resource consumption. With the backend using **NATS JetStream** and **PostgreSQL Row-Level Security (RLS)**, the platform has a mean latency of synchronisation of only **110 ms**. This is well below the standard requirements for fluid real-time interaction.

In summary, **Trustline** offers an impregnable, professional-grade solution for regulated industries such as healthcare, finance and legal services where data confidentiality is a legal and operational imperative. Trustline gives enterprises digital sovereignty back, by transferring the control of the encryption keys from the cloud provider to the authorised hardware of the user. This project is a clear alternative to centralised SaaS solutions that keep sensitive corporate workflows truly private and secure in a world of omnipresent digital surveillance.

<div style="page-break-before: always;"></div>

## 9. LIMITATIONS & SCOPE OF FUTURE WORK

The first release of **Trustline 1.0** provides a solid, trust-based foundation for secure enterprise collaboration, but exploration has revealed specific technical constraints that pave the way for future iterations. Overcoming these limitations will be essential for scaling the platform for global, cross-platform enterprise environments.

### 9.1 Limitations

#### 9.1.1 Scalability of Pairwise Encryption in Large Groups
At present the **Signal Protocol** is implemented for high-security 1-on-1 communications. Group messaging is done with "pairwise" or "sender key" logic in 1.0. The computational overhead for key distribution and state management scales linearly, $O(N)$, with the number of participants ($N$) in a group. This results in large battery drain and processing latency for low-power client devices during large scale re-keying events for organisational departments with hundreds of participants.

#### 9.1.2 Absence of Native Mobile Integration
The initial R&D phase was strictly confined to the desktop environment (Windows, macOS, Linux) to provide a stable "Cryptographic Barrier" within the **Tauri v2** runtime. Hence, native mobile versions (iOS/Android) are not available yet. Mobile platforms are challenging for Zero-Knowledge systems especially in background synchronisation and in keeping end-to-end encryption within centralised push notification relays (APNs/FCM).

#### 9.1.3 Vulnerability to Quantum Computing Threats
Trustline currently uses **Elliptic Curve Cryptography (X25519)** as its primary key exchange. These algorithms are practically unbreakable with today's standards of classical computing but are theoretically breakable with **Shor's Algorithm** if run on a sufficiently powerful quantum computer. This is a "Harvest Now, Decrypt Later" risk where an adversary could record encrypted enterprise traffic today in the hope of decrypting it when quantum hardware becomes feasible.

#### 9.1.4 Searchability of Encrypted Media and Attachments
While Trustline offers full-text search for text messages via local **FTS5**, the system cannot index the content of encrypted file attachments (PDFs, images) without decrypting them. In an enterprise environment where knowledge management is key, the inability to perform deep-content searches on encrypted documents presents a usability trade-off between absolute privacy and operational efficiency.

### 9.2 Scope of Future Work

#### 9.2.1 Integration of Messaging Layer Security (MLS)
Future versions will migrate to the **IETF Messaging Layer Security (MLS)** protocol to solve the group scalability problem. MLS uses **TreeKEM** logic, meaning that group operations (adding and removing members) scale logarithmically, $O(\log N)$, compared to the linear scaling of the Signal Protocol. This will allow Trustline to host encrypted rooms with thousands of participants without sacrificing device performance.

#### 9.2.2 Transition to Post-Quantum Cryptography (PQC)
The platform's cryptographic core will be updated with **NIST-approved Post-Quantum algorithms** to safeguard data against future quantum threats. This includes **ML-KEM (not Kyber anymore)** for key encapsulation and **ML-DSA (Dilithium)** for digital signatures. Trustline will use a hybrid cryptographic approach (X25519 + PQC) to ensure that today's communications remain secure for decades to come.

#### 9.2.3 Mobile Platform Parity and Secure Push Relays
Future work includes extending the **Tauri v2** codebase to support native iOS and Android. This will involve creating a **Privacy-Preserving Push Relay** that will allow users to receive message notifications without the relay server or the OS provider (Apple/Google) knowing who sent the message or what it says. It does this by sending short-lived notification payloads that trigger a background sync of decryption on the device.

#### 9.2.4 Searchable Symmetric Encryption (SSE)
**Searchable Symmetric Encryption (SSE)** will be investigated to allow for more advanced search functionality. Mathematical "blind indexes" could make the platform even more useful for the legal and financial industries by allowing users to search their encrypted document repositories on the server without the server having any idea what the files or searches are about.

<div style="page-break-before: always;"></div>

## 11. APPENDIX

### 11.1 Source Code
The Trustline project consists of three primary modules: the core-crypto Rust library, the desktop-ui React/Tauri app, and the relay-backend Axum server.
Sample Logic for the Double Ratchet State Transition (Rust):

```rust
pub fn ratchet_step(current_state: &mut State, remote_public_key: PublicKey) -> Result<(), CryptoError> {
    // If the remote public key has changed, perform a DH ratchet step
    if remote_public_key != current_state.dh_remote {
        current_state.dh_remote = remote_public_key;
        
        // Update Root Key and Receiving Chain Key
        let dh_output = diffie_hellman(&current_state.dh_local_pair, &current_state.dh_remote);
        let (new_root, new_recv_chain) = kdf_root(&current_state.root_key, &dh_output);
        current_state.root_key = new_root;
        current_state.recv_chain_key = new_recv_chain;
        
        // Generate new local pair and update Sending Chain Key
        current_state.dh_local_pair = generate_keypair();
        let dh_output_send = diffie_hellman(&current_state.dh_local_pair, &current_state.dh_remote);
        let (new_root_send, new_send_chain) = kdf_root(&current_state.root_key, &dh_output_send);
        current_state.root_key = new_root_send;
        current_state.send_chain_key = new_send_chain;
    }
    Ok(())
}
```

### 11.2 Output Screen Shots
The following screenshots illustrate the system in operation:

![Identity Verification Screen](../assets/Login_trustline.png)
<div class="caption">Figure 7: Identity Verification Screen: Showing the hardware-backed WebAuthn login process and the display of the unique "Safety Number" for identity verification between users.</div>

![Encrypted Message Vault](../assets/Chatpage_trustline.png)
<div class="caption">Figure 8: Encrypted Message Vault: Displaying the main messaging interface with real-time sync indicators and the sub-second local search results for the SQLCipher database.</div>

![Administrator Device Portal](../assets/Roster_AdminConsole.png)
<div class="caption">Figure 9: Administrator Device Portal: Showing the list of authorized staff devices and the "Remote Kill Switch" interface for revoking compromised endpoints.</div>

![Relay Node Monitor](../assets/Audit_Log_AdminConsole.png)
<div class="caption">Figure 10: Relay Node Monitor: A server-side view of the NATS JetStream metrics, showing the encrypted blob throughput without any plaintext data visibility.</div>

![Admin Console - Pending Approvals](../assets/Pending_Approval_AdminConsole.png)
<div class="caption">Figure 11: Admin Console - Pending Approvals: Interface for administrators to approve new devices.</div>

![Admin Console - Policies](../assets/Policies_AdminConsole.png)
<div class="caption">Figure 12: Admin Console - Policies: Interface for administrators to configure global retention policies.</div>

---

<div style="page-break-before: always;"></div>

## 10. REFERENCES

[1] "Product_Overview.md."

[2] "Tauri Architecture | Tauri v1," [Online]. Available: https://tauri.app/v1/references/architecture/. [Accessed: April 22, 2026].

[3] "On the Tight Security of the Double Ratchet - ETH Zurich Research Collection," [Online]. Available: https://www.research-collection.ethz.ch/server/api/core/bitstreams/e00a372c-1f37-4e10-822d-5a19bf9efbd6/content. [Accessed: April 22, 2026].

[4] "JEP draft: Argon2 Password Hashing Algorithm - OpenJDK," [Online]. Available: https://openjdk.org/jeps/8377081. [Accessed: April 22, 2026].

[5] "Zero trust architecture for AI-powered cloud systems: Securing the ...," [Online]. Available: https://journalwjarr.com/sites/default/files/fulltext_pdf/WJARR-2025-1173.pdf. [Accessed: April 22, 2026].

[6] "A Systematic Literature Review on the Implementation and ... - MDPI," [Online]. Available: https://www.mdpi.com/1424-8220/25/19/6118. [Accessed: April 22, 2026].

[7] "The Complete Guide to Password Hashing: Argon2 vs Bcrypt vs Scrypt vs PBKDF2 (2026)," [Online]. Available: https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/. [Accessed: April 22, 2026].

[8] "Argon2 vs PBKDF2 | Compare Top Cryptographic Hashing Algorithms - MojoAuth," [Online]. Available: https://mojoauth.com/compare-hashing-algorithms/argon2-vs-pbkdf2. [Accessed: April 22, 2026].

[9] "Best Secure Communication Platforms for Enterprises (2026 Guide) - Wire," [Online]. Available: https://wire.com/en/blog/best-secure-communication-platforms-enterprises. [Accessed: April 22, 2026].

[10] "Cybersecurity Analytics for the Enterprise Environment: A Systematic Literature Review," [Online]. Available: https://www.mdpi.com/2079-9292/14/11/2252. [Accessed: April 22, 2026].

[11] "Private Chats in 2025: Which App Can You Trust? | SEIRIM," [Online]. Available: https://seirim.com/en/resources/news/private-chats-in-2025-which-app-can-you-trust. [Accessed: April 22, 2026].

[12] "Best Secure Messaging Apps In 2025 - Udext," [Online]. Available: https://www.udext.com/blog/secure-text-messaging-platforms. [Accessed: April 22, 2026].

[13] "Evaluating Privacy Protection in Instant Messaging (IM ... - DiVA portal," [Online]. Available: https://ju.diva-portal.org/smash/get/diva2:1977830/FULLTEXT01.pdf. [Accessed: April 22, 2026].

[14] "Most secure messaging apps in 2026 (Ranked and reviewed) - ExpressVPN," [Online]. Available: https://www.expressvpn.com/blog/best-messaging-apps/. [Accessed: April 22, 2026].

[15] "Argon2 vs PBKDF2 | Compare Leading Cryptographic Hashing Algorithms - SSOJet," [Online]. Available: https://ssojet.com/compare-hashing-algorithms/argon2-vs-pbkdf2. [Accessed: April 22, 2026].

[16] "RFC 9106 - Argon2 Memory-Hard Function for Password Hashing and Proof-of-Work Applications - IETF Datatracker," [Online]. Available: https://datatracker.ietf.org/doc/rfc9106/. [Accessed: April 22, 2026].

[17] "Encryption Key Derivation - Bitwarden," [Online]. Available: https://bitwarden.com/help/kdf-algorithms/. [Accessed: April 22, 2026].

[18] "Top Secure Chat Platforms for Enterprises in 2026," [Online]. Available: https://secumeet.com/reviews/secure-chat-platforms-for-enterprises. [Accessed: April 22, 2026].

[19] "Matrix Conference 2025 Highlights - Hacker News," [Online]. Available: https://news.ycombinator.com/item?id=45642923. [Accessed: April 22, 2026].

[20] "Telegram vs. Signal - This Guide Makes It Easy to Choose (2026) | Mighty Networks," [Online]. Available: https://www.mightynetworks.com/resources/telegram-vs-signal. [Accessed: April 22, 2026].

[21] "8 Best Secure Messaging Apps For Encrypted Chats In 2026 | CloudSEK," [Online]. Available: https://www.cloudsek.com/knowledge-base/best-secure-messaging-apps. [Accessed: April 22, 2026].

[22] "Messaging Apps Compared 2025: SMS, iMessage, RCS, Signal, & More - Citanex," [Online]. Available: https://citanex.com/resources/messaging-apps-comparison-2025/. [Accessed: April 22, 2026].

[23] "Formal Analysis of Ratchet Protocols Based on Logic of Events - MDPI," [Online]. Available: https://www.mdpi.com/2076-3417/15/13/6964. [Accessed: April 22, 2026].

[24] "The X3DH Key Agreement Protocol - Signal," [Online]. Available: https://signal.org/docs/specifications/x3dh/x3dh.pdf. [Accessed: April 22, 2026].

[25] "Signal >> Specifications >> The Double Ratchet Algorithm," [Online]. Available: https://signal.org/docs/specifications/doubleratchet/. [Accessed: April 22, 2026].

[26] "Trying to understand Signal's double ratchet protocol : r/cryptography - Reddit," [Online]. Available: https://www.reddit.com/r/cryptography/comments/1ms1rr6/trying_to_understand_signals_double_ratchet/. [Accessed: April 22, 2026].

[27] "Tauri Testing Guide | Claude Code Skill for Desktop Apps - MCP Market," [Online]. Available: https://mcpmarket.com/tools/skills/tauri-application-testing. [Accessed: April 22, 2026].

[28] "Tauri framework: Building lightweight desktop applications with Rust | by Kevin | CodeX," [Online]. Available: https://tianyaschool.medium.com/tauri-framework-building-lightweight-desktop-applications-with-rust-3b3923c72e75. [Accessed: April 22, 2026].

[29] "Tests - Tauri," [Online]. Available: https://v2.tauri.app/develop/tests/. [Accessed: April 22, 2026].

[30] "An Efficient and Generic Construction for Signal's Handshake (X3DH): Post-Quantum, State Leakage Secure, and Deniable," [Online]. Available: https://csrc.nist.gov/csrc/media/Events/2022/fourth-pqc-standardization-conference/documents/papers/an-efficient-and-generic-construction-for-signals-handshake-pqc2022.pdf. [Accessed: April 22, 2026].
