use std::sync::Arc;
use std::time::Duration;

use chrono::{Datelike, Local, Timelike, Utc};
use rand::Rng;
use tauri::{AppHandle, Emitter};

use crate::state::AppState;
use crate::{db, executor};

/// New accounts get a fraction of their configured daily_limit, ramping up over
/// two weeks, to avoid tripping ban-rate heuristics on freshly-activated profiles.
/// Skipped entirely (always 1.0) when warmup is disabled in Settings.
fn warmup_multiplier(days_active: i64) -> f64 {
    match days_active {
        0 => 0.15,
        1..=2 => 0.35,
        3..=6 => 0.6,
        7..=13 => 0.85,
        _ => 1.0,
    }
}

fn effective_daily_limit(conn: &rusqlite::Connection, daily_limit: i64, profile: &db::Profile) -> i64 {
    if !db::get_bool(conn, "warmup_enabled", true) {
        return daily_limit.max(1);
    }
    let days_active = profile
        .activated_at
        .as_deref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|t| (Utc::now() - t.with_timezone(&Utc)).num_days())
        .unwrap_or(999);
    let multiplier = warmup_multiplier(days_active);
    ((daily_limit as f64 * multiplier).floor() as i64).max(1)
}

/// A rule's active window: it may run only when the machine-local hour is in
/// [start, end) (0..24 = always) and today's weekday is allowed (Mon=1..Sun=7).
/// Note: uses the machine's local time, not the profile's fingerprint timezone.
fn within_schedule(start: i64, end: i64, days: &[i64]) -> bool {
    let now = Local::now();
    let weekday = now.weekday().number_from_monday() as i64;
    if !days.is_empty() && !days.contains(&weekday) {
        return false;
    }
    if start == 0 && end >= 24 {
        return true;
    }
    let hour = now.hour() as i64;
    if start <= end {
        hour >= start && hour < end
    } else {
        // wrapped window (e.g. 22..6): active late-night into the morning
        hour >= start || hour < end
    }
}

