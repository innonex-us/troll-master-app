use serde_json::{json, Value};
use std::path::Path;

use crate::db::{Db, Profile, Proxy};
use crate::state::AppState;
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

/// Encrypts the plaintext session at `tmp_path` at rest and marks the profile active.
/// Shared by every path that produces a fresh session: manual capture, auto-login, cookie import.
fn finalize_login(state: &AppState, profile_id: &str, tmp_path: &Path) -> Result<(), String> {
    let enc_path = storage::enc_path(&state.app_data_dir, profile_id);
    crypto::encrypt_file(tmp_path, &enc_path).map_err(|e| e.to_string())?;

    let conn = state.db.0.lock().unwrap();
    crate::db::set_profile_storage_state_path(&conn, profile_id, Some(&enc_path.to_string_lossy()))
        .map_err(|e| e.to_string())?;
    crate::db::set_profile_status(&conn, profile_id, "active").map_err(|e| e.to_string())?;
    crate::db::set_profile_activated_now(&conn, profile_id).map_err(|e| e.to_string())?;
    Ok(())
}

/// Runs headed login capture for a profile, then encrypts the resulting session at rest.
pub async fn capture_login(state: &AppState, profile_id: &str) -> Result<(), String> {
    let profile = {
        let conn = state.db.0.lock().unwrap();
        crate::db::get_profile(&conn, profile_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "profile not found".to_string())?
    };
    let proxy = load_proxy(&state.db, &profile);

    let tmp_path = storage::tmp_plain_path(&state.app_data_dir, profile_id);
    if let Some(parent) = tmp_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let client = ipc::client(&state.sidecar_exe, &state.sidecar_script).await;
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
            let conn = state.db.0.lock().unwrap();
            let _ = crate::db::set_profile_status(&conn, profile_id, "banned");
        }
        return Err(message);
    }

    finalize_login(state, profile_id, &tmp_path)
}

