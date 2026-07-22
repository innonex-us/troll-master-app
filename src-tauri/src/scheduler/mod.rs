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

fn effective_daily_limit(daily_limit: i64, profile: &db::Profile) -> i64 {
    let days_active = profile
        .activated_at
        .as_deref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|t| (Utc::now() - t.with_timezone(&Utc)).num_days())
        .unwrap_or(999);
    let multiplier = warmup_multiplier(days_active);
    ((daily_limit as f64 * multiplier).floor() as i64).max(1)
}

fn still_in_backoff(backoff_until: &Option<String>) -> bool {
    backoff_until
        .as_deref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|t| Utc::now() < t.with_timezone(&Utc))
        .unwrap_or(false)
}

/// Given when this (profile, action_type) last ran, decides whether this tick should
/// attempt another run: hard-gates on min_delay_sec, then rolls dice scaled so the
/// expected fire time is spread uniformly across [min_delay_sec, max_delay_sec].
fn delay_gate_passes(last_at: &Option<String>, min_delay_sec: i64, max_delay_sec: i64) -> bool {
    let Some(last_at) = last_at else { return true };
    let elapsed = match chrono::DateTime::parse_from_rfc3339(last_at) {
        Ok(t) => (Utc::now() - t.with_timezone(&Utc)).num_seconds(),
        Err(_) => return true,
    };
    if elapsed < min_delay_sec {
        return false;
    }
    let window = (max_delay_sec - min_delay_sec).max(1) as f64;
    let probability = (TICK_INTERVAL.as_secs() as f64 / window).min(1.0);
    rand::thread_rng().gen::<f64>() <= probability
}

fn next_backoff_until(consecutive_errors: i64) -> String {
    let exponent = consecutive_errors.clamp(0, 6);
    let backoff_secs = (BACKOFF_BASE_SECS * (1i64 << exponent)).min(BACKOFF_CAP_SECS);
    (Utc::now() + chrono::Duration::seconds(backoff_secs)).to_rfc3339()
}

/// Records follow/unfollow outcomes into follow_history regardless of whether the
/// action came from a standalone rule or a campaign, so "non-follow-backs" sourcing
/// works the same either way.
fn track_follow_history(conn: &rusqlite::Connection, profile: &db::Profile, action_type: &str, target: &str, outcome: &executor::ActionOutcome) {
    if action_type == "follow" && outcome.status == "success" {
        let _ = db::record_follow(conn, &profile.id, &profile.platform, target);
    }
    if action_type == "unfollow" {
        if outcome.message.contains("now follows back") {
            let _ = db::mark_following_back(conn, &profile.id, target);
        } else if outcome.status == "success" {
            let _ = db::mark_unfollowed(conn, &profile.id, target);
        }
    }
}

const MONITOR_REFRESH_INTERVAL_SECS: i64 = 30 * 60; // don't re-scrape a post more than every 30 min

pub fn spawn(app_handle: AppHandle, state: Arc<AppState>) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(TICK_INTERVAL);
        loop {
            interval.tick().await;
            tick_standalone_rules(&app_handle, &state).await;
            tick_campaigns(&app_handle, &state).await;
            tick_monitoring(&state).await;
        }
    });
}

