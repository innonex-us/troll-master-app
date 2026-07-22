use rusqlite::{params, Connection};

/// Records a successful follow so a later "unfollow non-follow-backs" rule can
/// find it once the grace period elapses. A no-op if this profile already
/// followed this username before (re-follow after an earlier unfollow doesn't
/// reset the history).
pub fn record_follow(
    conn: &Connection,
    profile_id: &str,
    platform: &str,
    target_username: &str,
) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO follow_history (id, profile_id, platform, target_username, followed_at, follow_status)
         VALUES (?1, ?2, ?3, ?4, ?5, 'pending')",
        params![id, profile_id, platform, target_username, now],
    )?;
    Ok(())
}

/// Usernames this profile followed more than `days_threshold` days ago that
/// haven't been confirmed as following back and haven't already been unfollowed.
pub fn list_due_non_followbacks(
    conn: &Connection,
    profile_id: &str,
    days_threshold: i64,
) -> rusqlite::Result<Vec<String>> {
    let cutoff = (chrono::Utc::now() - chrono::Duration::days(days_threshold)).to_rfc3339();
    let mut stmt = conn.prepare(
        "SELECT target_username FROM follow_history
         WHERE profile_id = ?1 AND unfollowed_at IS NULL AND follow_status != 'following_back'
           AND followed_at <= ?2
         ORDER BY followed_at ASC",
    )?;
    let rows = stmt.query_map(params![profile_id, cutoff], |row| row.get(0))?;
    rows.collect()
}

pub fn mark_following_back(conn: &Connection, profile_id: &str, target_username: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE follow_history SET follow_status = 'following_back', checked_at = ?1
         WHERE profile_id = ?2 AND target_username = ?3",
        params![now, profile_id, target_username],
    )?;
    Ok(())
}

pub fn mark_unfollowed(conn: &Connection, profile_id: &str, target_username: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE follow_history SET unfollowed_at = ?1, follow_status = 'not_following_back', checked_at = ?1
         WHERE profile_id = ?2 AND target_username = ?3",
        params![now, profile_id, target_username],
    )?;
    Ok(())
}
