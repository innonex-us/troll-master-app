use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct DmSequenceProgress {
    pub id: String,
    pub rule_id: String,
    pub target: String,
    pub current_step: i64,
    /// "active" | "completed" | "stopped"
    pub status: String,
    pub next_send_at: String,
    pub started_at: String,
    pub updated_at: String,
}

fn row_to_progress(row: &rusqlite::Row) -> rusqlite::Result<DmSequenceProgress> {
    Ok(DmSequenceProgress {
        id: row.get("id")?,
        rule_id: row.get("rule_id")?,
        target: row.get("target")?,
        current_step: row.get("current_step")?,
        status: row.get("status")?,
        next_send_at: row.get("next_send_at")?,
        started_at: row.get("started_at")?,
        updated_at: row.get("updated_at")?,
    })
}

/// Enrolls a target into a sequence at step 0, due immediately. Cheap and
/// idempotent — safe to call for every target on every tick, since the
/// `UNIQUE(rule_id, target)` constraint makes re-enrollment a no-op.
pub fn enroll_target_if_new(conn: &Connection, rule_id: &str, target: &str) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO dm_sequence_progress (id, rule_id, target, current_step, status, next_send_at, started_at, updated_at)
         VALUES (?1, ?2, ?3, 0, 'active', ?4, ?4, ?4)",
        params![id, rule_id, target, now],
    )?;
    Ok(())
}

/// The single oldest-due active step across all of this rule's enrolled targets.
pub fn next_due(conn: &Connection, rule_id: &str) -> rusqlite::Result<Option<DmSequenceProgress>> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut stmt = conn.prepare(
        "SELECT * FROM dm_sequence_progress
         WHERE rule_id = ?1 AND status = 'active' AND next_send_at <= ?2
         ORDER BY next_send_at ASC LIMIT 1",
    )?;
    let mut rows = stmt.query_map(params![rule_id, now], row_to_progress)?;
    rows.next().transpose()
}

pub fn advance_step(conn: &Connection, id: &str, next_step: i64, next_send_at: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE dm_sequence_progress SET current_step = ?1, next_send_at = ?2, updated_at = ?3 WHERE id = ?4",
        params![next_step, next_send_at, now, id],
    )?;
    Ok(())
}

pub fn complete(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE dm_sequence_progress SET status = 'completed', updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

pub fn list_progress_for_rule(conn: &Connection, rule_id: &str) -> rusqlite::Result<Vec<DmSequenceProgress>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM dm_sequence_progress WHERE rule_id = ?1 ORDER BY started_at DESC",
    )?;
    let rows = stmt.query_map(params![rule_id], row_to_progress)?;
    rows.collect()
}
