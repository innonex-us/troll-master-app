use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct ActionLogEntry {
    pub id: String,
    pub profile_id: String,
    pub action_type: String,
    pub target: String,
    pub status: String,
    pub message: Option<String>,
    pub executed_at: String,
}

fn row_to_log(row: &rusqlite::Row) -> rusqlite::Result<ActionLogEntry> {
    Ok(ActionLogEntry {
        id: row.get("id")?,
        profile_id: row.get("profile_id")?,
        action_type: row.get("action_type")?,
        target: row.get("target")?,
        status: row.get("status")?,
        message: row.get("message")?,
        executed_at: row.get("executed_at")?,
    })
}

pub fn insert_log(
    conn: &Connection,
    profile_id: &str,
    action_type: &str,
    target: &str,
    status: &str,
    message: Option<&str>,
) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO action_log (id, profile_id, action_type, target, status, message, executed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, profile_id, action_type, target, status, message, now],
    )?;
    Ok(())
}

pub fn list_recent_logs(conn: &Connection, limit: i64) -> rusqlite::Result<Vec<ActionLogEntry>> {
    let mut stmt = conn.prepare("SELECT * FROM action_log ORDER BY executed_at DESC LIMIT ?1")?;
    let rows = stmt.query_map(params![limit], row_to_log)?;
    rows.collect()
}

pub fn count_today(conn: &Connection, profile_id: &str, action_type: &str) -> rusqlite::Result<i64> {
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    conn.query_row(
        "SELECT COUNT(*) FROM action_log
         WHERE profile_id = ?1 AND action_type = ?2 AND status = 'success' AND executed_at LIKE ?3 || '%'",
        params![profile_id, action_type, today],
        |row| row.get(0),
    )
}

pub fn last_executed_at(
    conn: &Connection,
    profile_id: &str,
    action_type: &str,
) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT executed_at FROM action_log
         WHERE profile_id = ?1 AND action_type = ?2
         ORDER BY executed_at DESC LIMIT 1",
        params![profile_id, action_type],
        |row| row.get(0),
    )
    .optional()
}
