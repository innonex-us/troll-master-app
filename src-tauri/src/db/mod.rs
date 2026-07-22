mod blacklist;
mod campaign_rule_state;
mod campaign_rules;
mod campaigns;
mod follow_history;
mod groups;
mod logs;
mod monitoring;
mod profiles;
mod proxies;
mod rules;
mod settings;

pub use blacklist::*;
pub use campaign_rule_state::*;
pub use campaign_rules::*;
pub use campaigns::*;
pub use follow_history::*;
pub use groups::*;
pub use logs::*;
pub use monitoring::*;
pub use profiles::*;
pub use proxies::*;
pub use rules::*;
pub use settings::*;

use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS proxies (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    protocol TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    username TEXT,
    password TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    display_name TEXT NOT NULL,
    username TEXT NOT NULL,
    proxy_id TEXT REFERENCES proxies(id) ON DELETE SET NULL,
    timezone TEXT NOT NULL,
    locale TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    viewport_width INTEGER NOT NULL,
    viewport_height INTEGER NOT NULL,
    storage_state_enc_path TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    activated_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS action_rules (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    daily_limit INTEGER NOT NULL,
    min_delay_sec INTEGER NOT NULL,
    max_delay_sec INTEGER NOT NULL,
    target_source TEXT NOT NULL DEFAULT '[]',
    target_cursor INTEGER NOT NULL DEFAULT 0,
    comment_pool TEXT NOT NULL DEFAULT '[]',
    source_type TEXT NOT NULL DEFAULT 'explicit',
    source_seed TEXT NOT NULL DEFAULT '',
    consecutive_errors INTEGER NOT NULL DEFAULT 0,
    backoff_until TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS action_log (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    target TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    executed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS follow_history (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    target_username TEXT NOT NULL,
    followed_at TEXT NOT NULL,
    unfollowed_at TEXT,
    follow_status TEXT NOT NULL DEFAULT 'pending',
    checked_at TEXT,
    UNIQUE(profile_id, target_username)
);

CREATE TABLE IF NOT EXISTS blacklist_entries (
    id TEXT PRIMARY KEY,
    profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_rules (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    daily_limit INTEGER NOT NULL,
    min_delay_sec INTEGER NOT NULL,
    max_delay_sec INTEGER NOT NULL,
    target_source TEXT NOT NULL DEFAULT '[]',
    comment_pool TEXT NOT NULL DEFAULT '[]',
    source_type TEXT NOT NULL DEFAULT 'explicit',
    source_seed TEXT NOT NULL DEFAULT '',
    dm_message TEXT NOT NULL DEFAULT '',
    filter_skip_no_avatar INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_rule_state (
    id TEXT PRIMARY KEY,
    campaign_rule_id TEXT NOT NULL REFERENCES campaign_rules(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 1,
    target_cursor INTEGER NOT NULL DEFAULT 0,
    consecutive_errors INTEGER NOT NULL DEFAULT 0,
    backoff_until TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(campaign_rule_id, profile_id)
);

CREATE TABLE IF NOT EXISTS monitored_posts (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    url TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    viewer_profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitored_post_snapshots (
    id TEXT PRIMARY KEY,
    monitored_post_id TEXT NOT NULL REFERENCES monitored_posts(id) ON DELETE CASCADE,
    likes INTEGER,
    comments INTEGER,
    shares INTEGER,
    views INTEGER,
    bookmarks INTEGER,
    captured_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_action_log_profile_type ON action_log(profile_id, action_type, executed_at);
CREATE INDEX IF NOT EXISTS idx_action_rules_profile ON action_rules(profile_id);
CREATE INDEX IF NOT EXISTS idx_follow_history_profile ON follow_history(profile_id, followed_at);
CREATE INDEX IF NOT EXISTS idx_blacklist_username ON blacklist_entries(username);
CREATE INDEX IF NOT EXISTS idx_campaign_rules_campaign ON campaign_rules(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_rule_state_profile ON campaign_rule_state(profile_id);
CREATE INDEX IF NOT EXISTS idx_campaign_rule_state_rule ON campaign_rule_state(campaign_rule_id);
CREATE INDEX IF NOT EXISTS idx_monitored_snapshots_post ON monitored_post_snapshots(monitored_post_id, captured_at);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#;

fn column_exists(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get("name")?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> rusqlite::Result<()> {
    if !column_exists(conn, table, column)? {
        conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition};"))?;
    }
    Ok(())
}

/// Additive migrations for columns introduced after the initial schema shipped.
/// SQLite's `ALTER TABLE ADD COLUMN` has no `IF NOT EXISTS`, so each column is
/// checked individually before adding it.
fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    add_column_if_missing(conn, "profiles", "activated_at", "TEXT")?;
    add_column_if_missing(conn, "action_rules", "source_type", "TEXT NOT NULL DEFAULT 'explicit'")?;
    add_column_if_missing(conn, "action_rules", "source_seed", "TEXT NOT NULL DEFAULT ''")?;
    add_column_if_missing(conn, "action_rules", "consecutive_errors", "INTEGER NOT NULL DEFAULT 0")?;
    add_column_if_missing(conn, "action_rules", "backoff_until", "TEXT")?;
    add_column_if_missing(conn, "action_rules", "dm_message", "TEXT NOT NULL DEFAULT ''")?;
    add_column_if_missing(conn, "action_rules", "filter_skip_no_avatar", "INTEGER NOT NULL DEFAULT 0")?;
    add_column_if_missing(conn, "profiles", "group_id", "TEXT")?;
    add_column_if_missing(conn, "campaigns", "enabled", "INTEGER NOT NULL DEFAULT 1")?;
    add_column_if_missing(conn, "campaigns", "tags", "TEXT NOT NULL DEFAULT '[]'")?;
    Ok(())
}

impl Db {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        conn.execute_batch(SCHEMA)?;
        migrate(&conn)?;
        Ok(Db(Mutex::new(conn)))
    }
}
