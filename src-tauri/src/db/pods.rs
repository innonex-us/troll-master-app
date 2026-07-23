use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct Pod {
    pub id: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    /// how long a detected post stays eligible for member engagement
    pub window_hours: i64,
    pub daily_limit_per_member: i64,
    pub min_delay_sec: i64,
    pub max_delay_sec: i64,
    /// subset of ["like", "comment"]
    pub actions: Vec<String>,
    pub comment_pool: Vec<String>,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct NewPod {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub window_hours: i64,
    pub daily_limit_per_member: i64,
    pub min_delay_sec: i64,
    pub max_delay_sec: i64,
    #[serde(default = "default_pod_actions")]
    pub actions: Vec<String>,
    #[serde(default)]
    pub comment_pool: Vec<String>,
}

fn default_pod_actions() -> Vec<String> {
    vec!["like".to_string()]
}

fn row_to_pod(row: &rusqlite::Row) -> rusqlite::Result<Pod> {
    let actions: String = row.get("actions")?;
    let comment_pool: String = row.get("comment_pool")?;
    Ok(Pod {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        enabled: row.get::<_, i64>("enabled")? != 0,
        window_hours: row.get("window_hours")?,
        daily_limit_per_member: row.get("daily_limit_per_member")?,
        min_delay_sec: row.get("min_delay_sec")?,
        max_delay_sec: row.get("max_delay_sec")?,
        actions: serde_json::from_str(&actions).unwrap_or_default(),
        comment_pool: serde_json::from_str(&comment_pool).unwrap_or_default(),
        created_at: row.get("created_at")?,
    })
}

pub fn insert_pod(conn: &Connection, new: &NewPod) -> rusqlite::Result<Pod> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let actions = serde_json::to_string(&new.actions).unwrap();
    let comment_pool = serde_json::to_string(&new.comment_pool).unwrap();
    conn.execute(
        "INSERT INTO pods (id, name, description, enabled, window_hours, daily_limit_per_member, min_delay_sec, max_delay_sec, actions, comment_pool, created_at)
         VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            id,
            new.name,
            new.description,
            new.window_hours,
            new.daily_limit_per_member,
            new.min_delay_sec,
            new.max_delay_sec,
            actions,
            comment_pool,
            now,
        ],
    )?;
    conn.query_row("SELECT * FROM pods WHERE id = ?1", params![id], row_to_pod)
}

pub fn list_pods(conn: &Connection) -> rusqlite::Result<Vec<Pod>> {
    let mut stmt = conn.prepare("SELECT * FROM pods ORDER BY created_at DESC")?;
    let rows = stmt.query_map([], row_to_pod)?;
    rows.collect()
}

pub fn set_pod_enabled(conn: &Connection, id: &str, enabled: bool) -> rusqlite::Result<()> {
    conn.execute("UPDATE pods SET enabled = ?1 WHERE id = ?2", params![enabled as i64, id])?;
    Ok(())
}

pub fn delete_pod(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM pods WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn list_enabled_pods(conn: &Connection) -> rusqlite::Result<Vec<Pod>> {
    let mut stmt = conn.prepare("SELECT * FROM pods WHERE enabled = 1")?;
    let rows = stmt.query_map([], row_to_pod)?;
    rows.collect()
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PodMember {
    pub id: String,
    pub pod_id: String,
    pub profile_id: String,
    pub enabled: bool,
    pub last_checked_at: Option<String>,
    pub created_at: String,
}

fn row_to_member(row: &rusqlite::Row) -> rusqlite::Result<PodMember> {
    Ok(PodMember {
        id: row.get("id")?,
        pod_id: row.get("pod_id")?,
        profile_id: row.get("profile_id")?,
        enabled: row.get::<_, i64>("enabled")? != 0,
        last_checked_at: row.get("last_checked_at")?,
        created_at: row.get("created_at")?,
    })
}

pub fn add_pod_member(conn: &Connection, pod_id: &str, profile_id: &str) -> rusqlite::Result<PodMember> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO pod_members (id, pod_id, profile_id, enabled, last_checked_at, created_at)
         VALUES (?1, ?2, ?3, 1, NULL, ?4)",
        params![id, pod_id, profile_id, now],
    )?;
    conn.query_row(
        "SELECT * FROM pod_members WHERE pod_id = ?1 AND profile_id = ?2",
        params![pod_id, profile_id],
        row_to_member,
    )
}

pub fn remove_pod_member(conn: &Connection, pod_id: &str, profile_id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM pod_members WHERE pod_id = ?1 AND profile_id = ?2",
        params![pod_id, profile_id],
    )?;
    Ok(())
}

pub fn list_pod_members(conn: &Connection, pod_id: &str) -> rusqlite::Result<Vec<PodMember>> {
    let mut stmt = conn.prepare("SELECT * FROM pod_members WHERE pod_id = ?1 ORDER BY created_at ASC")?;
    let rows = stmt.query_map(params![pod_id], row_to_member)?;
    rows.collect()
}

