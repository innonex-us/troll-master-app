use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rand::rngs::OsRng;
use std::path::{Path, PathBuf};

/// This is a local lock screen, not a hard security boundary: it deters casual
/// access to an unattended window. The real secret (the session-storage
/// encryption key) always lives in the OS keychain, independent of this.
fn master_hash_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("master.hash")
}

pub fn has_master_password(app_data_dir: &Path) -> bool {
    master_hash_path(app_data_dir).exists()
}

pub fn set_master_password(app_data_dir: &Path, password: &str) -> Result<(), String> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| e.to_string())?
        .to_string();
    std::fs::write(master_hash_path(app_data_dir), hash).map_err(|e| e.to_string())
}

pub fn verify_master_password(app_data_dir: &Path, password: &str) -> Result<bool, String> {
    let stored = std::fs::read_to_string(master_hash_path(app_data_dir)).map_err(|e| e.to_string())?;
    let parsed = PasswordHash::new(&stored).map_err(|e| e.to_string())?;
    Ok(Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok())
}