/// Same as `capture_login`, but fills the stored username/password automatically
/// instead of waiting for the user to type them. Still headed, so 2FA/captcha/
/// unexpected verification steps can still be finished by hand if they come up.
pub async fn auto_login(state: &AppState, profile_id: &str) -> Result<(), String> {
    let profile = {
        let conn = state.db.0.lock().unwrap();
        crate::db::get_profile(&conn, profile_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "profile not found".to_string())?
    };

    let password_enc = {
        let conn = state.db.0.lock().unwrap();
        crate::db::get_login_password_enc(&conn, profile_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "no password stored for this profile".to_string())?
    };
    let password = crypto::decrypt_string(&password_enc)?;

    let proxy = load_proxy(&state.db, &profile);

    let tmp_path = storage::tmp_plain_path(&state.app_data_dir, profile_id);
    if let Some(parent) = tmp_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let client = ipc::client(&state.sidecar_exe, &state.sidecar_script).await;
    let result = client
        .call(
            "profile.autoLogin",
            json!({
                "profileId": profile_id,
                "platform": profile.platform,
                "username": profile.username,
                "password": password,
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
            .unwrap_or("auto login failed")
            .to_string();
        if status == "banned" {
            let conn = state.db.0.lock().unwrap();
            let _ = crate::db::set_profile_status(&conn, profile_id, "banned");
        }
        return Err(message);
    }

    finalize_login(state, profile_id, &tmp_path)
}

/// Builds a Playwright-shaped storageState directly from pasted cookies — no browser
/// launch needed. Lets a user reuse a session exported from their real browser instead
/// of logging in fresh (useful when a fresh login would itself look suspicious to the platform).
pub async fn import_cookies(state: &AppState, profile_id: &str, cookies_json: &str) -> Result<(), String> {
    let cookies: Value = serde_json::from_str(cookies_json).map_err(|e| format!("invalid cookie JSON: {e}"))?;
    if !cookies.is_array() {
        return Err("expected a JSON array of cookie objects".to_string());
    }

    let storage_state = json!({ "cookies": cookies, "origins": [] });

    let tmp_path = storage::tmp_plain_path(&state.app_data_dir, profile_id);
    if let Some(parent) = tmp_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&tmp_path, serde_json::to_vec(&storage_state).unwrap()).map_err(|e| e.to_string())?;

    finalize_login(state, profile_id, &tmp_path)
}

/// Uses a profile's already-logged-in session to scrape fresh targets (post/tweet URLs for
/// hashtag sources, usernames for followers-of sources) to top up a rule's target queue.
pub async fn scrape_targets(
    state: &AppState,
    profile: &Profile,
    source_type: &str,
    seed: &str,
    limit: i64,
    skip_no_avatar: bool,
) -> Result<Vec<String>, String> {
    let enc_path = match &profile.storage_state_enc_path {
        Some(p) => Path::new(p).to_path_buf(),
        None => return Err("profile has no captured login session".to_string()),
    };

    let tmp_path = storage::tmp_plain_path(&state.app_data_dir, &profile.id);
    crypto::decrypt_to_file(&enc_path, &tmp_path).map_err(|e| e.to_string())?;

    let proxy = load_proxy(&state.db, profile);
    let client = ipc::client(&state.sidecar_exe, &state.sidecar_script).await;
    let call_result = client
        .call(
            "targets.scrape",
            json!({
                "profileId": profile.id,
                "platform": profile.platform,
                "sourceType": source_type,
                "seed": seed,
                "limit": limit,
                "skipNoAvatar": skip_no_avatar,
                "proxy": proxy_json(&proxy),
                "fingerprint": fingerprint_json(profile),
                "storageStatePlainPath": tmp_path.to_string_lossy(),
            }),
        )
        .await;

    if tmp_path.exists() {
        let _ = crypto::encrypt_file(&tmp_path, &enc_path);
    }

    let value = call_result?;
    let status = value.get("status").and_then(|v| v.as_str()).unwrap_or("error");
    if status != "success" {
        let message = value
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("scrape failed")
            .to_string();
        return Err(message);
    }

    let targets = value
        .get("targets")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();
    Ok(targets)
}

/// Scrapes engagement metrics for a monitored post/tweet using a viewer profile's
/// logged-in session. Metric extraction is best-effort — see the sidecar's
/// platform monitor modules for the heuristics and their known fragility.
pub async fn scrape_post_metrics(
    state: &AppState,
    viewer_profile: &Profile,
    url: &str,
) -> Result<crate::db::PostMetrics, String> {
    let enc_path = match &viewer_profile.storage_state_enc_path {
        Some(p) => Path::new(p).to_path_buf(),
        None => return Err("viewer profile has no captured login session".to_string()),
    };

    let tmp_path = storage::tmp_plain_path(&state.app_data_dir, &viewer_profile.id);
    crypto::decrypt_to_file(&enc_path, &tmp_path).map_err(|e| e.to_string())?;

    let proxy = load_proxy(&state.db, viewer_profile);
    let client = ipc::client(&state.sidecar_exe, &state.sidecar_script).await;
    let call_result = client
        .call(
            "monitor.scrapeMetrics",
            json!({
                "platform": viewer_profile.platform,
                "url": url,
                "proxy": proxy_json(&proxy),
                "fingerprint": fingerprint_json(viewer_profile),
                "storageStatePlainPath": tmp_path.to_string_lossy(),
            }),
        )
        .await;

    if tmp_path.exists() {
        let _ = crypto::encrypt_file(&tmp_path, &enc_path);
    }

    let value = call_result?;
    let status = value.get("status").and_then(|v| v.as_str()).unwrap_or("error");
    if status != "success" {
        let message = value.get("message").and_then(|v| v.as_str()).unwrap_or("scrape failed").to_string();
        return Err(message);
    }

    let metrics = value.get("metrics").cloned().unwrap_or(Value::Null);
    serde_json::from_value(metrics).map_err(|e| e.to_string())
}

pub struct ActionOutcome {
    pub status: String,
    pub message: String,
}

/// Runs a single automated action (follow/unfollow/like/comment) for a profile against a target.
pub async fn run_action(
    state: &AppState,
    profile: &Profile,
    action_type: &str,
    target: &str,
    comment_pool: &[String],
    dm_message: &str,
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

    let tmp_path = storage::tmp_plain_path(&state.app_data_dir, &profile.id);
    if let Err(e) = crypto::decrypt_to_file(&enc_path, &tmp_path) {
        return ActionOutcome {
            status: "error".to_string(),
            message: format!("failed to decrypt session: {e}"),
        };
    }

    let proxy = load_proxy(&state.db, profile);

    let client = ipc::client(&state.sidecar_exe, &state.sidecar_script).await;
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
                "dmMessage": dm_message,
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
