use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct Profile {
    pub id: String,
    pub platform: String,
    pub display_name: String,
    pub username: String,
    pub proxy_id: Option<String>,
    pub timezone: String,
    pub locale: String,
    pub user_agent: String,
    pub viewport_width: i64,
    pub viewport_height: i64,
    pub storage_state_enc_path: Option<String>,
    pub status: String,
    pub activated_at: Option<String>,
    pub group_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct NewProfile {
    pub platform: String,
    pub display_name: String,
    pub username: String,
    pub proxy_id: Option<String>,
}

fn row_to_profile(row: &rusqlite::Row) -> rusqlite::Result<Profile> {
    Ok(Profile {
        id: row.get("id")?,
        platform: row.get("platform")?,
        display_name: row.get("display_name")?,
        username: row.get("username")?,
        proxy_id: row.get("proxy_id")?,
        timezone: row.get("timezone")?,
        locale: row.get("locale")?,
        user_agent: row.get("user_agent")?,
        viewport_width: row.get("viewport_width")?,
        viewport_height: row.get("viewport_height")?,
        storage_state_enc_path: row.get("storage_state_enc_path")?,
        status: row.get("status")?,
        activated_at: row.get("activated_at")?,
        group_id: row.get("group_id")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn insert_profile(
    conn: &Connection,
    new: &NewProfile,
    fp: &crate::fingerprint::Fingerprint,
) -> rusqlite::Result<Profile> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO profiles (id, platform, display_name, username, proxy_id, timezone, locale, user_agent, viewport_width, viewport_height, storage_state_enc_path, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, 'needs_login', ?11, ?11)",
        params![
            id,
            new.platform,
            new.display_name,
            new.username,
            new.proxy_id,
            fp.timezone,
            fp.locale,
            fp.user_agent,
            fp.viewport_width,
            fp.viewport_height,
            now,
        ],
    )?;
    get_profile(conn, &id).map(|p| p.expect("just inserted"))
}

pub fn get_profile(conn: &Connection, id: &str) -> rusqlite::Result<Option<Profile>> {
    conn.query_row("SELECT * FROM profiles WHERE id = ?1", params![id], row_to_profile)
        .optional()
}

pub fn list_profiles(conn: &Connection) -> rusqlite::Result<Vec<Profile>> {
    let mut stmt = conn.prepare("SELECT * FROM profiles ORDER BY created_at DESC")?;
    let rows = stmt.query_map([], row_to_profile)?;
    rows.collect()
}

pub fn delete_profile(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM profiles WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn set_profile_proxy(conn: &Connection, id: &str, proxy_id: Option<&str>) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE profiles SET proxy_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![proxy_id, now, id],
    )?;
    Ok(())
}

pub fn set_profile_group(conn: &Connection, id: &str, group_id: Option<&str>) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE profiles SET group_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![group_id, now, id],
    )?;
    Ok(())
}

pub fn set_profile_status(conn: &Connection, id: &str, status: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE profiles SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![status, now, id],
    )?;
    Ok(())
}

/// Records the first time a profile goes active, used as the warmup-curve reference point.
/// A no-op if already set, so repeated re-logins don't reset the account's warmup age.
pub fn set_profile_activated_now(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE profiles SET activated_at = COALESCE(activated_at, ?1) WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

pub fn set_profile_storage_state_path(
    conn: &Connection,
    id: &str,
    path: Option<&str>,
) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE profiles SET storage_state_enc_path = ?1, updated_at = ?2 WHERE id = ?3",
        params![path, now, id],
    )?;
    Ok(())
}
