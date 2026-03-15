# Trustline: UI/UX Journey & Wireframe Flows

**Document Version:** 1.0
**Design Philosophy:** The UI must feel incredibly premium, state-of-the-art, and responsive. It should utilize modern aesthetics (glassmorphism, subtle gradients, deep dark modes, and micro-animations) while feeling distinctly like a secure, zero-trust workspace. Trustline is not a toy; it is a tool for highly confidential enterprise operations.

---

## 1. The Global Aesthetic
*   **Color Palette:** Deep Obsidian (`#0D1117`) background with high-contrast, vibrant accents (e.g., Electric Blue `#3B82F6` or Neon Teal `#14B8A6`) used strictly for interactive elements.
*   **Typography:** Modern, clean sans-serif (e.g., `Inter` or `Geist`) for instant readability during high-stress incident responses.
*   **Animations:** Smooth, hardware-accelerated micro-interactions (e.g., buttons subtly expanding on hover, messages fluidly sliding into view). There should be no janky or sudden visual shifts.

---

## 2. The Onboarding Flow (The "HR Checkpoint")

The hardest part of a zero-trust platform is securely onboarding a new human without using passwords.

### Step 2.1: The Identity Gateway (Web/Desktop)
1.  **Welcome Screen:** A stark, beautiful landing page specific to the tenant (e.g., `acme.encryptedchat.in`). It asks for a single input: `Corporate Email Address` or `Employee ID`.
2.  **The Waiting Room:** Once entered, the user cannot proceed. The UI transitions to a "Pending IT Approval" state, showing a unique, randomly generated "Access Code" (e.g., `7X9C-V2B4`). The user is instructed to contact their IT Admin and provide this code.

### Step 2.2: The Admin Approval (Admin Dashboard)
1.  **The IT Admin Side:** The Admin sees a real-time notification: *"Alice (alice@acme.com) is requesting workspace access with Code 7X9C-V2B4."*
2.  **Verification:** The Admin verifies Alice's identity out-of-band (e.g., a phone call) and clicks **Approve**.

### Step 2.3: The Device Binding (WebAuthn/Passkey)
1.  **The Unlocking:** The moment the Admin clicks approve, Alice's screen seamlessly transitions (via WebSocket) to the **Device Registration** screen.
2.  **The Passkey Prompt:** A native OS prompt appears (Windows Hello / Mac TouchID / FaceID) asking Alice to register her device as her cryptographic identity.
3.  **The Generation:** In the background, the device's Secure Enclave generates the `Ed25519` keypairs. The public keys are sent to the server. Alice is securely logged in.

---

## 3. The Main Workspace Interface

Once authenticated, the UI is split into a classic, yet highly polished, dual-pane view.

### Pane A: The Left Sidebar (Navigation & Activity)

*   **Tenant Header:** Top left displays the company logo and tenant name (e.g., `Acme Corp Secure Comms`).
*   **Quick Search:** A frictionless, globally accessible search bar. (Note: Search must happen *locally* on the client, as the server cannot read messages to search them).
*   **Active Conversations list:**
    *   Direct Messages (1-to-1).
    *   Encrypted Rooms (Groups).
    *   **Visual Indicators:**
        *   An "Unread" pill indicator.
        *   A subtle "Typing..." animation.
        *   A "Shield" icon next to every name to subtly reinforce that the connection is E2E encrypted.
*   **User Status Bar (Bottom Left):** Shows the current user's avatar, online status toggle, and quick access to Settings/Device Management.

### Pane B: The Chat Arena (The Secure Vault)

*   **Chat Header:** Shows the recipient's name, their active device status (e.g., "Active on Desktop"), and a "Verify Keys" button (for paranoid users to manually check cryptographic fingerprints).
*   **The Message Feed:**
    *   Messages are bubbled cleanly.
    *   Messages from others align left; your messages align right.
    *   **Timestamps & Status:** Each of your messages clearly displays its delivery status (Sent → Delivered → Read).
    *   **Ephemeral Indicator (Optional):** If a room is set to auto-delete, a subtle burning/timer icon sits next to messages.
*   **The Composer (Bottom):**
    *   A rich text input area.
    *   Attachment button (`+`) for encrypting and sending files.
    *   "Send" button that illuminates as you type.

---

## 4. Operational Controls & Settings

### Device Management (User Level)
*   A clean interface showing all currently authorized devices (e.g., "iPhone 15 Pro", "MacBook Air").
*   A user can revoke a lost device themselves from an active device, immediately destroying that lost device's access to the cryptographic network.

### Admin Dashboard (Tenant Level)
*   Only visible to users designated as Admins.
*   **User Roster:** A list of all employees and their active device count.
*   **Audit Log:** A read-only ledger of security events (e.g., "Admin Bob approved User Charlie", "User Dave registered a new mobile device").
*   **Retention Policies:** Sliders to configure global data destruction (e.g., "Purge all encrypted metadata older than 30 Days").

---

## 5. Micro-Interactions & "The Feel"
*   **Key Exchange Animation:** The very first time you message a new employee, a lightning-fast, subtle animation should occur indicating "Establishing Secure Channel..." before the composer unlocks.
*   **Message Decryption:** When opening the app fresh, displaying a rapid, localized "Decrypting Local Vault..." progress bar (even if it takes milliseconds) to reassure the user of the security model.
