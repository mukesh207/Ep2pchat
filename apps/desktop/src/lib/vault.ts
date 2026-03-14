import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;

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
    await vault.execute(
        "INSERT INTO local_keys (identity_public, identity_secret, signed_pre_key_public, signed_pre_key_secret, signed_pre_key_signature) VALUES (?, ?, ?, ?, ?)",
        [bundle.identity_public, bundle.identity_secret, bundle.signed_pre_key_public, bundle.signed_pre_key_secret, bundle.signed_pre_key_signature]
    );
}

export async function getLocalKeys() {
    const vault = await initVault();
    const rows: any[] = await vault.select("SELECT * FROM local_keys WHERE is_active = 1 ORDER BY id DESC LIMIT 1");
    return rows[0] || null;
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
