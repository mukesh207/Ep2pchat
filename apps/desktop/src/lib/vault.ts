import Database from '@tauri-apps/plugin-sql';
import { invoke } from "@tauri-apps/api/core";

export async function migrateLocalStorageKeyToKeychain(): Promise<void> {
    // Legacy migration kept as a no-op to preserve API compatibility.
}

let db: Database | null = null;
let dbInitPromise: Promise<Database> | null = null;
let cachedVaultSecret: string | null = null;

function describeError(error: unknown): string {
    if (typeof error === "string") return error;
    if (error && typeof error === "object") {
        const maybeError = error as { message?: unknown; error?: unknown };
        if (typeof maybeError.message === "string" && maybeError.message.trim()) return maybeError.message;
        if (typeof maybeError.error === "string" && maybeError.error.trim()) return maybeError.error;
    }
    try {
        return JSON.stringify(error);
    } catch {
        return String(error ?? "unknown error");
    }
}

export async function getVaultPassphrase(): Promise<string> {
    if (cachedVaultSecret) return cachedVaultSecret;
    cachedVaultSecret = await invoke<string>("get_or_create_vault_key");
    return cachedVaultSecret;
}

// Keep older function signature for backwards compatibility with column level encryption below
async function getVaultSecret(): Promise<string> {
    return await getVaultPassphrase();
}

