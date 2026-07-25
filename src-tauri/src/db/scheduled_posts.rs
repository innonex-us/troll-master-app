use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct ScheduledPost {
    pub id: String,
    pub profile_id: String,
    pub media_path: String,
    pub caption: String,
    pub scheduled_at: String,
    /// "pending" | "posted" | "failed"
    pub status: String,
    pub posted_at: Option<String>,
    pub error: Option<String>,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct NewScheduledPost {
    pub profile_id: String,
    #[serde(default)]
    pub media_path: String,
    #[serde(default)]
    pub caption: String,
    pub scheduled_at: String,
}

fn row_to_post(row: &rusqlite::Row) -> rusqlite::Result<ScheduledPost> {
    Ok(ScheduledPost {
        id: row.get("id")?,
        profile_id: row.get("profile_id")?,
        media_path: row.get("media_path")?,
        caption: row.get("caption")?,
        scheduled_at: row.get("scheduled_at")?,
        status: row.get("status")?,
        posted_at: row.get("posted_at")?,
        error: row.get("error")?,
        created_at: row.get("created_at")?,
    })
}

pub fn insert_scheduled_post(conn: &Connection, new: &NewScheduledPost) -> rusqlite::Result<ScheduledPost> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO scheduled_posts (id, profile_id, media_path, caption, scheduled_at, status, posted_at, error, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'pending', NULL, NULL, ?6)",
        params![id, new.profile_id, new.media_path, new.caption, new.scheduled_at, now],
    )?;
    conn.query_row("SELECT * FROM scheduled_posts WHERE id = ?1", params![id], row_to_post)
}

pub fn list_scheduled_posts(conn: &Connection) -> rusqlite::Result<Vec<ScheduledPost>> {
    let mut stmt = conn.prepare("SELECT * FROM scheduled_posts ORDER BY scheduled_at DESC")?;
    let rows = stmt.query_map([], row_to_post)?;
    rows.collect()
}

/// Pending posts whose scheduled time has arrived, oldest first.
pub fn list_due_posts(conn: &Connection) -> rusqlite::Result<Vec<ScheduledPost>> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut stmt = conn.prepare(
        "SELECT * FROM scheduled_posts WHERE status = 'pending' AND scheduled_at <= ?1 ORDER BY scheduled_at ASC",
    )?;
    let rows = stmt.query_map(params![now], row_to_post)?;
    rows.collect()
}

pub fn mark_post_posted(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE scheduled_posts SET status = 'posted', posted_at = ?1, error = NULL WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

pub fn mark_post_failed(conn: &Connection, id: &str, error: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE scheduled_posts SET status = 'failed', error = ?1 WHERE id = ?2",
        params![error, id],
    )?;
    Ok(())
}

pub fn delete_scheduled_post(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM scheduled_posts WHERE id = ?1", params![id])?;
    Ok(())
}
