use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct CommentReplyRule {
    pub id: String,
    pub monitored_post_id: String,
    pub enabled: bool,
    pub daily_limit: i64,
    pub min_delay_sec: i64,
    pub max_delay_sec: i64,
    /// spintax reply pool, e.g. "{Thanks|Appreciate it} for the comment!"
    pub reply_pool: Vec<String>,
    pub consecutive_errors: i64,
    pub backoff_until: Option<String>,
    pub last_checked_at: Option<String>,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct NewCommentReplyRule {
    pub monitored_post_id: String,
    pub daily_limit: i64,
    pub min_delay_sec: i64,
    pub max_delay_sec: i64,
    #[serde(default)]
    pub reply_pool: Vec<String>,
}

fn row_to_reply_rule(row: &rusqlite::Row) -> rusqlite::Result<CommentReplyRule> {
    let reply_pool: String = row.get("reply_pool")?;
    Ok(CommentReplyRule {
        id: row.get("id")?,
        monitored_post_id: row.get("monitored_post_id")?,
        enabled: row.get::<_, i64>("enabled")? != 0,
        daily_limit: row.get("daily_limit")?,
        min_delay_sec: row.get("min_delay_sec")?,
        max_delay_sec: row.get("max_delay_sec")?,
        reply_pool: serde_json::from_str(&reply_pool).unwrap_or_default(),
        consecutive_errors: row.get("consecutive_errors")?,
        backoff_until: row.get("backoff_until")?,
        last_checked_at: row.get("last_checked_at")?,
        created_at: row.get("created_at")?,
    })
}

/// One reply rule per monitored post — creating a second one for the same post
/// replaces the first (upsert on the table's `UNIQUE(monitored_post_id)`).
pub fn upsert_reply_rule(conn: &Connection, new: &NewCommentReplyRule) -> rusqlite::Result<CommentReplyRule> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let reply_pool = serde_json::to_string(&new.reply_pool).unwrap();
    conn.execute(
        "INSERT INTO comment_reply_rules (id, monitored_post_id, enabled, daily_limit, min_delay_sec, max_delay_sec, reply_pool, consecutive_errors, backoff_until, created_at)
         VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6, 0, NULL, ?7)
         ON CONFLICT(monitored_post_id) DO UPDATE SET
            daily_limit = excluded.daily_limit,
            min_delay_sec = excluded.min_delay_sec,
            max_delay_sec = excluded.max_delay_sec,
            reply_pool = excluded.reply_pool",
        params![id, new.monitored_post_id, new.daily_limit, new.min_delay_sec, new.max_delay_sec, reply_pool, now],
    )?;
    conn.query_row(
        "SELECT * FROM comment_reply_rules WHERE monitored_post_id = ?1",
        params![new.monitored_post_id],
        row_to_reply_rule,
    )
}

pub fn get_reply_rule(conn: &Connection, monitored_post_id: &str) -> rusqlite::Result<Option<CommentReplyRule>> {
    conn.query_row(
        "SELECT * FROM comment_reply_rules WHERE monitored_post_id = ?1",
        params![monitored_post_id],
        row_to_reply_rule,
    )
    .optional()
}

pub fn set_reply_rule_enabled(conn: &Connection, id: &str, enabled: bool) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE comment_reply_rules SET enabled = ?1 WHERE id = ?2",
        params![enabled as i64, id],
    )?;
    Ok(())
}

pub fn delete_reply_rule(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM comment_reply_rules WHERE id = ?1", params![id])?;
    Ok(())
}

/// Every enabled reply rule joined with its monitored post — the scheduler needs
/// the post's URL/platform/viewer_profile_id to know what to scrape and who replies.
pub fn list_enabled_reply_rules_with_posts(
    conn: &Connection,
) -> rusqlite::Result<Vec<(CommentReplyRule, super::MonitoredPost)>> {
    let mut stmt = conn.prepare(
        "SELECT comment_reply_rules.*, monitored_posts.id AS mp_id, monitored_posts.platform AS mp_platform,
                monitored_posts.url AS mp_url, monitored_posts.label AS mp_label,
                monitored_posts.viewer_profile_id AS mp_viewer_profile_id, monitored_posts.created_at AS mp_created_at
         FROM comment_reply_rules
         JOIN monitored_posts ON monitored_posts.id = comment_reply_rules.monitored_post_id
         WHERE comment_reply_rules.enabled = 1",
    )?;
    let rows = stmt.query_map([], |row| {
        let rule = row_to_reply_rule(row)?;
        let post = super::MonitoredPost {
            id: row.get("mp_id")?,
            platform: row.get("mp_platform")?,
            url: row.get("mp_url")?,
            label: row.get("mp_label")?,
            viewer_profile_id: row.get("mp_viewer_profile_id")?,
            created_at: row.get("mp_created_at")?,
        };
        Ok((rule, post))
    })?;
    rows.collect()
}

pub fn set_reply_rule_last_checked(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE comment_reply_rules SET last_checked_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

pub fn record_reply_rule_success(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE comment_reply_rules SET consecutive_errors = 0, backoff_until = NULL WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

pub fn record_reply_rule_error(conn: &Connection, id: &str, backoff_until: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE comment_reply_rules SET consecutive_errors = consecutive_errors + 1, backoff_until = ?1 WHERE id = ?2",
        params![backoff_until, id],
    )?;
    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MonitoredPostComment {
    pub id: String,
    pub monitored_post_id: String,
    pub platform_comment_id: String,
    pub author: String,
    pub text: String,
    pub replied: bool,
    pub replied_at: Option<String>,
    pub first_seen_at: String,
}

fn row_to_comment(row: &rusqlite::Row) -> rusqlite::Result<MonitoredPostComment> {
    Ok(MonitoredPostComment {
        id: row.get("id")?,
        monitored_post_id: row.get("monitored_post_id")?,
        platform_comment_id: row.get("platform_comment_id")?,
        author: row.get("author")?,
        text: row.get("text")?,
        replied: row.get::<_, i64>("replied")? != 0,
        replied_at: row.get("replied_at")?,
        first_seen_at: row.get("first_seen_at")?,
    })
}

/// Inserts a newly-seen comment, ignoring it if this (post, platform_comment_id)
/// pair was already recorded (the sidecar's synthetic comment id is derived from
/// author+text, so an edited comment is treated as a new one — acceptable, since
/// there's no real stable id available from DOM scraping).
pub fn upsert_comment(
    conn: &Connection,
    monitored_post_id: &str,
    platform_comment_id: &str,
    author: &str,
    text: &str,
) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO monitored_post_comments (id, monitored_post_id, platform_comment_id, author, text, replied, replied_at, first_seen_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, NULL, ?6)",
        params![id, monitored_post_id, platform_comment_id, author, text, now],
    )?;
    Ok(())
}

pub fn list_unreplied_comments(
    conn: &Connection,
    monitored_post_id: &str,
    limit: i64,
) -> rusqlite::Result<Vec<MonitoredPostComment>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM monitored_post_comments WHERE monitored_post_id = ?1 AND replied = 0 ORDER BY first_seen_at ASC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![monitored_post_id, limit], row_to_comment)?;
    rows.collect()
}

pub fn mark_comment_replied(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE monitored_post_comments SET replied = 1, replied_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}