// Derive a unique local encryption key per installation instead of using static constants.
async function deriveVaultKey() {
    const secret = await getVaultSecret();
    const secretBytes = hexToBuffer(secret);
    return await crypto.subtle.importKey(
        "raw",
        secretBytes,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

function hexToBuffer(hex: string) {
    const buf = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        buf[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return buf;
}

function bufferToBase64(buf: Uint8Array) {
    let bin = "";
    for (let i = 0; i < buf.byteLength; i++) {
        bin += String.fromCharCode(buf[i]);
    }
    return btoa(bin);
}

function base64ToBuffer(b64: string) {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        buf[i] = bin.charCodeAt(i);
    }
    return buf;
}

async function encryptSecret(text: string): Promise<string> {
    const key = await deriveVaultKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return bufferToBase64(combined);
}

async function decryptSecret(base64Str: string): Promise<string> {
    const key = await deriveVaultKey();
    const combined = base64ToBuffer(base64Str);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
}

export async function initVault() {
    if (db) return db;
    if (dbInitPromise) return dbInitPromise;

    dbInitPromise = (async () => {
        let passphrase = "";
        try {
            passphrase = await getVaultPassphrase();
        } catch (e: unknown) {
            throw new Error("[vault] Keychain access failed: " + describeError(e));
        }

        // Pass directly to SQLCipher — never store it anywhere in JS
        const openedDb = await Database.load("sqlite:trustline.db");
        try {
            await openedDb.execute(`PRAGMA key = "x'${passphrase}'"`);
            await openedDb.execute("PRAGMA cipher_page_size = 4096");
            await openedDb.select("SELECT count(*) FROM sqlite_master");
        } catch (e: unknown) {
            throw new Error("[vault] Vault decrypt failed: " + describeError(e));
        }

        const schemaStatements = [
            `CREATE TABLE IF NOT EXISTS local_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                identity_public TEXT,
                identity_secret TEXT,
                signed_pre_key_public TEXT,
                signed_pre_key_secret TEXT,
                signed_pre_key_signature TEXT,
                is_active BOOLEAN DEFAULT 1
            )`,
            `CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                temp_id TEXT,
                conversation_id TEXT,
                sender_id TEXT,
                recipient_id TEXT,
                parent_id TEXT,
                content TEXT,
                metadata TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_me BOOLEAN,
                message_status TEXT DEFAULT 'sent'
            )`,
            `CREATE TABLE IF NOT EXISTS message_events (
                id TEXT PRIMARY KEY,
                target_msg_id TEXT,
                event_type TEXT,
                payload TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS user_config (
                key TEXT PRIMARY KEY,
                value TEXT
            )`,
            `CREATE TABLE IF NOT EXISTS ratchet_sessions (
                conversation_id TEXT PRIMARY KEY,
                session_json    TEXT NOT NULL,
                updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS otpk_private_keys (
                key_id          TEXT    PRIMARY KEY,
                private_key_b64 TEXT    NOT NULL,
                created_at      TEXT    NOT NULL,
                consumed        INTEGER NOT NULL DEFAULT 0,
                consumed_at     TEXT
            )`,
            `CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                content,
                content='messages',
                content_rowid='rowid'
            )`,
            `CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
                INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
            END`,
            `CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
                INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
            END`,
            `CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
                INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
                INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
            END`,
        ];

        for (const statement of schemaStatements) {
            await openedDb.execute(statement);
        }

        try { await openedDb.execute("ALTER TABLE messages ADD COLUMN temp_id TEXT"); } catch {}
        try { await openedDb.execute("ALTER TABLE messages ADD COLUMN conversation_id TEXT"); } catch {}
        try { await openedDb.execute("ALTER TABLE messages ADD COLUMN message_status TEXT DEFAULT 'sent'"); } catch {}
        try { await openedDb.execute("ALTER TABLE messages ADD COLUMN parent_id TEXT"); } catch {}
        try { await openedDb.execute("ALTER TABLE messages ADD COLUMN metadata TEXT"); } catch {}

        try {
            // One-time backfill if FTS index is empty but messages exist (upgrade scenario)
            const rows = await openedDb.select<{count: number}[]>("SELECT count(*) as count FROM messages_fts");
            if (rows[0] && rows[0].count === 0) {
                await openedDb.execute("INSERT INTO messages_fts(rowid, content) SELECT rowid, content FROM messages;");
            }
        } catch (e) {
            console.warn("[vault] Migration backfill for FTS failed", e);
        }

        db = openedDb;
        return openedDb;
    })();

    try {
        return await dbInitPromise;
    } finally {
        dbInitPromise = null;
    }
}

export async function saveLocalKeys(bundle: any) {
    const vault = await initVault();
    const encIkSecret = await encryptSecret(bundle.identity_secret);
    const encSpkSecret = await encryptSecret(bundle.signed_pre_key_secret);
    
    await vault.execute(
        "INSERT INTO local_keys (identity_public, identity_secret, signed_pre_key_public, signed_pre_key_secret, signed_pre_key_signature) VALUES (?, ?, ?, ?, ?)",
        [bundle.identity_public, encIkSecret, bundle.signed_pre_key_public, encSpkSecret, bundle.signed_pre_key_signature]
    );
}

export async function getLocalKeys() {
    const vault = await initVault();
    const rows: any[] = await vault.select("SELECT * FROM local_keys WHERE is_active = 1 ORDER BY id DESC LIMIT 1");
    if (!rows[0]) return null;
    
    const row = rows[0];
    try {
        row.identity_secret = await decryptSecret(row.identity_secret);
        row.signed_pre_key_secret = await decryptSecret(row.signed_pre_key_secret);
    } catch (e) {
        console.error("Failed to decrypt local keys", e);
        return null;
    }
    
    return row;
}

export async function saveDeviceId(deviceId: string) {
    const vault = await initVault();
    await vault.execute(
        "INSERT INTO user_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        ["device_id", deviceId]
    );
}

export async function getDeviceId() {
    const vault = await initVault();
    const rows: Array<{ value: string }> = await vault.select(
        "SELECT value FROM user_config WHERE key = ? LIMIT 1",
        ["device_id"]
    );
    return rows[0]?.value ?? null;
}

export async function saveMessage(msg: {
    id: string,
    temp_id?: string | null,
    sender: string,
    text: string,
    is_me: boolean,
    conversation_id?: string | null,
    recipient_id?: string | null,
    timestamp?: string,
    message_status?: string,
    parent_id?: string | null,
    metadata?: any,
}) {
    const vault = await initVault();
    await vault.execute(
        `INSERT INTO messages (id, temp_id, conversation_id, sender_id, recipient_id, parent_id, content, metadata, timestamp, is_me, message_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            message_status = excluded.message_status,
            content = COALESCE(excluded.content, content),
            metadata = COALESCE(excluded.metadata, metadata)`,
        [
            msg.id,
            msg.temp_id ?? null,
            msg.conversation_id ?? null,
            msg.sender,
            msg.recipient_id ?? null,
            msg.parent_id || null,
            msg.text,
            msg.metadata ? JSON.stringify(msg.metadata) : null,
            msg.timestamp ?? new Date().toISOString(),
            msg.is_me ? 1 : 0,
            msg.message_status ?? (msg.is_me ? "sent" : "received"),
        ]
    );
}

/**
 * Imports message data into the vault.
 */
export async function importVaultData(data: any[]): Promise<void> {
    const vault = await initVault();
    await vault.execute("BEGIN");
    try {
        for (const m of data) {
            await saveMessage({
                id: m.id,
                temp_id: m.temp_id,
                sender: m.sender_id,
                text: m.content,
                is_me: m.is_me === 1 || m.is_me === true,
                conversation_id: m.conversation_id,
                recipient_id: m.recipient_id,
                timestamp: m.timestamp,
                message_status: m.message_status,
                parent_id: m.parent_id,
                metadata: m.metadata ? (typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata) : null
            });
        }
        await vault.execute("COMMIT");
    } catch (e) {
        await vault.execute("ROLLBACK");
        throw e;
    }
}

export async function reconcileTempMessageId(tempId: string, serverMessageId: string, timestamp?: string) {
    const vault = await initVault();
    await vault.execute(
        `UPDATE messages
         SET id = ?, temp_id = ?, message_status = 'sent', timestamp = COALESCE(?, timestamp)
         WHERE id = ? OR temp_id = ?`,
        [serverMessageId, tempId, timestamp ?? null, tempId, tempId],
    );
}

export async function updateMessageStatus(messageId: string, status: string) {
    const vault = await initVault();
    await vault.execute(
        "UPDATE messages SET message_status = ? WHERE id = ?",
        [status, messageId]
    );
}

export async function saveMessageEvent(ev: { id: string, target_msg_id: string, event_type: string, payload: any }) {
    const vault = await initVault();
    await vault.execute(
        `INSERT INTO message_events (id, target_msg_id, event_type, payload)
         VALUES (?, ?, ?, ?)`,
        [ev.id, ev.target_msg_id, ev.event_type, JSON.stringify(ev.payload)]
    );
}

export async function getMessages(contactId: string) {
    const vault = await initVault();
    const baseMessages = await vault.select<any[]>(
        `SELECT * FROM messages
         WHERE conversation_id = ? OR sender_id = ? OR recipient_id = ?
         ORDER BY timestamp ASC`,
        [contactId, contactId, contactId]
    );

    const events = await vault.select<any[]>(
        `SELECT e.* FROM message_events e
         JOIN messages m ON e.target_msg_id = m.id
         WHERE m.conversation_id = ? OR m.sender_id = ? OR m.recipient_id = ?
         ORDER BY e.timestamp ASC`,
        [contactId, contactId, contactId]
    );

    // Resolve final state
    return baseMessages.map(m => {
        const msg = { 
            id: m.id,
            sender: m.sender_id,
            text: m.content,
            timestamp: m.timestamp,
            is_me: m.is_me === 1 || m.is_me === true,
            status: m.message_status,
            parent_id: m.parent_id,
            reactions: [] as string[], 
            is_deleted: false,
            is_edited: false,
            metadata: {} as any
        };
        
        if (m.metadata) {
            try { msg.metadata = JSON.parse(m.metadata); } catch {}
        }

        const msgEvents = events.filter(e => e.target_msg_id === m.id);
        for (const e of msgEvents) {
            let payload: any = {};
            try { payload = JSON.parse(e.payload); } catch {}

            if (e.event_type === 'edit') {
                msg.text = payload.body;
                msg.is_edited = true;
            } else if (e.event_type === 'delete') {
                msg.is_deleted = true;
                msg.text = "This message was deleted";
            } else if (e.event_type === 'reaction') {
                msg.reactions.push(payload.emoji);
            }
        }
        return msg;
    });
}

export async function searchMessages(contactId: string, query: string) {
    const vault = await initVault();
    
    // SQLite FTS5 escaping: wrap the query in quotes and replace any internal double quotes
    // so that punctuation in the search query doesn't break the MATCH syntax.
    const ftsQuery = `"${query.replace(/"/g, '""')}"`;
    
    return await vault.select(
        `SELECT m.* FROM messages m
         JOIN messages_fts f ON m.rowid = f.rowid
         WHERE f.messages_fts MATCH ?
           AND (m.conversation_id = ? OR m.sender_id = ? OR m.recipient_id = ?)
         ORDER BY m.timestamp ASC`,
        [ftsQuery, contactId, contactId, contactId]
    );
}

// ── Double Ratchet session persistence ────────────────────────────────────────

/**
 * Load the Double Ratchet session JSON for a conversation.
 * Returns null if no session has been initialised yet.
 */
export async function getRatchetSession(conversationId: string): Promise<string | null> {
    const vault = await initVault();
    const rows: Array<{ session_json: string }> = await vault.select(
        "SELECT session_json FROM ratchet_sessions WHERE conversation_id = ? LIMIT 1",
        [conversationId]
    );
    return rows[0]?.session_json ?? null;
}

/**
 * Persist the updated Double Ratchet session JSON for a conversation.
 * MUST be called immediately after every ratchetEncrypt / ratchetDecrypt call.
 */
export async function saveRatchetSession(conversationId: string, sessionJson: string): Promise<void> {
    const vault = await initVault();
    await vault.execute(
        `INSERT INTO ratchet_sessions (conversation_id, session_json, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(conversation_id) DO UPDATE
           SET session_json = excluded.session_json,
               updated_at   = CURRENT_TIMESTAMP`,
        [conversationId, sessionJson]
    );
}

// ── OTPK private-key vault ─────────────────────────────────────────────────────

export interface OtpkPair {
    key_id:      string;
    private_key: number[]; // 32 bytes as a plain array from Rust
}

/**
 * Store a batch of OTPK private keys received from the Rust `check_and_replenish_otpks`
 * Tauri command. Uses INSERT OR IGNORE so duplicate key_ids are safe to call twice.
 */
export async function storeOtpkBatch(pairs: OtpkPair[]): Promise<void> {
    const vault = await initVault();
    await vault.execute("BEGIN");
    try {
        for (const pair of pairs) {
            const b64 = btoa(String.fromCharCode(...pair.private_key));
            await vault.execute(
                `INSERT OR IGNORE INTO otpk_private_keys
                     (key_id, private_key_b64, created_at, consumed)
                 VALUES (?, ?, datetime('now'), 0)`,
                [pair.key_id, b64]
            );
        }
        await vault.execute("COMMIT");
    } catch (e) {
        await vault.execute("ROLLBACK");
        throw e;
    }
}

/**
 * Atomically retrieve and mark a private key as consumed.
 * Returns the raw key bytes, or null if already consumed (replay protection)
 * or if the key_id is unknown.
 */
export async function consumeOtpkPrivateKey(
    keyId: string
): Promise<Uint8Array | null> {
    const vault = await initVault();
    const row = await vault.select<{ private_key_b64: string; consumed: number }[]>(
        "SELECT private_key_b64, consumed FROM otpk_private_keys WHERE key_id = ?",
        [keyId]
    );

    if (!row.length || row[0].consumed) return null;

    await vault.execute(
        "UPDATE otpk_private_keys SET consumed = 1, consumed_at = datetime('now') WHERE key_id = ?",
        [keyId]
    );

    return Uint8Array.from(atob(row[0].private_key_b64), c => c.charCodeAt(0));
}

/**
 * How many unconsumed OTPKs are available locally.
 * Used by the frontend to give users visibility into key health.
 */
export async function localOtpkCount(): Promise<number> {
    const vault = await initVault();
    const row = await vault.select<{ count: number }[]>(
        "SELECT COUNT(*) as count FROM otpk_private_keys WHERE consumed = 0"
    );
    return row[0]?.count ?? 0;
}

/**
 * Exports all messages from the local vault as a JSON object.
 */
export async function exportVaultData(): Promise<any[]> {
    const vault = await initVault();
    return vault.select<any[]>("SELECT * FROM messages ORDER BY timestamp ASC");
}
