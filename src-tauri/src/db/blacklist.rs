use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct BlacklistEntry {
    pub id: String,
    pub profile_id: Option<String>,
    pub username: String,
    pub created_at: String,
}

fn row_to_entry(row: &rusqlite::Row) -> rusqlite::Result<BlacklistEntry> {
    Ok(BlacklistEntry {
        id: row.get("id")?,
        profile_id: row.get("profile_id")?,
        username: row.get("username")?,
        created_at: row.get("created_at")?,
    })
}

/// `profile_id: None` blacklists a username across every profile; `Some(id)` scopes it to one.
pub fn add_blacklist_entry(
    conn: &Connection,
    profile_id: Option<&str>,
    username: &str,
) -> rusqlite::Result<BlacklistEntry> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let normalized = username.trim().trim_start_matches('@').to_lowercase();
    conn.execute(
        "INSERT INTO blacklist_entries (id, profile_id, username, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, profile_id, normalized, now],
    )?;
    conn.query_row(
        "SELECT * FROM blacklist_entries WHERE id = ?1",
        params![id],
        row_to_entry,
    )
}

pub fn list_blacklist(conn: &Connection) -> rusqlite::Result<Vec<BlacklistEntry>> {
    let mut stmt = conn.prepare("SELECT * FROM blacklist_entries ORDER BY created_at DESC")?;
    let rows = stmt.query_map([], row_to_entry)?;
    rows.collect()
}

pub fn remove_blacklist_entry(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM blacklist_entries WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn is_blacklisted(conn: &Connection, profile_id: &str, username: &str) -> rusqlite::Result<bool> {
    let normalized = username.trim().trim_start_matches('@').to_lowercase();
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM blacklist_entries WHERE username = ?1 AND (profile_id IS NULL OR profile_id = ?2)",
        params![normalized, profile_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}