/// True when the profile's un-returned-follow backlog is at/over the global cap
/// (`max_pending_follows`), meaning new `follow` actions should pause until
/// unfollow rules drain it. `0` = unlimited (never caps).
fn over_pending_follow_cap(state: &Arc<AppState>, profile_id: &str) -> bool {
    let conn = state.db.0.lock().unwrap();
    let cap = db::get_settings(&conn).max_pending_follows;
    cap > 0 && db::count_pending_follows(&conn, profile_id).unwrap_or(0) >= cap
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
fn delay_gate_passes(last_at: &Option<String>, min_delay_sec: i64, max_delay_sec: i64, tick_interval_secs: u64) -> bool {
    let Some(last_at) = last_at else { return true };
    let elapsed = match chrono::DateTime::parse_from_rfc3339(last_at) {
        Ok(t) => (Utc::now() - t.with_timezone(&Utc)).num_seconds(),
        Err(_) => return true,
    };
    if elapsed < min_delay_sec {
        return false;
    }
    let window = (max_delay_sec - min_delay_sec).max(1) as f64;
    let probability = (tick_interval_secs as f64 / window).min(1.0);
    rand::thread_rng().gen::<f64>() <= probability
}

fn next_backoff_until(conn: &rusqlite::Connection, consecutive_errors: i64) -> String {
    let settings = db::get_settings(conn);
    let base_secs = (settings.backoff_base_mins.max(1) * 60) as i64;
    let cap_secs = (settings.backoff_cap_hours.max(1) * 3600) as i64;
    let exponent = consecutive_errors.clamp(0, 6);
    let backoff_secs = (base_secs * (1i64 << exponent)).min(cap_secs);
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

pub fn spawn(app_handle: AppHandle, state: Arc<AppState>) {
    tauri::async_runtime::spawn(async move {
        // Read once at startup: the tick interval is baked into the running timer,
        // so a change in Settings takes effect after the next app restart.
        let tick_interval_secs = {
            let conn = state.db.0.lock().unwrap();
            db::get_settings(&conn).scheduler_tick_secs.max(5) as u64
        };

        let mut interval = tokio::time::interval(Duration::from_secs(tick_interval_secs));
        loop {
            interval.tick().await;
            tick_standalone_rules(&app_handle, &state, tick_interval_secs).await;
            tick_campaigns(&app_handle, &state, tick_interval_secs).await;
            tick_monitoring(&state).await;
            tick_comment_replies(&app_handle, &state, tick_interval_secs).await;
            tick_dm_sequences(&app_handle, &state, tick_interval_secs).await;
            tick_pods(&app_handle, &state, tick_interval_secs).await;
            tick_welcome_dms(&app_handle, &state, tick_interval_secs).await;
            tick_profile_stats(&state).await;
            tick_publisher(&app_handle, &state).await;
        }
    });
}

/// Publishes scheduled posts whose time has arrived. One post per tick keeps
/// concurrent browser sessions down; failures are recorded on the row.
async fn tick_publisher(app_handle: &AppHandle, state: &Arc<AppState>) {
    let due = {
        let conn = state.db.0.lock().unwrap();
        db::list_due_posts(&conn).unwrap_or_default()
    };

    let Some(post) = due.into_iter().next() else { return };

    let profile = {
        let conn = state.db.0.lock().unwrap();
        match db::get_profile(&conn, &post.profile_id) {
            Ok(Some(p)) if p.status == "active" && p.enabled => p,
            _ => {
                // profile unusable — fail the post so it doesn't retry forever
                let conn2 = state.db.0.lock().unwrap();
                let _ = db::mark_post_failed(&conn2, &post.id, "profile inactive/disabled/missing");
                return;
            }
        }
    };

    let outcome = executor::publish_post(state, &profile, &post.media_path, &post.caption).await;

    {
        let conn = state.db.0.lock().unwrap();
        let _ = db::insert_log(&conn, &profile.id, "publish", &post.caption, &outcome.status, Some(&outcome.message));
        match outcome.status.as_str() {
            "success" => {
                let _ = db::mark_post_posted(&conn, &post.id);
            }
            _ => {
                let _ = db::mark_post_failed(&conn, &post.id, &outcome.message);
                if outcome.status == "challenged" || outcome.status == "banned" {
                    let _ = db::set_profile_status(&conn, &profile.id, &outcome.status);
                }
            }
        }
    }

    let _ = app_handle.emit(
        "action-log",
        serde_json::json!({
            "profileId": profile.id, "actionType": "publish", "target": post.caption,
            "status": outcome.status, "message": outcome.message,
        }),
    );
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

async fn tick_standalone_rules(app_handle: &AppHandle, state: &Arc<AppState>, tick_interval_secs: u64) {
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
        if profile.status != "active" || !profile.enabled {
            continue;
        }
        if !within_schedule(rule.active_hours_start, rule.active_hours_end, &rule.active_days) {
            continue;
        }
        if rule.action_type == "follow" && over_pending_follow_cap(state, &profile.id) {
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

        let (count_today, last_at, daily_limit) = {
            let conn = state.db.0.lock().unwrap();
            let count = db::count_today(&conn, &profile.id, &rule.action_type).unwrap_or(0);
            let last = db::last_executed_at(&conn, &profile.id, &rule.action_type).unwrap_or(None);
            let limit = effective_daily_limit(&conn, rule.daily_limit, &profile);
            (count, last, limit)
        };

        if count_today >= daily_limit {
            continue;
        }
        if !delay_gate_passes(&last_at, rule.min_delay_sec, rule.max_delay_sec, tick_interval_secs) {
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
            executor::run_action(
                state,
                &profile,
                &rule.action_type,
                &target,
                &rule.comment_pool,
                &rule.dm_message,
                &rule.reaction_type,
            )
            .await
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
                    let backoff_until = next_backoff_until(&conn, rule.consecutive_errors);
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

async fn tick_campaigns(app_handle: &AppHandle, state: &Arc<AppState>, tick_interval_secs: u64) {
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
        if profile.status != "active" || !profile.enabled {
            continue;
        }
        if !within_schedule(rule.active_hours_start, rule.active_hours_end, &rule.active_days) {
            continue;
        }
        if rule.action_type == "follow" && over_pending_follow_cap(state, &profile.id) {
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

        let (count_today, last_at, daily_limit) = {
            let conn = state.db.0.lock().unwrap();
            let count = db::count_today(&conn, &profile.id, &rule.action_type).unwrap_or(0);
            let last = db::last_executed_at(&conn, &profile.id, &rule.action_type).unwrap_or(None);
            let limit = effective_daily_limit(&conn, rule.daily_limit, &profile);
            (count, last, limit)
        };

        if count_today >= daily_limit {
            continue;
        }
        if !delay_gate_passes(&last_at, rule.min_delay_sec, rule.max_delay_sec, tick_interval_secs) {
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
            executor::run_action(
                state,
                &profile,
                &rule.action_type,
                &target,
                &rule.comment_pool,
                &rule.dm_message,
                &rule.reaction_type,
            )
            .await
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
                    let backoff_until = next_backoff_until(&conn, cstate.consecutive_errors);
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
            let refresh_secs = db::get_settings(&conn).monitor_refresh_mins.max(1) * 60;
            match db::latest_snapshot_at(&conn, &post.id) {
                Ok(Some(last)) => match chrono::DateTime::parse_from_rfc3339(&last) {
                    Ok(t) => (Utc::now() - t.with_timezone(&Utc)).num_seconds() >= refresh_secs,
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
                Ok(Some(p)) if p.status == "active" && p.enabled => p,
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

/// Watches monitored posts flagged for auto-reply, re-scrapes their comments on the
/// same cadence as `tick_monitoring`, and replies to newly-seen comments — respecting
/// the reply rule's own daily limit/delay/backoff and the acting profile's blacklist,
/// exactly like a standalone action rule.
async fn tick_comment_replies(app_handle: &AppHandle, state: &Arc<AppState>, tick_interval_secs: u64) {
    let rules = {
        let conn = state.db.0.lock().unwrap();
        match db::list_enabled_reply_rules_with_posts(&conn) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[scheduler] failed to list comment-reply rules: {e}");
                return;
            }
        }
    };

    for (rule, post) in rules {
        if still_in_backoff(&rule.backoff_until) {
            continue;
        }

        let owner = {
            let conn = state.db.0.lock().unwrap();
            match db::get_profile(&conn, &post.viewer_profile_id) {
                Ok(Some(p)) if p.status == "active" && p.enabled => p,
                _ => continue,
            }
        };

        let due = {
            let conn = state.db.0.lock().unwrap();
            let refresh_secs = db::get_settings(&conn).monitor_refresh_mins.max(1) * 60;
            match &rule.last_checked_at {
                Some(last) => match chrono::DateTime::parse_from_rfc3339(last) {
                    Ok(t) => (Utc::now() - t.with_timezone(&Utc)).num_seconds() >= refresh_secs,
                    Err(_) => true,
                },
                None => true,
            }
        };

        if due {
            match executor::scrape_post_comments(state, &owner, &post.url).await {
                Ok(comments) => {
                    let conn = state.db.0.lock().unwrap();
                    for c in comments {
                        let _ = db::upsert_comment(&conn, &post.id, &c.id, &c.author, &c.text);
                    }
                    let _ = db::set_reply_rule_last_checked(&conn, &rule.id);
                }
                Err(e) => eprintln!("[scheduler] comment scrape failed for {}: {e}", post.url),
            }
        }

        let (count_today, last_at) = {
            let conn = state.db.0.lock().unwrap();
            let count = db::count_today(&conn, &owner.id, "reply_comment").unwrap_or(0);
            let last = db::last_executed_at(&conn, &owner.id, "reply_comment").unwrap_or(None);
            (count, last)
        };

        if count_today >= rule.daily_limit.max(1) {
            continue;
        }
        if !delay_gate_passes(&last_at, rule.min_delay_sec, rule.max_delay_sec, tick_interval_secs) {
            continue;
        }

        let comment = {
            let conn = state.db.0.lock().unwrap();
            match db::list_unreplied_comments(&conn, &post.id, 1) {
                Ok(mut v) if !v.is_empty() => v.remove(0),
                _ => continue,
            }
        };

        let blacklisted = {
            let conn = state.db.0.lock().unwrap();
            db::is_blacklisted(&conn, &owner.id, &comment.author).unwrap_or(false)
        };

        let target = format!("{}#c:{}", post.url, comment.platform_comment_id);

        let outcome = if blacklisted {
            executor::ActionOutcome {
                status: "skipped".to_string(),
                message: format!("commenter {} is blacklisted", comment.author),
            }
        } else {
            executor::run_action(state, &owner, "reply_comment", &target, &rule.reply_pool, "", "like").await
        };

        {
            let conn = state.db.0.lock().unwrap();
            let _ = db::insert_log(&conn, &owner.id, "reply_comment", &target, &outcome.status, Some(&outcome.message));
            let _ = db::mark_comment_replied(&conn, &comment.id);

            match outcome.status.as_str() {
                "success" | "skipped" => {
                    let _ = db::record_reply_rule_success(&conn, &rule.id);
                }
                "error" => {
                    let backoff_until = next_backoff_until(&conn, rule.consecutive_errors);
                    let _ = db::record_reply_rule_error(&conn, &rule.id, &backoff_until);
                }
                "challenged" | "banned" => {
                    let _ = db::set_profile_status(&conn, &owner.id, &outcome.status);
                }
                _ => {}
            }
        }

        let _ = app_handle.emit(
            "action-log",
            serde_json::json!({
                "profileId": owner.id, "actionType": "reply_comment", "target": target,
                "status": outcome.status, "message": outcome.message,
            }),
        );
    }
}

/// Drives multi-step DM sequences: enrolls every current target of a
/// `dm_sequence` rule at step 0, then — gated by the rule's own daily
/// limit/delay window exactly like a standalone rule — sends whichever
/// enrolled target's next step is due, advancing it or marking it complete.
/// The sidecar has no notion of "sequence" at all; each step is sent as a
/// plain `"dm"` action, so this reuses `executor::run_action` verbatim.
async fn tick_dm_sequences(app_handle: &AppHandle, state: &Arc<AppState>, tick_interval_secs: u64) {
    let rules = {
        let conn = state.db.0.lock().unwrap();
        match db::list_enabled_rules_by_action_type(&conn, "dm_sequence") {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[scheduler] failed to list dm_sequence rules: {e}");
                return;
            }
        }
    };

    for mut rule in rules {
        if still_in_backoff(&rule.backoff_until) {
            continue;
        }
        if rule.sequence_steps.is_empty() {
            continue;
        }

        let profile = {
            let conn = state.db.0.lock().unwrap();
            match db::get_profile(&conn, &rule.profile_id) {
                Ok(Some(p)) => p,
                _ => continue,
            }
        };
        if profile.status != "active" || !profile.enabled {
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

        {
            let conn = state.db.0.lock().unwrap();
            for target in &rule.target_source {
                let _ = db::enroll_target_if_new(&conn, &rule.id, target);
            }
        }

        let (count_today, last_at) = {
            let conn = state.db.0.lock().unwrap();
            let count = db::count_today(&conn, &profile.id, "dm_sequence").unwrap_or(0);
            let last = db::last_executed_at(&conn, &profile.id, "dm_sequence").unwrap_or(None);
            (count, last)
        };

        if count_today >= rule.daily_limit.max(1) {
            continue;
        }
        if !delay_gate_passes(&last_at, rule.min_delay_sec, rule.max_delay_sec, tick_interval_secs) {
            continue;
        }

        let progress = {
            let conn = state.db.0.lock().unwrap();
            match db::next_due(&conn, &rule.id) {
                Ok(Some(p)) => p,
                _ => continue,
            }
        };

        let Some(step) = rule.sequence_steps.get(progress.current_step as usize) else {
            let conn = state.db.0.lock().unwrap();
            let _ = db::complete(&conn, &progress.id);
            continue;
        };

        let blacklisted = {
            let conn = state.db.0.lock().unwrap();
            db::is_blacklisted(&conn, &profile.id, &progress.target).unwrap_or(false)
        };

        let outcome = if blacklisted {
            executor::ActionOutcome {
                status: "skipped".to_string(),
                message: "target is blacklisted".to_string(),
            }
        } else {
            executor::run_action(state, &profile, "dm", &progress.target, &[], &step.message, "like").await
        };

        {
            let conn = state.db.0.lock().unwrap();
            let _ = db::insert_log(&conn, &profile.id, "dm_sequence", &progress.target, &outcome.status, Some(&outcome.message));

            match outcome.status.as_str() {
                "success" | "skipped" => {
                    let next_idx = progress.current_step + 1;
                    match rule.sequence_steps.get(next_idx as usize) {
                        Some(next_step) => {
                            let next_send_at = (Utc::now()
                                + chrono::Duration::seconds((next_step.delay_hours * 3600.0) as i64))
                            .to_rfc3339();
                            let _ = db::advance_step(&conn, &progress.id, next_idx, &next_send_at);
                        }
                        None => {
                            let _ = db::complete(&conn, &progress.id);
                        }
                    }
                    let _ = db::record_rule_success(&conn, &rule.id);
                }
                "error" => {
                    let backoff_until = next_backoff_until(&conn, rule.consecutive_errors);
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
                "profileId": profile.id, "actionType": "dm_sequence", "target": progress.target,
                "status": outcome.status, "message": outcome.message,
            }),
        );
    }
}

/// Drives Engagement Pods: for each pod, auto-detects each enabled member's
/// newest own post (no manual per-post registration, unlike Monitor), then has
/// every *other* enabled member like/comment on it — gated by the pod's own
/// daily-limit-per-member/delay window and each acting profile's blacklist,
/// reusing the plain `"like"`/`"comment"` sidecar actions verbatim. Logged
/// under synthetic `"pod_like"`/`"pod_comment"` action types so pod activity
/// never counts against a profile's own standalone like/comment rules.
async fn tick_pods(app_handle: &AppHandle, state: &Arc<AppState>, tick_interval_secs: u64) {
    let pods = {
        let conn = state.db.0.lock().unwrap();
        match db::list_enabled_pods(&conn) {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[scheduler] failed to list pods: {e}");
                return;
            }
        }
    };

    for pod in pods {
        let members = {
            let conn = state.db.0.lock().unwrap();
            match db::list_enabled_members_for_pod(&conn, &pod.id) {
                Ok(m) => m,
                Err(e) => {
                    eprintln!("[scheduler] failed to list members for pod {}: {e}", pod.id);
                    continue;
                }
            }
        };
        if members.len() < 2 {
            continue;
        }

        let mut member_profiles: Vec<db::Profile> = Vec::new();
        for m in &members {
            let due = {
                let conn = state.db.0.lock().unwrap();
                let refresh_secs = db::get_settings(&conn).monitor_refresh_mins.max(1) * 60;
                match &m.last_checked_at {
                    Some(last) => match chrono::DateTime::parse_from_rfc3339(last) {
                        Ok(t) => (Utc::now() - t.with_timezone(&Utc)).num_seconds() >= refresh_secs,
                        Err(_) => true,
                    },
                    None => true,
                }
            };

            let profile = {
                let conn = state.db.0.lock().unwrap();
                match db::get_profile(&conn, &m.profile_id) {
                    Ok(Some(p)) if p.status == "active" && p.enabled => p,
                    _ => continue,
                }
            };

            if due {
                match executor::fetch_latest_own_post(state, &profile).await {
                    Ok(Some(url)) => {
                        let conn = state.db.0.lock().unwrap();
                        let _ = db::insert_pod_post_if_new(&conn, &pod.id, &profile.id, &url, pod.window_hours);
                        let _ = db::set_member_last_checked(&conn, &m.id);
                    }
                    Ok(None) => {
                        let conn = state.db.0.lock().unwrap();
                        let _ = db::set_member_last_checked(&conn, &m.id);
                    }
                    Err(e) => eprintln!("[scheduler] own-post scrape failed for {}: {e}", profile.display_name),
                }
            }

            member_profiles.push(profile);
        }

        let active_posts = {
            let conn = state.db.0.lock().unwrap();
            db::list_active_pod_posts(&conn, &pod.id).unwrap_or_default()
        };

        for post in &active_posts {
            for actor in &member_profiles {
                if actor.id == post.member_profile_id {
                    continue;
                }

                for action in &pod.actions {
                    let log_action_type = format!("pod_{action}");

                    let already_done = {
                        let conn = state.db.0.lock().unwrap();
                        db::engagement_exists(&conn, &post.id, &actor.id, &log_action_type).unwrap_or(false)
                    };
                    if already_done {
                        continue;
                    }

                    let (engagements_today, last_at) = {
                        let conn = state.db.0.lock().unwrap();
                        let count = db::count_pod_engagements_today(&conn, &pod.id, &actor.id).unwrap_or(0);
                        let last = db::last_executed_at(&conn, &actor.id, &log_action_type).unwrap_or(None);
                        (count, last)
                    };
                    if engagements_today >= pod.daily_limit_per_member.max(1) {
                        continue;
                    }
                    if !delay_gate_passes(&last_at, pod.min_delay_sec, pod.max_delay_sec, tick_interval_secs) {
                        continue;
                    }

                    let poster_username = {
                        let conn = state.db.0.lock().unwrap();
                        db::get_profile(&conn, &post.member_profile_id)
                            .ok()
                            .flatten()
                            .map(|p| p.username)
                            .unwrap_or_default()
                    };
                    let blacklisted = {
                        let conn = state.db.0.lock().unwrap();
                        db::is_blacklisted(&conn, &actor.id, &poster_username).unwrap_or(false)
                    };

                    let outcome = if blacklisted {
                        executor::ActionOutcome {
                            status: "skipped".to_string(),
                            message: format!("{poster_username} is blacklisted"),
                        }
                    } else {
                        executor::run_action(state, actor, action, &post.post_url, &pod.comment_pool, "", "like").await
                    };

                    {
                        let conn = state.db.0.lock().unwrap();
                        let _ = db::insert_log(&conn, &actor.id, &log_action_type, &post.post_url, &outcome.status, Some(&outcome.message));
                        let _ = db::record_engagement(&conn, &post.id, &actor.id, &log_action_type, &outcome.status);

                        if outcome.status == "challenged" || outcome.status == "banned" {
                            let _ = db::set_profile_status(&conn, &actor.id, &outcome.status);
                        }
                    }

                    let _ = app_handle.emit(
                        "action-log",
                        serde_json::json!({
                            "profileId": actor.id, "actionType": log_action_type, "target": post.post_url,
                            "status": outcome.status, "message": outcome.message,
                        }),
                    );
                }
            }
        }
    }
}

/// Snapshots each active profile's own follower/following/post counts about once
/// a day for the growth-analytics graphs. Skips profiles snapshotted in the last
/// ~20 hours so it settles to one sample per day regardless of tick interval.
async fn tick_profile_stats(state: &Arc<AppState>) {
    let profiles = {
        let conn = state.db.0.lock().unwrap();
        match db::list_profiles(&conn) {
            Ok(p) => p,
            Err(_) => return,
        }
    };

    for profile in profiles {
        if profile.status != "active" || !profile.enabled {
            continue;
        }
        let due = {
            let conn = state.db.0.lock().unwrap();
            match db::latest_stat_at(&conn, &profile.id) {
                Ok(Some(last)) => match chrono::DateTime::parse_from_rfc3339(&last) {
                    Ok(t) => (Utc::now() - t.with_timezone(&Utc)).num_hours() >= 20,
                    Err(_) => true,
                },
                Ok(None) => true,
                Err(_) => false,
            }
        };
        if !due {
            continue;
        }

        match executor::fetch_own_stats(state, &profile).await {
            Ok(stats) => {
                let conn = state.db.0.lock().unwrap();
                let _ = db::insert_stat(&conn, &profile.id, stats.followers, stats.following, stats.posts);
            }
            Err(e) => eprintln!("[scheduler] profile-stats scrape failed for {}: {e}", profile.username),
        }
    }
}

/// Auto-welcomes NEW followers with a DM. Periodically scrapes the profile's own
/// followers (reusing the followers-of scraper against the profile's own username),
/// records them, and DMs any that appear after the baseline seed pass — respecting
/// the config's daily limit, delay window, and the blacklist. The first scan only
/// seeds the baseline so pre-existing followers are never messaged.
async fn tick_welcome_dms(app_handle: &AppHandle, state: &Arc<AppState>, tick_interval_secs: u64) {
    let configs = {
        let conn = state.db.0.lock().unwrap();
        match db::list_enabled_welcome_configs(&conn) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[scheduler] failed to list welcome-dm configs: {e}");
                return;
            }
        }
    };

    for config in configs {
        let profile = {
            let conn = state.db.0.lock().unwrap();
            match db::get_profile(&conn, &config.profile_id) {
                Ok(Some(p)) if p.status == "active" && p.enabled => p,
                _ => continue,
            }
        };

        // Re-scrape own followers on the monitor cadence.
        let due = {
            let conn = state.db.0.lock().unwrap();
            let refresh_secs = db::get_settings(&conn).monitor_refresh_mins.max(1) * 60;
            match &config.last_scan_at {
                Some(last) => match chrono::DateTime::parse_from_rfc3339(last) {
                    Ok(t) => (Utc::now() - t.with_timezone(&Utc)).num_seconds() >= refresh_secs,
                    Err(_) => true,
                },
                None => true,
            }
        };

        if due {
            match executor::scrape_targets(state, &profile, "followers_of", &profile.username, 100, false).await {
                Ok(followers) => {
                    let conn = state.db.0.lock().unwrap();
                    // Before the baseline is seeded, everyone currently following is
                    // marked already-welcomed so they never get a DM.
                    let welcomed = !config.seeded;
                    for username in &followers {
                        let _ = db::upsert_known_follower(&conn, &profile.id, username, welcomed);
                    }
                    if !config.seeded {
                        let _ = db::mark_seeded(&conn, &profile.id);
                    }
                    let _ = db::set_last_scan(&conn, &profile.id);
                }
                Err(e) => eprintln!("[scheduler] welcome-dm follower scrape failed for {}: {e}", profile.username),
            }
        }

        // Only send once the baseline has been captured (seeded on a prior scan).
        let seeded_now = {
            let conn = state.db.0.lock().unwrap();
            db::get_welcome_dm_config(&conn, &profile.id).ok().flatten().map(|c| c.seeded).unwrap_or(false)
        };
        if !seeded_now {
            continue;
        }

        let (count_today, last_at) = {
            let conn = state.db.0.lock().unwrap();
            let count = db::count_today(&conn, &profile.id, "welcome_dm").unwrap_or(0);
            let last = db::last_executed_at(&conn, &profile.id, "welcome_dm").unwrap_or(None);
            (count, last)
        };
        if count_today >= config.daily_limit.max(1) {
            continue;
        }
        if !delay_gate_passes(&last_at, config.min_delay_sec, config.max_delay_sec, tick_interval_secs) {
            continue;
        }

        let target = {
            let conn = state.db.0.lock().unwrap();
            match db::list_unwelcomed(&conn, &profile.id, 1) {
                Ok(mut v) if !v.is_empty() => v.remove(0),
                _ => continue,
            }
        };

        let blacklisted = {
            let conn = state.db.0.lock().unwrap();
            db::is_blacklisted(&conn, &profile.id, &target).unwrap_or(false)
        };

        // Pick one message from the pool; the sidecar resolves any {spintax} in it.
        let message = if config.message_pool.is_empty() {
            "Hey {there|!} 👋 thanks for the follow!".to_string()
        } else {
            let idx = rand::thread_rng().gen_range(0..config.message_pool.len());
            config.message_pool[idx].clone()
        };

        let outcome = if blacklisted {
            executor::ActionOutcome {
                status: "skipped".to_string(),
                message: format!("{target} is blacklisted"),
            }
        } else {
            executor::run_action(state, &profile, "dm", &target, &[], &message, "like").await
        };

        {
            let conn = state.db.0.lock().unwrap();
            let _ = db::insert_log(&conn, &profile.id, "welcome_dm", &target, &outcome.status, Some(&outcome.message));
            let _ = db::mark_welcomed(&conn, &profile.id, &target);
            if outcome.status == "challenged" || outcome.status == "banned" {
                let _ = db::set_profile_status(&conn, &profile.id, &outcome.status);
            }
        }

        let _ = app_handle.emit(
            "action-log",
            serde_json::json!({
                "profileId": profile.id, "actionType": "welcome_dm", "target": target,
                "status": outcome.status, "message": outcome.message,
            }),
        );
    }
}
