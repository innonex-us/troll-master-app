use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::Engine;
use rand::RngCore;
use std::path::Path;

const SERVICE: &str = "jarveeauto";
const KEY_ACCOUNT: &str = "storage-state-key";
const NONCE_LEN: usize = 12;

fn get_or_create_key() -> Vec<u8> {
    let entry = keyring::Entry::new(SERVICE, KEY_ACCOUNT).expect("keyring entry");
    if let Ok(existing) = entry.get_password() {
        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(existing) {
            if bytes.len() == 32 {
                return bytes;
            }
        }
    }
    let mut key = vec![0u8; 32];
    OsRng.fill_bytes(&mut key);
    let encoded = base64::engine::general_purpose::STANDARD.encode(&key);
    entry.set_password(&encoded).expect("store key in keychain");
    key
}

fn cipher() -> Aes256Gcm {
    let key_bytes = get_or_create_key();
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    Aes256Gcm::new(key)
}

/// Encrypts `plain_path` into `enc_path` (nonce prefix + ciphertext), then removes the plaintext file.
pub fn encrypt_file(plain_path: &Path, enc_path: &Path) -> std::io::Result<()> {
    let plaintext = std::fs::read(plain_path)?;
    let cipher = cipher();
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;

    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);

    if let Some(parent) = enc_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(enc_path, out)?;
    std::fs::remove_file(plain_path)?;
    Ok(())
}

/// Decrypts `enc_path` into plaintext bytes at `out_path` for the sidecar to consume.
pub fn decrypt_to_file(enc_path: &Path, out_path: &Path) -> std::io::Result<()> {
    let data = std::fs::read(enc_path)?;
    if data.len() < NONCE_LEN {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "ciphertext too short"));
    }
    let (nonce_bytes, ciphertext) = data.split_at(NONCE_LEN);
    let nonce = Nonce::from_slice(nonce_bytes);
    let cipher = cipher();
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;

    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(out_path, plaintext)?;
    Ok(())
}