pub fn list_enabled_members_for_pod(conn: &Connection, pod_id: &str) -> rusqlite::Result<Vec<PodMember>> {
    let mut stmt = conn.prepare("SELECT * FROM pod_members WHERE pod_id = ?1 AND enabled = 1")?;
    let rows = stmt.query_map(params![pod_id], row_to_member)?;
    rows.collect()
}

pub fn set_member_last_checked(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute("UPDATE pod_members SET last_checked_at = ?1 WHERE id = ?2", params![now, id])?;
    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PodPost {
    pub id: String,
    pub pod_id: String,
    pub member_profile_id: String,
    pub post_url: String,
    pub detected_at: String,
    pub expires_at: String,
}

fn row_to_pod_post(row: &rusqlite::Row) -> rusqlite::Result<PodPost> {
    Ok(PodPost {
        id: row.get("id")?,
        pod_id: row.get("pod_id")?,
        member_profile_id: row.get("member_profile_id")?,
        post_url: row.get("post_url")?,
        detected_at: row.get("detected_at")?,
        expires_at: row.get("expires_at")?,
    })
}

/// Records a member's newest post if it hasn't been seen before for this pod
/// (`UNIQUE(pod_id, post_url)` makes this idempotent/cheap to call every tick).
pub fn insert_pod_post_if_new(
    conn: &Connection,
    pod_id: &str,
    member_profile_id: &str,
    post_url: &str,
    window_hours: i64,
) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    let expires_at = (now + chrono::Duration::hours(window_hours.max(1))).to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO pod_posts (id, pod_id, member_profile_id, post_url, detected_at, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, pod_id, member_profile_id, post_url, now.to_rfc3339(), expires_at],
    )?;
    Ok(())
}

pub fn list_active_pod_posts(conn: &Connection, pod_id: &str) -> rusqlite::Result<Vec<PodPost>> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut stmt = conn.prepare(
        "SELECT * FROM pod_posts WHERE pod_id = ?1 AND expires_at > ?2 ORDER BY detected_at DESC",
    )?;
    let rows = stmt.query_map(params![pod_id, now], row_to_pod_post)?;
    rows.collect()
}

pub fn list_pod_posts(conn: &Connection, pod_id: &str, limit: i64) -> rusqlite::Result<Vec<PodPost>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM pod_posts WHERE pod_id = ?1 ORDER BY detected_at DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![pod_id, limit], row_to_pod_post)?;
    rows.collect()
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PodEngagement {
    pub id: String,
    pub pod_post_id: String,
    pub acting_profile_id: String,
    pub action_type: String,
    pub status: String,
    pub executed_at: String,
}

fn row_to_engagement(row: &rusqlite::Row) -> rusqlite::Result<PodEngagement> {
    Ok(PodEngagement {
        id: row.get("id")?,
        pod_post_id: row.get("pod_post_id")?,
        acting_profile_id: row.get("acting_profile_id")?,
        action_type: row.get("action_type")?,
        status: row.get("status")?,
        executed_at: row.get("executed_at")?,
    })
}

pub fn engagement_exists(
    conn: &Connection,
    pod_post_id: &str,
    acting_profile_id: &str,
    action_type: &str,
) -> rusqlite::Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pod_engagements WHERE pod_post_id = ?1 AND acting_profile_id = ?2 AND action_type = ?3",
        params![pod_post_id, acting_profile_id, action_type],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub fn record_engagement(
    conn: &Connection,
    pod_post_id: &str,
    acting_profile_id: &str,
    action_type: &str,
    status: &str,
) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO pod_engagements (id, pod_post_id, acting_profile_id, action_type, status, executed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, pod_post_id, acting_profile_id, action_type, status, now],
    )?;
    Ok(())
}

pub fn list_engagements_for_post(conn: &Connection, pod_post_id: &str) -> rusqlite::Result<Vec<PodEngagement>> {
    let mut stmt = conn.prepare("SELECT * FROM pod_engagements WHERE pod_post_id = ?1 ORDER BY executed_at DESC")?;
    let rows = stmt.query_map(params![pod_post_id], row_to_engagement)?;
    rows.collect()
}

/// Count of this pod's engagements today by the acting profile, across every
/// pod post — used to enforce `daily_limit_per_member` independent of the
/// generic `action_log`-based `count_today` (pod actions use their own
/// `pod_like`/`pod_comment` action_type there too, but this table is the
/// pod-scoped source of truth for the per-member daily cap).
pub fn count_pod_engagements_today(conn: &Connection, pod_id: &str, acting_profile_id: &str) -> rusqlite::Result<i64> {
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    conn.query_row(
        "SELECT COUNT(*) FROM pod_engagements
         JOIN pod_posts ON pod_posts.id = pod_engagements.pod_post_id
         WHERE pod_posts.pod_id = ?1 AND pod_engagements.acting_profile_id = ?2
           AND pod_engagements.status = 'success' AND pod_engagements.executed_at LIKE ?3 || '%'",
        params![pod_id, acting_profile_id, today],
        |row| row.get(0),
    )
}
