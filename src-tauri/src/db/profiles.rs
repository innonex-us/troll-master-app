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
    pub device_name: String,
    pub device_id: String,
    /// Manual pause switch, independent of `status` (which is scheduler/login-lifecycle
    /// managed). A disabled profile is skipped by every scheduler tick regardless of status.
    pub enabled: bool,
    /// Never exposes the encrypted password itself — just whether one is stored,
    /// so the frontend can show "Auto Login" as available without any secret leaving the backend.
    pub has_password: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct NewProfile {
    pub platform: String,
    pub display_name: String,
    pub username: String,
    pub proxy_id: Option<String>,
    #[serde(default)]
    pub device_name: String,
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
        device_name: row.get("device_name")?,
        device_id: row.get("device_id")?,
        enabled: row.get::<_, i64>("enabled")? != 0,
        has_password: row.get::<_, Option<String>>("login_password_enc")?.is_some(),
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
    let device_id = crate::fingerprint::generate_device_id();
    conn.execute(
        "INSERT INTO profiles (id, platform, display_name, username, proxy_id, timezone, locale, user_agent, viewport_width, viewport_height, storage_state_enc_path, status, device_name, device_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, 'needs_login', ?11, ?12, ?13, ?13)",
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
            new.device_name,
            device_id,
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

pub fn set_profile_enabled(conn: &Connection, id: &str, enabled: bool) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE profiles SET enabled = ?1, updated_at = ?2 WHERE id = ?3",
        params![enabled as i64, now, id],
    )?;
    Ok(())
}

/// Clones a profile's platform/username/proxy/group/device_name and *exact* fingerprint
/// dimensions (not freshly randomized) onto a brand-new profile, then re-creates all of
/// its action rules on the new profile too. Never copies session state or stored password —
/// the clone always starts at `needs_login` with its own fresh `device_id`, same as any
/// other newly-created profile.
pub fn duplicate_profile(conn: &Connection, source_id: &str) -> rusqlite::Result<Profile> {
    let source = get_profile(conn, source_id)?
        .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;

    let new = NewProfile {
        platform: source.platform.clone(),
        display_name: format!("{} (copy)", source.display_name),
        username: source.username.clone(),
        proxy_id: source.proxy_id.clone(),
        device_name: source.device_name.clone(),
    };
    let fp = crate::fingerprint::Fingerprint {
        user_agent: source.user_agent.clone(),
        timezone: source.timezone.clone(),
        locale: source.locale.clone(),
        viewport_width: source.viewport_width,
        viewport_height: source.viewport_height,
    };

    let cloned = insert_profile(conn, &new, &fp)?;
    set_profile_group(conn, &cloned.id, source.group_id.as_deref())?;

    for rule in crate::db::list_rules_for_profile(conn, source_id)? {
        let new_rule = crate::db::NewActionRule {
            profile_id: cloned.id.clone(),
            action_type: rule.action_type,
            daily_limit: rule.daily_limit,
            min_delay_sec: rule.min_delay_sec,
            max_delay_sec: rule.max_delay_sec,
            target_source: rule.target_source,
            comment_pool: rule.comment_pool,
            source_type: rule.source_type,
            source_seed: rule.source_seed,
            dm_message: rule.dm_message,
            filter_skip_no_avatar: rule.filter_skip_no_avatar,
            reaction_type: rule.reaction_type,
            sequence_steps: rule.sequence_steps,
        };
        let inserted = crate::db::insert_rule(conn, &new_rule)?;
        if !rule.enabled {
            crate::db::set_rule_enabled(conn, &inserted.id, false)?;
        }
    }

    get_profile(conn, &cloned.id).map(|p| p.expect("just inserted"))
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

pub fn set_profile_device_name(conn: &Connection, id: &str, device_name: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE profiles SET device_name = ?1, updated_at = ?2 WHERE id = ?3",
        params![device_name, now, id],
    )?;
    Ok(())
}

pub fn regenerate_device_id(conn: &Connection, id: &str) -> rusqlite::Result<String> {
    let device_id = crate::fingerprint::generate_device_id();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE profiles SET device_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![device_id, now, id],
    )?;
    Ok(device_id)
}

/// Stores an already-encrypted password blob (or clears it with `None`). Encryption
/// happens one layer up, in the executor — this module just persists opaque ciphertext.
pub fn set_login_password_enc(conn: &Connection, id: &str, enc: Option<&str>) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE profiles SET login_password_enc = ?1, updated_at = ?2 WHERE id = ?3",
        params![enc, now, id],
    )?;
    Ok(())
}

pub fn get_login_password_enc(conn: &Connection, id: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT login_password_enc FROM profiles WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )
    .optional()
    .map(|v| v.flatten())
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
