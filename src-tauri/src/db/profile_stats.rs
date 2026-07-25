use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct ProfileStat {
    pub id: String,
    pub profile_id: String,
    pub followers: Option<i64>,
    pub following: Option<i64>,
    pub posts: Option<i64>,
    pub captured_at: String,
}

fn row_to_stat(row: &rusqlite::Row) -> rusqlite::Result<ProfileStat> {
    Ok(ProfileStat {
        id: row.get("id")?,
        profile_id: row.get("profile_id")?,
        followers: row.get("followers")?,
        following: row.get("following")?,
        posts: row.get("posts")?,
        captured_at: row.get("captured_at")?,
    })
}

pub fn insert_stat(
    conn: &Connection,
    profile_id: &str,
    followers: Option<i64>,
    following: Option<i64>,
    posts: Option<i64>,
) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO profile_stats (id, profile_id, followers, following, posts, captured_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, profile_id, followers, following, posts, now],
    )?;
    Ok(())
}

pub fn list_stats(conn: &Connection, profile_id: &str, limit: i64) -> rusqlite::Result<Vec<ProfileStat>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM profile_stats WHERE profile_id = ?1 ORDER BY captured_at ASC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![profile_id, limit], row_to_stat)?;
    rows.collect()
}

pub fn latest_stat_at(conn: &Connection, profile_id: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT captured_at FROM profile_stats WHERE profile_id = ?1 ORDER BY captured_at DESC LIMIT 1",
        params![profile_id],
        |row| row.get(0),
    )
    .optional()
}