/// Auto-refills a target queue in place for hashtag/followers_of/non_followbacks
/// sources once it runs low. Explicit lists are user-managed and never touched.
async fn refill_targets_if_low(
    state: &Arc<AppState>,
    profile: &db::Profile,
    profile_id: &str,
    source_type: &str,
    source_seed: &str,
    filter_skip_no_avatar: bool,
    target_source: &mut Vec<String>,
    append: impl Fn(&rusqlite::Connection, &[String]) -> rusqlite::Result<()>,
) {
    if target_source.len() >= 10 {
        return;
    }

    let new_targets = if source_type == "non_followbacks" {
        let days_threshold: i64 = source_seed.trim().parse().unwrap_or(3);
        let conn = state.db.0.lock().unwrap();
        db::list_due_non_followbacks(&conn, profile_id, days_threshold).unwrap_or_default()
    } else if source_type != "explicit" && !source_seed.is_empty() {
        executor::scrape_targets(state, profile, source_type, source_seed, 30, filter_skip_no_avatar)
            .await
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    if !new_targets.is_empty() {
        let conn = state.db.0.lock().unwrap();
        let _ = append(&conn, &new_targets);
        drop(conn);
        for t in new_targets {
            if !target_source.contains(&t) {
                target_source.push(t);
            }
        }
    }
}

async fn tick_standalone_rules(app_handle: &AppHandle, state: &Arc<AppState>) {
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

    for mut rule in rules {
        if still_in_backoff(&rule.backoff_until) {
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

        let rule_id = rule.id.clone();
        refill_targets_if_low(
            state,
            &profile,
            &rule.profile_id,
            &rule.source_type,
            &rule.source_seed,
            rule.filter_skip_no_avatar,
            &mut rule.target_source,
            |conn, new_targets| db::append_targets(conn, &rule_id, new_targets),
        )
        .await;

        if rule.target_source.is_empty() {
            continue;
        }

        let (count_today, last_at) = {
            let conn = state.db.0.lock().unwrap();
            let count = db::count_today(&conn, &profile.id, &rule.action_type).unwrap_or(0);
            let last = db::last_executed_at(&conn, &profile.id, &rule.action_type).unwrap_or(None);
            (count, last)
        };

        if count_today >= effective_daily_limit(rule.daily_limit, &profile) {
            continue;
        }
        if !delay_gate_passes(&last_at, rule.min_delay_sec, rule.max_delay_sec) {
            continue;
        }

        let cursor = (rule.target_cursor as usize) % rule.target_source.len();
        let target = rule.target_source[cursor].clone();

        let blacklisted = {
            let conn = state.db.0.lock().unwrap();
            db::is_blacklisted(&conn, &profile.id, &target).unwrap_or(false)
        };

        let outcome = if blacklisted {
            executor::ActionOutcome {
                status: "skipped".to_string(),
                message: "target is blacklisted".to_string(),
            }
        } else {
            executor::run_action(state, &profile, &rule.action_type, &target, &rule.comment_pool, &rule.dm_message).await
        };

        {
            let conn = state.db.0.lock().unwrap();
            let _ = db::insert_log(&conn, &profile.id, &rule.action_type, &target, &outcome.status, Some(&outcome.message));
            let _ = db::advance_cursor(&conn, &rule.id, rule.target_source.len() as i64);

            match outcome.status.as_str() {
                "success" | "skipped" => {
                    let _ = db::record_rule_success(&conn, &rule.id);
                }
                "error" => {
                    let backoff_until = next_backoff_until(rule.consecutive_errors);
                    let _ = db::record_rule_error(&conn, &rule.id, &backoff_until);
                }
                "challenged" | "banned" => {
                    let _ = db::set_profile_status(&conn, &profile.id, &outcome.status);
                }
                _ => {}
            }

            track_follow_history(&conn, &profile, &rule.action_type, &target, &outcome);
        }

        let _ = app_handle.emit(
            "action-log",
            serde_json::json!({
                "profileId": profile.id, "actionType": rule.action_type, "target": target,
                "status": outcome.status, "message": outcome.message,
            }),
        );
    }
}

async fn tick_campaigns(app_handle: &AppHandle, state: &Arc<AppState>) {
    let active = {
        let conn = state.db.0.lock().unwrap();
        match db::list_active_campaign_states(&conn) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[scheduler] failed to list active campaign states: {e}");
                return;
            }
        }
    };

    for (rule, cstate) in active {
        if still_in_backoff(&cstate.backoff_until) {
            continue;
        }

        let profile = {
            let conn = state.db.0.lock().unwrap();
            match db::get_profile(&conn, &cstate.profile_id) {
                Ok(Some(p)) => p,
                _ => continue,
            }
        };
        if profile.status != "active" {
            continue;
        }

        // each enrolled profile independently walks its own copy of the shared target
        // list; refilling appends to the campaign_rule's shared list (visible to all
        // enrolled profiles), not to any one profile's private copy.
        let mut target_source = rule.target_source.clone();
        let rule_id = rule.id.clone();
        refill_targets_if_low(
            state,
            &profile,
            &cstate.profile_id,
            &rule.source_type,
            &rule.source_seed,
            rule.filter_skip_no_avatar,
            &mut target_source,
            |conn, new_targets| db::append_targets_to_campaign_rule(conn, &rule_id, new_targets),
        )
        .await;

        if target_source.is_empty() {
            continue;
        }

        let (count_today, last_at) = {
            let conn = state.db.0.lock().unwrap();
            let count = db::count_today(&conn, &profile.id, &rule.action_type).unwrap_or(0);
            let last = db::last_executed_at(&conn, &profile.id, &rule.action_type).unwrap_or(None);
            (count, last)
        };

        if count_today >= effective_daily_limit(rule.daily_limit, &profile) {
            continue;
        }
        if !delay_gate_passes(&last_at, rule.min_delay_sec, rule.max_delay_sec) {
            continue;
        }

        let cursor = (cstate.target_cursor as usize) % target_source.len();
        let target = target_source[cursor].clone();

        let blacklisted = {
            let conn = state.db.0.lock().unwrap();
            db::is_blacklisted(&conn, &profile.id, &target).unwrap_or(false)
        };

        let outcome = if blacklisted {
            executor::ActionOutcome {
                status: "skipped".to_string(),
                message: "target is blacklisted".to_string(),
            }
        } else {
            executor::run_action(state, &profile, &rule.action_type, &target, &rule.comment_pool, &rule.dm_message).await
        };

        {
            let conn = state.db.0.lock().unwrap();
            let _ = db::insert_log(&conn, &profile.id, &rule.action_type, &target, &outcome.status, Some(&outcome.message));
            let _ = db::advance_state_cursor(&conn, &cstate.id, target_source.len() as i64);

            match outcome.status.as_str() {
                "success" | "skipped" => {
                    let _ = db::record_state_success(&conn, &cstate.id);
                }
                "error" => {
                    let backoff_until = next_backoff_until(cstate.consecutive_errors);
                    let _ = db::record_state_error(&conn, &cstate.id, &backoff_until);
                }
                "challenged" | "banned" => {
                    let _ = db::set_profile_status(&conn, &profile.id, &outcome.status);
                }
                _ => {}
            }

            track_follow_history(&conn, &profile, &rule.action_type, &target, &outcome);
        }

        let _ = app_handle.emit(
            "action-log",
            serde_json::json!({
                "profileId": profile.id, "actionType": rule.action_type, "target": target,
                "status": outcome.status, "message": outcome.message,
            }),
        );
    }
}

