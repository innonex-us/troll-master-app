use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct WelcomeDmConfig {
    pub profile_id: String,
    pub enabled: bool,
    pub message_pool: Vec<String>,
    pub daily_limit: i64,
    pub min_delay_sec: i64,
    pub max_delay_sec: i64,
    pub last_scan_at: Option<String>,
    /// Whether the baseline follower set has been captured yet. Until seeded, the
    /// first scan marks all current followers as already-welcomed so pre-existing
    /// followers never get a DM — only genuinely new ones do.
    pub seeded: bool,
}

#[derive(Deserialize)]
pub struct NewWelcomeDmConfig {
    pub profile_id: String,
    pub enabled: bool,
    #[serde(default)]
    pub message_pool: Vec<String>,
    pub daily_limit: i64,
    pub min_delay_sec: i64,
    pub max_delay_sec: i64,
}

fn row_to_config(row: &rusqlite::Row) -> rusqlite::Result<WelcomeDmConfig> {
    let message_pool: String = row.get("message_pool")?;
    Ok(WelcomeDmConfig {
        profile_id: row.get("profile_id")?,
        enabled: row.get::<_, i64>("enabled")? != 0,
        message_pool: serde_json::from_str(&message_pool).unwrap_or_default(),
        daily_limit: row.get("daily_limit")?,
        min_delay_sec: row.get("min_delay_sec")?,
        max_delay_sec: row.get("max_delay_sec")?,
        last_scan_at: row.get("last_scan_at")?,
        seeded: row.get::<_, i64>("seeded")? != 0,
    })
}

pub fn get_welcome_dm_config(conn: &Connection, profile_id: &str) -> rusqlite::Result<Option<WelcomeDmConfig>> {
    conn.query_row(
        "SELECT * FROM welcome_dm_config WHERE profile_id = ?1",
        params![profile_id],
        row_to_config,
    )
    .optional()
}

/// Upserts the user-editable fields, preserving `last_scan_at`/`seeded` (scheduler-owned).
pub fn upsert_welcome_dm_config(conn: &Connection, new: &NewWelcomeDmConfig) -> rusqlite::Result<WelcomeDmConfig> {
    let message_pool = serde_json::to_string(&new.message_pool).unwrap();
    conn.execute(
        "INSERT INTO welcome_dm_config (profile_id, enabled, message_pool, daily_limit, min_delay_sec, max_delay_sec, last_scan_at, seeded)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 0)
         ON CONFLICT(profile_id) DO UPDATE SET
            enabled = excluded.enabled,
            message_pool = excluded.message_pool,
            daily_limit = excluded.daily_limit,
            min_delay_sec = excluded.min_delay_sec,
            max_delay_sec = excluded.max_delay_sec",
        params![
            new.profile_id,
            new.enabled as i64,
            message_pool,
            new.daily_limit,
            new.min_delay_sec,
            new.max_delay_sec,
        ],
    )?;
    get_welcome_dm_config(conn, &new.profile_id).map(|c| c.expect("just upserted"))
}

pub fn list_enabled_welcome_configs(conn: &Connection) -> rusqlite::Result<Vec<WelcomeDmConfig>> {
    let mut stmt = conn.prepare("SELECT * FROM welcome_dm_config WHERE enabled = 1")?;
    let rows = stmt.query_map([], row_to_config)?;
    rows.collect()
}

pub fn set_last_scan(conn: &Connection, profile_id: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE welcome_dm_config SET last_scan_at = ?1 WHERE profile_id = ?2",
        params![now, profile_id],
    )?;
    Ok(())
}

pub fn mark_seeded(conn: &Connection, profile_id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE welcome_dm_config SET seeded = 1 WHERE profile_id = ?1",
        params![profile_id],
    )?;
    Ok(())
}

/// Records a follower if not already known. `welcomed` seeds the row's initial
/// state — true during the baseline seed pass (so it's never DMed), false for
/// genuinely-new followers picked up afterwards.
pub fn upsert_known_follower(
    conn: &Connection,
    profile_id: &str,
    username: &str,
    welcomed: bool,
) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let welcomed_at = if welcomed { Some(now.clone()) } else { None };
    conn.execute(
        "INSERT OR IGNORE INTO known_followers (id, profile_id, username, first_seen_at, welcomed, welcomed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, profile_id, username, now, welcomed as i64, welcomed_at],
    )?;
    Ok(())
}

pub fn list_unwelcomed(conn: &Connection, profile_id: &str, limit: i64) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT username FROM known_followers WHERE profile_id = ?1 AND welcomed = 0 ORDER BY first_seen_at ASC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![profile_id, limit], |row| row.get(0))?;
    rows.collect()
}

pub fn mark_welcomed(conn: &Connection, profile_id: &str, username: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE known_followers SET welcomed = 1, welcomed_at = ?1 WHERE profile_id = ?2 AND username = ?3",
        params![now, profile_id, username],
    )?;
    Ok(())
}
