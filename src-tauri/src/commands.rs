use std::sync::Arc;
use tauri::State;

use crate::state::AppState;
use crate::{db, executor, fingerprint};

#[tauri::command]
pub async fn list_profiles_cmd(state: State<'_, Arc<AppState>>) -> Result<Vec<db::Profile>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_profiles(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_profile_cmd(
    state: State<'_, Arc<AppState>>,
    new_profile: db::NewProfile,
) -> Result<db::Profile, String> {
    let fp = fingerprint::generate();
    let conn = state.db.0.lock().unwrap();
    db::insert_profile(&conn, &new_profile, &fp).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_profile_cmd(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::delete_profile(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_profile_proxy_cmd(
    state: State<'_, Arc<AppState>>,
    id: String,
    proxy_id: Option<String>,
) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::set_profile_proxy(&conn, &id, proxy_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn capture_login_cmd(
    state: State<'_, Arc<AppState>>,
    profile_id: String,
) -> Result<(), String> {
    executor::capture_login(&state.db, &state.app_data_dir, &profile_id).await
}

#[tauri::command]
pub async fn list_proxies_cmd(state: State<'_, Arc<AppState>>) -> Result<Vec<db::Proxy>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_proxies(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_proxy_cmd(
    state: State<'_, Arc<AppState>>,
    new_proxy: db::NewProxy,
) -> Result<db::Proxy, String> {
    let conn = state.db.0.lock().unwrap();
    db::insert_proxy(&conn, &new_proxy).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_proxy_cmd(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::delete_proxy(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_rules_cmd(
    state: State<'_, Arc<AppState>>,
    profile_id: String,
) -> Result<Vec<db::ActionRule>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_rules_for_profile(&conn, &profile_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_rule_cmd(
    state: State<'_, Arc<AppState>>,
    new_rule: db::NewActionRule,
) -> Result<db::ActionRule, String> {
    let conn = state.db.0.lock().unwrap();
    db::insert_rule(&conn, &new_rule).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_rule_enabled_cmd(
    state: State<'_, Arc<AppState>>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::set_rule_enabled(&conn, &id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_rule_cmd(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::delete_rule(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_logs_cmd(
    state: State<'_, Arc<AppState>>,
    limit: i64,
) -> Result<Vec<db::ActionLogEntry>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_recent_logs(&conn, limit).map_err(|e| e.to_string())
}
