mod auth;
mod backup;
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
use tauri::{Manager, State};

use crate::state::AppState;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn ping_sidecar(state: State<'_, Arc<AppState>>) -> Result<serde_json::Value, String> {
    let client = ipc::client(&state.sidecar_exe, &state.sidecar_script).await;
    client.call("ping", serde_json::json!({})).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be the first plugin registered. If the app is already running and
        // the user opens it again (double-clicks the app, or a second install of
        // a different version launches), this brings the existing window forward
        // instead of starting a second process — so only one version can ever be
        // actively running on a machine at a time.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("create app data dir");

            let db_path = app_data_dir.join("jarveeauto.sqlite3");
            let db = db::Db::open(&db_path).expect("open sqlite db");

            #[cfg(debug_assertions)]
            let (sidecar_exe, sidecar_script) = ipc::dev_sidecar_paths();
            #[cfg(not(debug_assertions))]
            let (sidecar_exe, sidecar_script) = {
                let resource_dir = app.path().resource_dir().expect("resolve resource dir");
                ipc::prod_sidecar_paths(&resource_dir)
            };

            let state = Arc::new(state::AppState {
                db,
                app_data_dir: app_data_dir.clone(),
                sidecar_exe,
                sidecar_script,
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
            commands::set_profile_enabled_cmd,
            commands::duplicate_profile_cmd,
            commands::set_profile_proxy_cmd,
            commands::capture_login_cmd,
            commands::list_proxies_cmd,
            commands::create_proxy_cmd,
            commands::delete_proxy_cmd,
            commands::list_rules_cmd,
            commands::create_rule_cmd,
            commands::set_rule_enabled_cmd,
            commands::delete_rule_cmd,
            commands::refill_rule_targets_cmd,
            commands::list_blacklist_cmd,
            commands::add_blacklist_entry_cmd,
            commands::remove_blacklist_entry_cmd,
            commands::list_logs_cmd,
            commands::list_profile_groups_cmd,
            commands::create_profile_group_cmd,
            commands::delete_profile_group_cmd,
            commands::set_profile_group_cmd,
            commands::list_campaigns_cmd,
            commands::create_campaign_cmd,
            commands::delete_campaign_cmd,
            commands::list_campaign_rules_cmd,
            commands::create_campaign_rule_cmd,
            commands::delete_campaign_rule_cmd,
            commands::set_campaign_enabled_cmd,
            commands::reset_campaign_cmd,
            commands::retry_failed_campaign_cmd,
            commands::list_enrolled_profiles_cmd,
            commands::enroll_profiles_cmd,
            commands::unenroll_profile_cmd,
            commands::list_campaign_rule_states_cmd,
            commands::list_monitored_posts_cmd,
            commands::create_monitored_post_cmd,
            commands::delete_monitored_post_cmd,
            commands::list_post_snapshots_cmd,
            commands::scrape_post_now_cmd,
            commands::get_settings_cmd,
            commands::save_settings_cmd,
            commands::clear_old_logs_cmd,
            commands::get_app_data_dir_cmd,
            commands::set_profile_device_name_cmd,
            commands::regenerate_device_id_cmd,
            commands::set_profile_password_cmd,
            commands::clear_profile_password_cmd,
            commands::auto_login_cmd,
            commands::import_cookies_cmd,
            commands::export_backup_cmd,
            commands::import_backup_cmd,
            commands::get_reply_rule_cmd,
            commands::upsert_reply_rule_cmd,
            commands::set_reply_rule_enabled_cmd,
            commands::delete_reply_rule_cmd,
            commands::list_dm_sequence_progress_cmd,
            commands::list_pods_cmd,
            commands::create_pod_cmd,
            commands::set_pod_enabled_cmd,
            commands::delete_pod_cmd,
            commands::list_pod_members_cmd,
            commands::add_pod_member_cmd,
            commands::remove_pod_member_cmd,
            commands::list_pod_posts_cmd,
            commands::list_pod_engagements_cmd,
            commands::has_master_password_cmd,
            commands::set_master_password_cmd,
            commands::verify_master_password_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
