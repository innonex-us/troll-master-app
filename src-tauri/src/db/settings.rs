use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

fn get_raw(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM app_settings WHERE key = ?1", params![key], |row| row.get(0))
        .optional()
        .ok()
        .flatten()
}

fn set_raw(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_int(conn: &Connection, key: &str, default: i64) -> i64 {
    get_raw(conn, key).and_then(|v| v.parse().ok()).unwrap_or(default)
}

pub fn get_bool(conn: &Connection, key: &str, default: bool) -> bool {
    get_raw(conn, key).map(|v| v == "true").unwrap_or(default)
}

/// The full settings bundle exposed to (and editable from) the Settings page.
#[derive(Serialize, Deserialize, Clone)]
pub struct AppSettings {
    /// Scheduler poll interval. Read once at app startup — changing it takes
    /// effect after restart, since it's baked into the running timer.
    pub scheduler_tick_secs: i64,
    /// How often a monitored post's engagement is re-scraped. Applied live.
    pub monitor_refresh_mins: i64,
    /// Backoff curve after a rule/campaign errors: base delay and hard cap. Applied live.
    pub backoff_base_mins: i64,
    pub backoff_cap_hours: i64,
    /// Whether new profiles ramp up daily limits gradually over ~2 weeks. Applied live.
    pub warmup_enabled: bool,
    /// Per-profile cap on un-returned follows (followed, not following back, not yet
    /// unfollowed). While a profile is at/over this, its `follow` rules pause until
    /// unfollow rules drain the backlog. `0` = unlimited. Applied live.
    pub max_pending_follows: i64,
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            scheduler_tick_secs: 60,
            monitor_refresh_mins: 30,
            backoff_base_mins: 5,
            backoff_cap_hours: 6,
            warmup_enabled: true,
            max_pending_follows: 0,
        }
    }
}

pub fn get_settings(conn: &Connection) -> AppSettings {
    let d = AppSettings::default();
    AppSettings {
        scheduler_tick_secs: get_int(conn, "scheduler_tick_secs", d.scheduler_tick_secs),
        monitor_refresh_mins: get_int(conn, "monitor_refresh_mins", d.monitor_refresh_mins),
        backoff_base_mins: get_int(conn, "backoff_base_mins", d.backoff_base_mins),
        backoff_cap_hours: get_int(conn, "backoff_cap_hours", d.backoff_cap_hours),
        warmup_enabled: get_bool(conn, "warmup_enabled", d.warmup_enabled),
        max_pending_follows: get_int(conn, "max_pending_follows", d.max_pending_follows),
    }
}

pub fn save_settings(conn: &Connection, s: &AppSettings) -> rusqlite::Result<()> {
    set_raw(conn, "scheduler_tick_secs", &s.scheduler_tick_secs.to_string())?;
    set_raw(conn, "monitor_refresh_mins", &s.monitor_refresh_mins.to_string())?;
    set_raw(conn, "backoff_base_mins", &s.backoff_base_mins.to_string())?;
    set_raw(conn, "backoff_cap_hours", &s.backoff_cap_hours.to_string())?;
    set_raw(conn, "warmup_enabled", if s.warmup_enabled { "true" } else { "false" })?;
    set_raw(conn, "max_pending_follows", &s.max_pending_follows.to_string())?;
    Ok(())
}

/// Deletes action_log rows older than `days`. Returns how many were removed.
pub fn clear_old_logs(conn: &Connection, days: i64) -> rusqlite::Result<usize> {
    let cutoff = (chrono::Utc::now() - chrono::Duration::days(days)).to_rfc3339();
    conn.execute("DELETE FROM action_log WHERE executed_at < ?1", params![cutoff])
}
