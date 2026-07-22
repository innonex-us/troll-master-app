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
        created_at: row.get("created_at")?,
    })
}

pub fn insert_rule(conn: &Connection, new: &NewActionRule) -> rusqlite::Result<ActionRule> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let target_source = serde_json::to_string(&new.target_source).unwrap();
    let comment_pool = serde_json::to_string(&new.comment_pool).unwrap();
    conn.execute(
        "INSERT INTO action_rules (id, profile_id, action_type, enabled, daily_limit, min_delay_sec, max_delay_sec, target_source, target_cursor, comment_pool, created_at)
         VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6, ?7, 0, ?8, ?9)",
        params![id, new.profile_id, new.action_type, new.daily_limit, new.min_delay_sec, new.max_delay_sec, target_source, comment_pool, now],
    )?;
    conn.query_row("SELECT * FROM action_rules WHERE id = ?1", params![id], row_to_rule)
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

pub fn delete_rule(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM action_rules WHERE id = ?1", params![id])?;
    Ok(())
}
