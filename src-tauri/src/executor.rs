use serde_json::{json, Value};
use std::path::Path;

use crate::db::{Db, Profile, Proxy};
use crate::{crypto, ipc, storage};

fn proxy_json(proxy: &Option<Proxy>) -> Value {
    match proxy {
        Some(p) => json!({
            "protocol": p.protocol,
            "host": p.host,
            "port": p.port,
            "username": p.username,
            "password": p.password,
        }),
        None => Value::Null,
    }
}

fn fingerprint_json(profile: &Profile) -> Value {
    json!({
        "userAgent": profile.user_agent,
        "timezone": profile.timezone,
        "locale": profile.locale,
        "viewportWidth": profile.viewport_width,
        "viewportHeight": profile.viewport_height,
    })
}

fn load_proxy(db: &Db, profile: &Profile) -> Option<Proxy> {
    let Some(proxy_id) = &profile.proxy_id else {
        return None;
    };
    let conn = db.0.lock().unwrap();
    crate::db::list_proxies(&conn)
        .ok()
        .and_then(|proxies| proxies.into_iter().find(|p| &p.id == proxy_id))
}

/// Runs headed login capture for a profile, then encrypts the resulting session at rest.
pub async fn capture_login(
    db: &Db,
    app_data_dir: &Path,
    profile_id: &str,
) -> Result<(), String> {
    let profile = {
        let conn = db.0.lock().unwrap();
        crate::db::get_profile(&conn, profile_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "profile not found".to_string())?
    };
    let proxy = load_proxy(db, &profile);

    let tmp_path = storage::tmp_plain_path(app_data_dir, profile_id);
    if let Some(parent) = tmp_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let client = ipc::client().await;
    let result = client
        .call(
            "profile.loginCapture",
            json!({
                "profileId": profile_id,
                "platform": profile.platform,
                "proxy": proxy_json(&proxy),
                "fingerprint": fingerprint_json(&profile),
                "storageStatePlainPath": tmp_path.to_string_lossy(),
            }),
        )
        .await?;

    let status = result.get("status").and_then(|v| v.as_str()).unwrap_or("error");
    if status != "success" {
        let message = result
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("login capture failed")
            .to_string();
        if status == "banned" {
            let conn = db.0.lock().unwrap();
            let _ = crate::db::set_profile_status(&conn, profile_id, "banned");
        }
        return Err(message);
    }

    let enc_path = storage::enc_path(app_data_dir, profile_id);
    crypto::encrypt_file(&tmp_path, &enc_path).map_err(|e| e.to_string())?;

    let conn = db.0.lock().unwrap();
    crate::db::set_profile_storage_state_path(&conn, profile_id, Some(&enc_path.to_string_lossy()))
        .map_err(|e| e.to_string())?;
    crate::db::set_profile_status(&conn, profile_id, "active").map_err(|e| e.to_string())?;
    crate::db::set_profile_activated_now(&conn, profile_id).map_err(|e| e.to_string())?;

    Ok(())
}

pub struct ActionOutcome {
    pub status: String,
    pub message: String,
}

/// Runs a single automated action (follow/unfollow/like/comment) for a profile against a target.
pub async fn run_action(
    db: &Db,
    app_data_dir: &Path,
    profile: &Profile,
    action_type: &str,
    target: &str,
    comment_pool: &[String],
) -> ActionOutcome {
    let enc_path = match &profile.storage_state_enc_path {
        Some(p) => Path::new(p).to_path_buf(),
        None => {
            return ActionOutcome {
                status: "error".to_string(),
                message: "profile has no captured login session".to_string(),
            }
        }
    };

    let tmp_path = storage::tmp_plain_path(app_data_dir, &profile.id);
    if let Err(e) = crypto::decrypt_to_file(&enc_path, &tmp_path) {
        return ActionOutcome {
            status: "error".to_string(),
            message: format!("failed to decrypt session: {e}"),
        };
    }

    let proxy = load_proxy(db, profile);

    let client = ipc::client().await;
    let call_result = client
        .call(
            "action.run",
            json!({
                "profileId": profile.id,
                "platform": profile.platform,
                "actionType": action_type,
                "target": target,
                "proxy": proxy_json(&proxy),
                "fingerprint": fingerprint_json(profile),
                "storageStatePlainPath": tmp_path.to_string_lossy(),
                "commentPool": comment_pool,
            }),
        )
        .await;

    // re-encrypt whatever storage state exists at tmp_path (updated or not) and drop the plaintext
    if tmp_path.exists() {
        let _ = crypto::encrypt_file(&tmp_path, &enc_path);
    }

    match call_result {
        Ok(value) => ActionOutcome {
            status: value
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("error")
                .to_string(),
            message: value
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        },
        Err(e) => ActionOutcome {
            status: "error".to_string(),
            message: e,
        },
    }
}
