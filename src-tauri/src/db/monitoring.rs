use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct MonitoredPost {
    pub id: String,
    pub platform: String,
    pub url: String,
    pub label: String,
    pub viewer_profile_id: String,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct NewMonitoredPost {
    pub platform: String,
    pub url: String,
    #[serde(default)]
    pub label: String,
    pub viewer_profile_id: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct PostMetrics {
    pub likes: Option<i64>,
    pub comments: Option<i64>,
    pub shares: Option<i64>,
    pub views: Option<i64>,
    pub bookmarks: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MonitoredPostSnapshot {
    pub id: String,
    pub monitored_post_id: String,
    pub likes: Option<i64>,
    pub comments: Option<i64>,
    pub shares: Option<i64>,
    pub views: Option<i64>,
    pub bookmarks: Option<i64>,
    pub captured_at: String,
}

fn row_to_post(row: &rusqlite::Row) -> rusqlite::Result<MonitoredPost> {
    Ok(MonitoredPost {
        id: row.get("id")?,
        platform: row.get("platform")?,
        url: row.get("url")?,
        label: row.get("label")?,
        viewer_profile_id: row.get("viewer_profile_id")?,
        created_at: row.get("created_at")?,
    })
}

fn row_to_snapshot(row: &rusqlite::Row) -> rusqlite::Result<MonitoredPostSnapshot> {
    Ok(MonitoredPostSnapshot {
        id: row.get("id")?,
        monitored_post_id: row.get("monitored_post_id")?,
        likes: row.get("likes")?,
        comments: row.get("comments")?,
        shares: row.get("shares")?,
        views: row.get("views")?,
        bookmarks: row.get("bookmarks")?,
        captured_at: row.get("captured_at")?,
    })
}

pub fn insert_monitored_post(conn: &Connection, new: &NewMonitoredPost) -> rusqlite::Result<MonitoredPost> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO monitored_posts (id, platform, url, label, viewer_profile_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, new.platform, new.url, new.label, new.viewer_profile_id, now],
    )?;
    conn.query_row("SELECT * FROM monitored_posts WHERE id = ?1", params![id], row_to_post)
}

pub fn list_monitored_posts(conn: &Connection) -> rusqlite::Result<Vec<MonitoredPost>> {
    let mut stmt = conn.prepare("SELECT * FROM monitored_posts ORDER BY created_at DESC")?;
    let rows = stmt.query_map([], row_to_post)?;
    rows.collect()
}

pub fn delete_monitored_post(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM monitored_posts WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn insert_snapshot(
    conn: &Connection,
    monitored_post_id: &str,
    metrics: &PostMetrics,
) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO monitored_post_snapshots (id, monitored_post_id, likes, comments, shares, views, bookmarks, captured_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, monitored_post_id, metrics.likes, metrics.comments, metrics.shares, metrics.views, metrics.bookmarks, now],
    )?;
    Ok(())
}

pub fn list_snapshots(conn: &Connection, monitored_post_id: &str, limit: i64) -> rusqlite::Result<Vec<MonitoredPostSnapshot>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM monitored_post_snapshots WHERE monitored_post_id = ?1 ORDER BY captured_at DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![monitored_post_id, limit], row_to_snapshot)?;
    rows.collect()
}

pub fn latest_snapshot_at(conn: &Connection, monitored_post_id: &str) -> rusqlite::Result<Option<String>> {
    use rusqlite::OptionalExtension;
    conn.query_row(
        "SELECT captured_at FROM monitored_post_snapshots WHERE monitored_post_id = ?1 ORDER BY captured_at DESC LIMIT 1",
        params![monitored_post_id],
        |row| row.get(0),
    )
    .optional()
}
