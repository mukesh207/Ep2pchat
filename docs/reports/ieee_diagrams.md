# Trustline IEEE Formatted Diagrams

The following diagrams have been converted from their original text-based ASCII format into IEEE-compliant Mermaid visualizations. They are styled in a professional, monochrome format (black outlines, white background, Times New Roman font) to meet the strict formatting requirements of academic publications.

You can right-click any of the rendered diagrams below and save them as an image or copy them to your clipboard to paste directly into your `Trustline_IEEE_Formatted.docx` file.

---

### 1. CRDT Synchronization Flow
Converted from `CRDT_flow.txt`

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryBorderColor': '#000000', 'primaryTextColor': '#000000', 'lineColor': '#000000', 'textColor': '#000000', 'fontFamily': 'Times New Roman'}}}%%
sequenceDiagram
    participant A as USER A
    participant S as BLIND SERVER (RELAY)
    participant B as USER B

    Note over A: 1. Edit (UI)<br/>2. Yjs CRDT Engine (Generate Delta)<br/>3. Tauri Rust (Encrypt with Ratchet Key)
    A->>S: 4. WebSocket Send (Encrypted)
    Note over S: Routes by ID (No Decryption)
    S->>B: 4. WebSocket Relay
    Note over B: 5. Tauri Rust (Decrypt)<br/>6. Yjs CRDT Engine (Merge)<br/>7. Update UI (Render)
    A-->>B: SUCCESS: BOTH DEVICES SYNCED IN ~110ms
```

---

### 2. Zero-Knowledge "Blind Router" Logic
Converted from `diagram.txt` (Section 1)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryBorderColor': '#000000', 'primaryTextColor': '#000000', 'lineColor': '#000000', 'textColor': '#000000', 'fontFamily': 'Times New Roman'}}}%%
flowchart TD
    subgraph Client ["CLIENT DEVICE (Secure)"]
        UI["User Interface (UI)<br/>(React)"]
        TR["Tauri Rust Runtime<br/>(Crypto Operations)"]
        DB["SQLCipher Vault<br/>(Local Decrypted DB)"]
        UI --> TR
        TR --> DB
    end

    subgraph Backend ["BACKEND (Blind)"]
        RA["Rust / Axum<br/>Relay Server"]
        NATS["NATS JetStream<br/>(Msg Routing)"]
        PG["PostgreSQL DB<br/>(RLS Isolated)"]
        RA --> NATS
        NATS --> PG
    end

    TR <-->|"Encrypted Blobs<br/>(Untrusted Network)"| RA
    DB -.->|"Logical Sync<br/>(Encrypted Data)"| PG

    classDef default fill:#fff,stroke:#000,stroke-width:1.5px,color:#000;
    style Client fill:#ffffff,stroke:#000,stroke-width:2px,color:#000;
    style Backend fill:#ffffff,stroke:#000,stroke-width:2px,color:#000;
```

---

### 3. X3DH Key Agreement (Asynchronous Setup)
Converted from `diagram.txt` (Section 2)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryBorderColor': '#000000', 'primaryTextColor': '#000000', 'lineColor': '#000000', 'textColor': '#000000', 'fontFamily': 'Times New Roman'}}}%%
sequenceDiagram
    participant A as ALICE (SENDER)
    participant S as TRUSTLINE SERVER
    participant B as BOB (RECIPIENT)

    B->>S: 1. Upload Pre-Keys (IK_b, SPK_b, OPKs)
    A->>S: 2. Fetch Bob's Keys
    S-->>A: (IK_b, SPK_b, OPK_b1)
    
    Note over A: 3. LOCAL MATH<br/>Generate EK_a<br/>DH1 = (IK_a, SPK_b)<br/>DH2 = (EK_a, IK_b)<br/>DH3 = (EK_a, SPK_b)<br/>DH4 = (EK_a, OPK_b1)<br/>SECRET = HKDF(DH1-4)
    
    A->>S: 4. Encrypted Msg (Ciphertext + EK_a)
    S->>B: 5. Blind Route
    
    Note over B: 6. LOCAL MATH<br/>Derive SAME Secret<br/>Decrypt & Sync
```

---

### 4. The Double Ratchet Protocol
Converted from `diagram.txt` (Section 3)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryBorderColor': '#000000', 'primaryTextColor': '#000000', 'lineColor': '#000000', 'textColor': '#000000', 'fontFamily': 'Times New Roman'}}}%%
flowchart TD
    RC["ROOT CHAIN"]
    DH["DH STEP<br/>(New DH exchange per round-trip)"]
    SC["SENDING CHAIN"]
    RECC["RECEIVING CHAIN"]
    KDFS["KDF-SEND (n)"]
    KDFR["KDF-RECV (m)"]
    MK1["MESSAGE KEY<br/>(One-Time)"]
    MK2["MESSAGE KEY<br/>(One-Time)"]

    RC --> DH
    DH -->|Advance| SC
    DH -->|Advance| RECC
    SC --> KDFS
    RECC --> KDFR
    KDFS --> MK1
    KDFR --> MK2

    classDef default fill:#fff,stroke:#000,stroke-width:1.5px,color:#000;
```

---

### 5. WebAuthn Passwordless Authentication
Converted from `diagram.txt` (Section 4)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryBorderColor': '#000000', 'primaryTextColor': '#000000', 'lineColor': '#000000', 'textColor': '#000000', 'fontFamily': 'Times New Roman'}}}%%
sequenceDiagram
    participant UI as Browser/Tauri UI
    participant SE as SECURE ENCLAVE (Hardware)
    participant BE as TRUSTLINE BACKEND

    BE->>UI: 1. Challenge
    UI->>SE: Request Biometric Check
    SE-->>UI: Biometric Check Passed
    UI->>BE: 2. Signed Auth
    Note over BE: 3. VERIFY
    BE-->>UI: 4. JWT Issued
```

---

### 6. PostgreSQL Row-Level Security (RLS)
Converted from `diagram.txt` (Section 5)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryBorderColor': '#000000', 'primaryTextColor': '#000000', 'lineColor': '#000000', 'textColor': '#000000', 'fontFamily': 'Times New Roman'}}}%%
flowchart TD
    IQ["INCOMING QUERY"]
    SL["SET LOCAL app.current_org_id<br/>(Assigned per session/request)"]
    PE["POSTGRES ENGINE<br/>(RLS Enforcement)"]
    
    subgraph DB ["DATABASE ROWS"]
        direction TB
        OA["[Org A Data]"]
        OB["[Org B Data]"]
    end

    IQ --> SL
    SL --> PE
    PE -->|ACCESS GRANTED| OA
    PE -.->|ACCESS DENIED| OB

    style OA fill:#fff,stroke:#000,stroke-width:1.5px,color:#000
    style OB fill:#fff,stroke:#000,stroke-width:1.5px,stroke-dasharray: 5 5,color:#000
    classDef default fill:#fff,stroke:#000,stroke-width:1.5px,color:#000;
```
