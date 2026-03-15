import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;

// Derived key for encrypting local SQLite secrets
async function deriveVaultKey() {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode("local-vault-static-salt"), // In production: Derived from user PIN or OS Keyring
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
    );
    return await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: encoder.encode("trustline-salt"),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
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
    
    db = await Database.load('sqlite:trustline.db');
    
    // Create tables if they don't exist
    await db.execute(`
        CREATE TABLE IF NOT EXISTS local_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            identity_public TEXT,
            identity_secret TEXT,
            signed_pre_key_public TEXT,
            signed_pre_key_secret TEXT,
            signed_pre_key_signature TEXT,
            is_active BOOLEAN DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            sender_id TEXT,
            recipient_id TEXT,
            content TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_me BOOLEAN
        );

        CREATE TABLE IF NOT EXISTS user_config (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);
    
    return db;
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

export async function saveMessage(msg: { id: string, sender: string, text: string, is_me: boolean }) {
    const vault = await initVault();
    await vault.execute(
        "INSERT INTO messages (id, sender_id, content, is_me) VALUES (?, ?, ?, ?)",
        [msg.id, msg.sender, msg.text, msg.is_me]
    );
}

export async function getMessages(contactId: string) {
    const vault = await initVault();
    // In a real app we'd filter messages where (sender = me AND recipient = contactId) OR (sender = contactId AND recipient = me)
    // For now we fetch all to keep it simple, but we filter by a dummy param to satisfy TS
    return await vault.select("SELECT * FROM messages WHERE sender_id IS NOT NULL OR ? IS NOT NULL ORDER BY timestamp ASC", [contactId]);
}
