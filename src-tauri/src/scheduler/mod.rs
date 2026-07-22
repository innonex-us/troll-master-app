use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use rand::Rng;
use tauri::{AppHandle, Emitter};

use crate::state::AppState;
use crate::{db, executor};

const TICK_INTERVAL: Duration = Duration::from_secs(60);

const BACKOFF_BASE_SECS: i64 = 300; // 5 min
const BACKOFF_CAP_SECS: i64 = 6 * 3600; // 6 hours

/// New accounts get a fraction of their configured daily_limit, ramping up over
/// two weeks, to avoid tripping ban-rate heuristics on freshly-activated profiles.
fn warmup_multiplier(days_active: i64) -> f64 {
    match days_active {
        0 => 0.15,
        1..=2 => 0.35,
        3..=6 => 0.6,
        7..=13 => 0.85,
        _ => 1.0,
    }
}

fn effective_daily_limit(rule: &db::ActionRule, profile: &db::Profile) -> i64 {
    let days_active = profile
        .activated_at
        .as_deref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|t| (Utc::now() - t.with_timezone(&Utc)).num_days())
        .unwrap_or(999);
    let multiplier = warmup_multiplier(days_active);
    ((rule.daily_limit as f64 * multiplier).floor() as i64).max(1)
}

pub fn spawn(app_handle: AppHandle, state: Arc<AppState>) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(TICK_INTERVAL);
        loop {
            interval.tick().await;
            tick(&app_handle, &state).await;
        }
    });
}

async fn tick(app_handle: &AppHandle, state: &Arc<AppState>) {
    let rules = {
        let conn = state.db.0.lock().unwrap();
        match db::list_enabled_rules(&conn) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[scheduler] failed to list rules: {e}");
                return;
            }
        }
    };

    for rule in rules {
        if let Some(backoff_until) = &rule.backoff_until {
            if let Ok(t) = chrono::DateTime::parse_from_rfc3339(backoff_until) {
                if Utc::now() < t.with_timezone(&Utc) {
                    continue;
                }
            }
        }

        if rule.target_source.is_empty() {
            continue;
        }

        let profile = {
            let conn = state.db.0.lock().unwrap();
            match db::get_profile(&conn, &rule.profile_id) {
                Ok(Some(p)) => p,
                _ => continue,
            }
        };

        if profile.status != "active" {
            continue;
        }

        let (count_today, last_at) = {
            let conn = state.db.0.lock().unwrap();
            let count = db::count_today(&conn, &profile.id, &rule.action_type).unwrap_or(0);
            let last = db::last_executed_at(&conn, &profile.id, &rule.action_type).unwrap_or(None);
            (count, last)
        };

        if count_today >= effective_daily_limit(&rule, &profile) {
            continue;
        }

        if let Some(last_at) = &last_at {
            let elapsed = match chrono::DateTime::parse_from_rfc3339(last_at) {
                Ok(t) => (Utc::now() - t.with_timezone(&Utc)).num_seconds(),
                Err(_) => i64::MAX,
            };

            if elapsed < rule.min_delay_sec {
                continue;
            }

            let window = (rule.max_delay_sec - rule.min_delay_sec).max(1) as f64;
            let probability = (TICK_INTERVAL.as_secs() as f64 / window).min(1.0);
            if rand::thread_rng().gen::<f64>() > probability {
                continue;
            }
        }

        let cursor = (rule.target_cursor as usize) % rule.target_source.len();
        let target = rule.target_source[cursor].clone();

        let outcome = executor::run_action(
            &state.db,
            &state.app_data_dir,
            &profile,
            &rule.action_type,
            &target,
            &rule.comment_pool,
        )
        .await;

        {
            let conn = state.db.0.lock().unwrap();
            let _ = db::insert_log(
                &conn,
                &profile.id,
                &rule.action_type,
                &target,
                &outcome.status,
                Some(&outcome.message),
            );
            let _ = db::advance_cursor(&conn, &rule.id, rule.target_source.len() as i64);

            match outcome.status.as_str() {
                "success" | "skipped" => {
                    let _ = db::record_rule_success(&conn, &rule.id);
                }
                "error" => {
                    let exponent = rule.consecutive_errors.clamp(0, 6);
                    let backoff_secs = (BACKOFF_BASE_SECS * (1i64 << exponent)).min(BACKOFF_CAP_SECS);
                    let backoff_until = (Utc::now() + chrono::Duration::seconds(backoff_secs)).to_rfc3339();
                    let _ = db::record_rule_error(&conn, &rule.id, &backoff_until);
                }
                "challenged" | "banned" => {
                    let _ = db::set_profile_status(&conn, &profile.id, &outcome.status);
                }
                _ => {}
            }
        }

        let _ = app_handle.emit(
            "action-log",
            serde_json::json!({
                "profileId": profile.id,
                "actionType": rule.action_type,
                "target": target,
                "status": outcome.status,
                "message": outcome.message,
            }),
        );
    }
}
