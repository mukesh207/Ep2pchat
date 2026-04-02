use keyring::Entry;

const SERVICE: &str = "in.encryptedchat.desktop";
const ACCOUNT: &str = "trustline-vault-passphrase";
const KEY_LEN: usize = 32;

/// Returns 64-char lowercase hex = 256-bit key.
/// Callers must pass to SQLCipher as: PRAGMA key = "x'<returned_value>'"
#[tauri::command]
pub fn get_or_create_vault_key(_app: tauri::AppHandle) -> Result<String, String> {
    let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;

    // Try to fetch existing key
    match entry.get_password() {
        Ok(existing_key) => {
            // Validate it looks like what we stored (hex, correct length)
            if existing_key.len() == KEY_LEN * 2
                && existing_key.chars().all(|c| c.is_ascii_hexdigit())
            {
                return Ok(existing_key);
            }
            // Key is malformed — regenerate (shouldn't happen in practice)
            Err("Keychain entry malformed — please re-register your device".into())
        }

        Err(keyring_error) => {
            // Check if it's genuinely "not found" vs an actual error
            let err_str = keyring_error.to_string().to_lowercase();
            let is_not_found = err_str.contains("not found")
                || err_str.contains("no such item")
                || err_str.contains("no entry")
                || err_str.contains("the specified item could not be found");

            if !is_not_found {
                // Real keychain error
                #[cfg(target_os = "linux")]
                {
                    let daemon_missing = err_str.contains("no such interface")
                        || err_str.contains("org.freedesktop.secrets")
                        || err_str.contains("could not connect");

                    if daemon_missing && std::env::var("TRUSTLINE_DEMO_MODE").is_ok() {
                        let machine_id = std::fs::read_to_string("/etc/machine-id")
                            .unwrap_or_else(|_| "demo-fallback".into());
                        let raw =
                            sodiumoxide::crypto::hash::sha256::hash(machine_id.trim().as_bytes());
                        return Ok(hex::encode(raw.0));
                    }
                    return Err(format!("Secret service unavailable: {}", keyring_error));
                }
                #[cfg(not(target_os = "linux"))]
                return Err(format!("Keychain access failed: {}", keyring_error));
            }

            // First run — generate a fresh random key
            sodiumoxide::init().map_err(|_| "sodiumoxide init failed")?;
            let raw = sodiumoxide::randombytes::randombytes(KEY_LEN);
            let hex_key = hex::encode(&raw);

            entry
                .set_password(&hex_key)
                .map_err(|e| format!("Failed to store key in keychain: {}", e))?;

            Ok(hex_key)
        }
    }
}

#[tauri::command]
pub fn verify_vault_key_accessible(_app: tauri::AppHandle) -> Result<bool, String> {
    get_or_create_vault_key(_app).map(|_| true)
}
