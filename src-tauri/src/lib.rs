mod commands;
mod crypto;
mod db;
mod executor;
mod fingerprint;
mod ipc;
mod scheduler;
mod state;
mod storage;

use std::sync::Arc;
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn ping_sidecar() -> Result<serde_json::Value, String> {
    let client = ipc::client().await;
    client.call("ping", serde_json::json!({})).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("create app data dir");

            let db_path = app_data_dir.join("jarveeauto.sqlite3");
            let db = db::Db::open(&db_path).expect("open sqlite db");

            let state = Arc::new(state::AppState {
                db,
                app_data_dir: app_data_dir.clone(),
            });
            app.manage(state.clone());

            scheduler::spawn(app.handle().clone(), state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            ping_sidecar,
            commands::list_profiles_cmd,
            commands::create_profile_cmd,
            commands::delete_profile_cmd,
            commands::set_profile_proxy_cmd,
            commands::capture_login_cmd,
            commands::list_proxies_cmd,
            commands::create_proxy_cmd,
            commands::delete_proxy_cmd,
            commands::list_rules_cmd,
            commands::create_rule_cmd,
            commands::set_rule_enabled_cmd,
            commands::delete_rule_cmd,
            commands::list_logs_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
