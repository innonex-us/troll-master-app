use std::sync::Arc;
use serde::Serialize;
use tauri::State;

use crate::state::AppState;
use crate::{auth, backup, db, executor, fingerprint};

#[tauri::command]
pub async fn has_master_password_cmd(state: State<'_, Arc<AppState>>) -> Result<bool, String> {
    Ok(auth::has_master_password(&state.app_data_dir))
}

#[tauri::command]
pub async fn set_master_password_cmd(
    state: State<'_, Arc<AppState>>,
    password: String,
) -> Result<(), String> {
    auth::set_master_password(&state.app_data_dir, &password)
}

#[tauri::command]
pub async fn verify_master_password_cmd(
    state: State<'_, Arc<AppState>>,
    password: String,
) -> Result<bool, String> {
    auth::verify_master_password(&state.app_data_dir, &password)
}

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
pub async fn set_profile_enabled_cmd(
    state: State<'_, Arc<AppState>>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::set_profile_enabled(&conn, &id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn duplicate_profile_cmd(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<db::Profile, String> {
    let conn = state.db.0.lock().unwrap();
    db::duplicate_profile(&conn, &id).map_err(|e| e.to_string())
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
    executor::capture_login(&state, &profile_id).await
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
pub async fn refill_rule_targets_cmd(
    state: State<'_, Arc<AppState>>,
    rule_id: String,
) -> Result<usize, String> {
    let rule = {
        let conn = state.db.0.lock().unwrap();
        db::get_rule(&conn, &rule_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "rule not found".to_string())?
    };

    if rule.source_type == "explicit" {
        return Err("this rule uses an explicit target list; edit it directly instead".to_string());
    }

    let new_targets = if rule.source_type == "non_followbacks" {
        let days_threshold: i64 = rule.source_seed.trim().parse().unwrap_or(3);
        let conn = state.db.0.lock().unwrap();
        db::list_due_non_followbacks(&conn, &rule.profile_id, days_threshold).map_err(|e| e.to_string())?
    } else {
        let profile = {
            let conn = state.db.0.lock().unwrap();
            db::get_profile(&conn, &rule.profile_id)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "profile not found".to_string())?
        };
        executor::scrape_targets(
            &state,
            &profile,
            &rule.source_type,
            &rule.source_seed,
            30,
            rule.filter_skip_no_avatar,
        )
        .await?
    };

    let count = new_targets.len();
    let conn = state.db.0.lock().unwrap();
    db::append_targets(&conn, &rule_id, &new_targets).map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
pub async fn list_blacklist_cmd(state: State<'_, Arc<AppState>>) -> Result<Vec<db::BlacklistEntry>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_blacklist(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_blacklist_entry_cmd(
    state: State<'_, Arc<AppState>>,
    profile_id: Option<String>,
    username: String,
) -> Result<db::BlacklistEntry, String> {
    let conn = state.db.0.lock().unwrap();
    db::add_blacklist_entry(&conn, profile_id.as_deref(), &username).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_blacklist_entry_cmd(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::remove_blacklist_entry(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_logs_cmd(
    state: State<'_, Arc<AppState>>,
    limit: i64,
) -> Result<Vec<db::ActionLogEntry>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_recent_logs(&conn, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_profile_groups_cmd(state: State<'_, Arc<AppState>>) -> Result<Vec<db::ProfileGroup>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_groups(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_profile_group_cmd(
    state: State<'_, Arc<AppState>>,
    new_group: db::NewProfileGroup,
) -> Result<db::ProfileGroup, String> {
    let conn = state.db.0.lock().unwrap();
    db::insert_group(&conn, &new_group).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_profile_group_cmd(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::delete_group(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_profile_group_cmd(
    state: State<'_, Arc<AppState>>,
    id: String,
    group_id: Option<String>,
) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::set_profile_group(&conn, &id, group_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_campaigns_cmd(state: State<'_, Arc<AppState>>) -> Result<Vec<db::Campaign>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_campaigns(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_campaign_cmd(
    state: State<'_, Arc<AppState>>,
    new_campaign: db::NewCampaign,
) -> Result<db::Campaign, String> {
    let conn = state.db.0.lock().unwrap();
    db::insert_campaign(&conn, &new_campaign).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_campaign_cmd(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::delete_campaign(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_campaign_rules_cmd(
    state: State<'_, Arc<AppState>>,
    campaign_id: String,
) -> Result<Vec<db::CampaignRule>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_campaign_rules(&conn, &campaign_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_campaign_rule_cmd(
    state: State<'_, Arc<AppState>>,
    new_rule: db::NewCampaignRule,
) -> Result<db::CampaignRule, String> {
    let conn = state.db.0.lock().unwrap();
    db::insert_campaign_rule(&conn, &new_rule).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_campaign_rule_cmd(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::delete_campaign_rule(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_campaign_enabled_cmd(
    state: State<'_, Arc<AppState>>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::set_campaign_enabled(&conn, &id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reset_campaign_cmd(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::reset_campaign_state(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn retry_failed_campaign_cmd(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::retry_failed_campaign_state(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_enrolled_profiles_cmd(
    state: State<'_, Arc<AppState>>,
    campaign_id: String,
) -> Result<Vec<String>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_enrolled_profile_ids(&conn, &campaign_id).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct EnrollResult {
    pub enrolled: usize,
    pub skipped: Vec<String>,
}

#[tauri::command]
pub async fn enroll_profiles_cmd(
    state: State<'_, Arc<AppState>>,
    campaign_id: String,
    profile_ids: Vec<String>,
) -> Result<EnrollResult, String> {
    let conn = state.db.0.lock().unwrap();
    let templates = db::list_campaign_rules(&conn, &campaign_id).map_err(|e| e.to_string())?;

    let mut enrolled = 0usize;
    let mut skipped = Vec::new();

    for profile_id in &profile_ids {
        let Some(profile) = db::get_profile(&conn, profile_id).map_err(|e| e.to_string())? else {
            skipped.push(format!("{profile_id}: profile not found"));
            continue;
        };
        for tmpl in &templates {
            if !db::action_valid_for_platform(&tmpl.action_type, &profile.platform) {
                skipped.push(format!(
                    "{}: '{}' not supported on {}",
                    profile.display_name, tmpl.action_type, profile.platform
                ));
                continue;
            }
            db::enroll_profile_in_rule(&conn, &tmpl.id, profile_id).map_err(|e| e.to_string())?;
            enrolled += 1;
        }
    }

    Ok(EnrollResult { enrolled, skipped })
}

#[tauri::command]
pub async fn list_campaign_rule_states_cmd(
    state: State<'_, Arc<AppState>>,
    campaign_rule_id: String,
) -> Result<Vec<db::CampaignRuleState>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_states_for_rule(&conn, &campaign_rule_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn unenroll_profile_cmd(
    state: State<'_, Arc<AppState>>,
    campaign_id: String,
    profile_id: String,
) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    let templates = db::list_campaign_rules(&conn, &campaign_id).map_err(|e| e.to_string())?;
    for tmpl in &templates {
        db::unenroll_profile_from_rule(&conn, &tmpl.id, &profile_id).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn list_monitored_posts_cmd(state: State<'_, Arc<AppState>>) -> Result<Vec<db::MonitoredPost>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_monitored_posts(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_monitored_post_cmd(
    state: State<'_, Arc<AppState>>,
    new_post: db::NewMonitoredPost,
) -> Result<db::MonitoredPost, String> {
    let conn = state.db.0.lock().unwrap();
    db::insert_monitored_post(&conn, &new_post).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_monitored_post_cmd(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::delete_monitored_post(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_post_snapshots_cmd(
    state: State<'_, Arc<AppState>>,
    monitored_post_id: String,
    limit: i64,
) -> Result<Vec<db::MonitoredPostSnapshot>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_snapshots(&conn, &monitored_post_id, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn scrape_post_now_cmd(
    state: State<'_, Arc<AppState>>,
    monitored_post_id: String,
) -> Result<db::PostMetrics, String> {
    let post = {
        let conn = state.db.0.lock().unwrap();
        db::list_monitored_posts(&conn)
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|p| p.id == monitored_post_id)
            .ok_or_else(|| "monitored post not found".to_string())?
    };
    let viewer = {
        let conn = state.db.0.lock().unwrap();
        db::get_profile(&conn, &post.viewer_profile_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "viewer profile not found".to_string())?
    };

    let metrics = executor::scrape_post_metrics(&state, &viewer, &post.url).await?;
    let conn = state.db.0.lock().unwrap();
    db::insert_snapshot(&conn, &monitored_post_id, &metrics).map_err(|e| e.to_string())?;
    Ok(metrics)
}

#[tauri::command]
pub async fn get_settings_cmd(state: State<'_, Arc<AppState>>) -> Result<db::AppSettings, String> {
    let conn = state.db.0.lock().unwrap();
    Ok(db::get_settings(&conn))
}

#[tauri::command]
pub async fn save_settings_cmd(
    state: State<'_, Arc<AppState>>,
    settings: db::AppSettings,
) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::save_settings(&conn, &settings).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_old_logs_cmd(state: State<'_, Arc<AppState>>, days: i64) -> Result<usize, String> {
    let conn = state.db.0.lock().unwrap();
    db::clear_old_logs(&conn, days).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_app_data_dir_cmd(state: State<'_, Arc<AppState>>) -> Result<String, String> {
    Ok(state.app_data_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn set_profile_device_name_cmd(
    state: State<'_, Arc<AppState>>,
    id: String,
    device_name: String,
) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::set_profile_device_name(&conn, &id, &device_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn regenerate_device_id_cmd(state: State<'_, Arc<AppState>>, id: String) -> Result<String, String> {
    let conn = state.db.0.lock().unwrap();
    db::regenerate_device_id(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_profile_password_cmd(
    state: State<'_, Arc<AppState>>,
    id: String,
    password: String,
) -> Result<(), String> {
    let encrypted = crate::crypto::encrypt_string(&password)?;
    let conn = state.db.0.lock().unwrap();
    db::set_login_password_enc(&conn, &id, Some(&encrypted)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_profile_password_cmd(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::set_login_password_enc(&conn, &id, None).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn auto_login_cmd(state: State<'_, Arc<AppState>>, profile_id: String) -> Result<(), String> {
    executor::auto_login(&state, &profile_id).await
}

#[tauri::command]
pub async fn get_reply_rule_cmd(
    state: State<'_, Arc<AppState>>,
    monitored_post_id: String,
) -> Result<Option<db::CommentReplyRule>, String> {
    let conn = state.db.0.lock().unwrap();
    db::get_reply_rule(&conn, &monitored_post_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_reply_rule_cmd(
    state: State<'_, Arc<AppState>>,
    new_rule: db::NewCommentReplyRule,
) -> Result<db::CommentReplyRule, String> {
    let conn = state.db.0.lock().unwrap();
    db::upsert_reply_rule(&conn, &new_rule).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_reply_rule_enabled_cmd(
    state: State<'_, Arc<AppState>>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::set_reply_rule_enabled(&conn, &id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_reply_rule_cmd(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::delete_reply_rule(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_dm_sequence_progress_cmd(
    state: State<'_, Arc<AppState>>,
    rule_id: String,
) -> Result<Vec<db::DmSequenceProgress>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_progress_for_rule(&conn, &rule_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_pods_cmd(state: State<'_, Arc<AppState>>) -> Result<Vec<db::Pod>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_pods(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_pod_cmd(state: State<'_, Arc<AppState>>, new_pod: db::NewPod) -> Result<db::Pod, String> {
    let conn = state.db.0.lock().unwrap();
    db::insert_pod(&conn, &new_pod).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_pod_enabled_cmd(state: State<'_, Arc<AppState>>, id: String, enabled: bool) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::set_pod_enabled(&conn, &id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_pod_cmd(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::delete_pod(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_pod_members_cmd(
    state: State<'_, Arc<AppState>>,
    pod_id: String,
) -> Result<Vec<db::PodMember>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_pod_members(&conn, &pod_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_pod_member_cmd(
    state: State<'_, Arc<AppState>>,
    pod_id: String,
    profile_id: String,
) -> Result<db::PodMember, String> {
    let conn = state.db.0.lock().unwrap();
    db::add_pod_member(&conn, &pod_id, &profile_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_pod_member_cmd(
    state: State<'_, Arc<AppState>>,
    pod_id: String,
    profile_id: String,
) -> Result<(), String> {
    let conn = state.db.0.lock().unwrap();
    db::remove_pod_member(&conn, &pod_id, &profile_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_pod_posts_cmd(
    state: State<'_, Arc<AppState>>,
    pod_id: String,
    limit: i64,
) -> Result<Vec<db::PodPost>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_pod_posts(&conn, &pod_id, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_pod_engagements_cmd(
    state: State<'_, Arc<AppState>>,
    pod_post_id: String,
) -> Result<Vec<db::PodEngagement>, String> {
    let conn = state.db.0.lock().unwrap();
    db::list_engagements_for_post(&conn, &pod_post_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_cookies_cmd(
    state: State<'_, Arc<AppState>>,
    profile_id: String,
    cookies_json: String,
) -> Result<(), String> {
    executor::import_cookies(&state, &profile_id, &cookies_json).await
}

#[tauri::command]
pub async fn export_backup_cmd(state: State<'_, Arc<AppState>>, path: String) -> Result<(), String> {
    let bundle = {
        let conn = state.db.0.lock().unwrap();
        backup::export_bundle(&conn).map_err(|e| e.to_string())?
    };
    let json = serde_json::to_string_pretty(&bundle).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_backup_cmd(
    state: State<'_, Arc<AppState>>,
    path: String,
    include_settings: bool,
) -> Result<backup::ImportSummary, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let bundle: backup::BackupBundle = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut conn = state.db.0.lock().unwrap();
    backup::import_bundle(&mut conn, &bundle, include_settings).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_profiles_backup_cmd(state: State<'_, Arc<AppState>>, path: String) -> Result<(), String> {
    let bundle = {
        let conn = state.db.0.lock().unwrap();
        backup::export_profiles_bundle(&conn).map_err(|e| e.to_string())?
    };
    let json = serde_json::to_string_pretty(&bundle).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_profiles_backup_cmd(
    state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<backup::ProfilesImportSummary, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let bundle: backup::ProfilesBundle = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut conn = state.db.0.lock().unwrap();
    backup::import_profiles_bundle(&mut conn, &bundle).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_campaigns_backup_cmd(state: State<'_, Arc<AppState>>, path: String) -> Result<(), String> {
    let bundle = {
        let conn = state.db.0.lock().unwrap();
        backup::export_campaigns_bundle(&conn).map_err(|e| e.to_string())?
    };
    let json = serde_json::to_string_pretty(&bundle).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_campaigns_backup_cmd(
    state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<backup::CampaignsImportSummary, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let bundle: backup::CampaignsBundle = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut conn = state.db.0.lock().unwrap();
    backup::import_campaigns_bundle(&mut conn, &bundle).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_pods_backup_cmd(state: State<'_, Arc<AppState>>, path: String) -> Result<(), String> {
    let bundle = {
        let conn = state.db.0.lock().unwrap();
        backup::export_pods_bundle(&conn).map_err(|e| e.to_string())?
    };
    let json = serde_json::to_string_pretty(&bundle).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_pods_backup_cmd(
    state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<backup::PodsImportSummary, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let bundle: backup::PodsBundle = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut conn = state.db.0.lock().unwrap();
    backup::import_pods_bundle(&mut conn, &bundle).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_proxies_backup_cmd(state: State<'_, Arc<AppState>>, path: String) -> Result<(), String> {
    let bundle = {
        let conn = state.db.0.lock().unwrap();
        backup::export_proxies_bundle(&conn).map_err(|e| e.to_string())?
    };
    let json = serde_json::to_string_pretty(&bundle).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_proxies_backup_cmd(
    state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<backup::ProxiesImportSummary, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let bundle: backup::ProxiesBundle = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut conn = state.db.0.lock().unwrap();
    backup::import_proxies_bundle(&mut conn, &bundle).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_blacklist_backup_cmd(state: State<'_, Arc<AppState>>, path: String) -> Result<(), String> {
    let bundle = {
        let conn = state.db.0.lock().unwrap();
        backup::export_blacklist_bundle(&conn).map_err(|e| e.to_string())?
    };
    let json = serde_json::to_string_pretty(&bundle).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_blacklist_backup_cmd(
    state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<backup::BlacklistImportSummary, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let bundle: backup::BlacklistBundle = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut conn = state.db.0.lock().unwrap();
    backup::import_blacklist_bundle(&mut conn, &bundle).map_err(|e| e.to_string())
}