async fn tick_monitoring(state: &Arc<AppState>) {
    let posts = {
        let conn = state.db.0.lock().unwrap();
        match db::list_monitored_posts(&conn) {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[scheduler] failed to list monitored posts: {e}");
                return;
            }
        }
    };

    for post in posts {
        let due = {
            let conn = state.db.0.lock().unwrap();
            match db::latest_snapshot_at(&conn, &post.id) {
                Ok(Some(last)) => match chrono::DateTime::parse_from_rfc3339(&last) {
                    Ok(t) => (Utc::now() - t.with_timezone(&Utc)).num_seconds() >= MONITOR_REFRESH_INTERVAL_SECS,
                    Err(_) => true,
                },
                Ok(None) => true,
                Err(_) => false,
            }
        };
        if !due {
            continue;
        }

        let viewer = {
            let conn = state.db.0.lock().unwrap();
            match db::get_profile(&conn, &post.viewer_profile_id) {
                Ok(Some(p)) if p.status == "active" => p,
                _ => continue,
            }
        };

        match executor::scrape_post_metrics(state, &viewer, &post.url).await {
            Ok(metrics) => {
                let conn = state.db.0.lock().unwrap();
                let _ = db::insert_snapshot(&conn, &post.id, &metrics);
            }
            Err(e) => eprintln!("[scheduler] monitor scrape failed for {}: {e}", post.url),
        }
    }
}
