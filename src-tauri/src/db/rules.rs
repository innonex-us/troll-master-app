use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct ActionRule {
    pub id: String,
    pub profile_id: String,
    pub action_type: String,
    pub enabled: bool,
    pub daily_limit: i64,
    pub min_delay_sec: i64,
    pub max_delay_sec: i64,
    pub target_source: Vec<String>,
    pub target_cursor: i64,
    pub comment_pool: Vec<String>,
    /// "explicit" (user-provided list) | "hashtag" | "followers_of"
    pub source_type: String,
    /// hashtag/seed username/day-threshold used to auto-refill target_source when source_type != explicit
    pub source_seed: String,
    pub consecutive_errors: i64,
    pub backoff_until: Option<String>,
    /// spintax template used by the "dm" action, e.g. "{Hey|Hi} {{target}}, love your posts!"
    pub dm_message: String,
    pub filter_skip_no_avatar: bool,
    /// "like" | "emoji" | "comment" — only meaningful when action_type is "react_story"
    pub reaction_type: String,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct NewActionRule {
    pub profile_id: String,
    pub action_type: String,
    pub daily_limit: i64,
    pub min_delay_sec: i64,
    pub max_delay_sec: i64,
    pub target_source: Vec<String>,
    #[serde(default)]
    pub comment_pool: Vec<String>,
    #[serde(default = "default_source_type")]
    pub source_type: String,
    #[serde(default)]
    pub source_seed: String,
    #[serde(default)]
    pub dm_message: String,
    #[serde(default)]
    pub filter_skip_no_avatar: bool,
    #[serde(default = "default_reaction_type")]
    pub reaction_type: String,
}

fn default_source_type() -> String {
    "explicit".to_string()
}

fn default_reaction_type() -> String {
    "like".to_string()
}

fn row_to_rule(row: &rusqlite::Row) -> rusqlite::Result<ActionRule> {
    let target_source: String = row.get("target_source")?;
    let comment_pool: String = row.get("comment_pool")?;
    Ok(ActionRule {
        id: row.get("id")?,
        profile_id: row.get("profile_id")?,
        action_type: row.get("action_type")?,
        enabled: row.get::<_, i64>("enabled")? != 0,
        daily_limit: row.get("daily_limit")?,
        min_delay_sec: row.get("min_delay_sec")?,
        max_delay_sec: row.get("max_delay_sec")?,
        target_source: serde_json::from_str(&target_source).unwrap_or_default(),
        target_cursor: row.get("target_cursor")?,
        comment_pool: serde_json::from_str(&comment_pool).unwrap_or_default(),
        source_type: row.get("source_type")?,
        source_seed: row.get("source_seed")?,
        consecutive_errors: row.get("consecutive_errors")?,
        backoff_until: row.get("backoff_until")?,
        dm_message: row.get("dm_message")?,
        filter_skip_no_avatar: row.get::<_, i64>("filter_skip_no_avatar")? != 0,
        reaction_type: row.get("reaction_type")?,
        created_at: row.get("created_at")?,
    })
}

pub fn insert_rule(conn: &Connection, new: &NewActionRule) -> rusqlite::Result<ActionRule> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let target_source = serde_json::to_string(&new.target_source).unwrap();
    let comment_pool = serde_json::to_string(&new.comment_pool).unwrap();
    conn.execute(
        "INSERT INTO action_rules (id, profile_id, action_type, enabled, daily_limit, min_delay_sec, max_delay_sec, target_source, target_cursor, comment_pool, source_type, source_seed, consecutive_errors, backoff_until, dm_message, filter_skip_no_avatar, reaction_type, created_at)
         VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6, ?7, 0, ?8, ?9, ?10, 0, NULL, ?11, ?12, ?13, ?14)",
        params![
            id,
            new.profile_id,
            new.action_type,
            new.daily_limit,
            new.min_delay_sec,
            new.max_delay_sec,
            target_source,
            comment_pool,
            new.source_type,
            new.source_seed,
            new.dm_message,
            new.filter_skip_no_avatar as i64,
            new.reaction_type,
            now,
        ],
    )?;
    conn.query_row("SELECT * FROM action_rules WHERE id = ?1", params![id], row_to_rule)
}


pub fn get_rule(conn: &Connection, id: &str) -> rusqlite::Result<Option<ActionRule>> {
    use rusqlite::OptionalExtension;
    conn.query_row("SELECT * FROM action_rules WHERE id = ?1", params![id], row_to_rule)
        .optional()
}

pub fn list_rules_for_profile(conn: &Connection, profile_id: &str) -> rusqlite::Result<Vec<ActionRule>> {
    let mut stmt = conn.prepare("SELECT * FROM action_rules WHERE profile_id = ?1 ORDER BY created_at DESC")?;
    let rows = stmt.query_map(params![profile_id], row_to_rule)?;
    rows.collect()
}

pub fn list_enabled_rules(conn: &Connection) -> rusqlite::Result<Vec<ActionRule>> {
    let mut stmt = conn.prepare("SELECT * FROM action_rules WHERE enabled = 1")?;
    let rows = stmt.query_map([], row_to_rule)?;
    rows.collect()
}

pub fn set_rule_enabled(conn: &Connection, id: &str, enabled: bool) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE action_rules SET enabled = ?1 WHERE id = ?2",
        params![enabled as i64, id],
    )?;
    Ok(())
}

pub fn advance_cursor(conn: &Connection, id: &str, len: i64) -> rusqlite::Result<()> {
    if len <= 0 {
        return Ok(());
    }
    conn.execute(
        "UPDATE action_rules SET target_cursor = (target_cursor + 1) % ?1 WHERE id = ?2",
        params![len, id],
    )?;
    Ok(())
}

pub fn record_rule_success(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE action_rules SET consecutive_errors = 0, backoff_until = NULL WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

pub fn record_rule_error(conn: &Connection, id: &str, backoff_until: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE action_rules SET consecutive_errors = consecutive_errors + 1, backoff_until = ?1 WHERE id = ?2",
        params![backoff_until, id],
    )?;
    Ok(())
}

pub fn append_targets(conn: &Connection, id: &str, new_targets: &[String]) -> rusqlite::Result<()> {
    let existing: String = conn.query_row(
        "SELECT target_source FROM action_rules WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    let mut targets: Vec<String> = serde_json::from_str(&existing).unwrap_or_default();
    for t in new_targets {
        if !targets.contains(t) {
            targets.push(t.clone());
        }
    }
    let encoded = serde_json::to_string(&targets).unwrap();
    conn.execute(
        "UPDATE action_rules SET target_source = ?1 WHERE id = ?2",
        params![encoded, id],
    )?;
    Ok(())
}

pub fn delete_rule(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM action_rules WHERE id = ?1", params![id])?;
    Ok(())
}
