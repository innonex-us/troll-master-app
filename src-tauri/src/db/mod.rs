mod blacklist;
mod campaign_rule_state;
mod campaign_rules;
mod campaigns;
mod comment_replies;
mod dm_sequences;
mod follow_history;
mod groups;
mod logs;
mod monitoring;
mod pods;
mod profile_stats;
mod profiles;
mod proxies;
mod rules;
mod settings;
mod welcome_dm;

pub use blacklist::*;
pub use campaign_rule_state::*;
pub use campaign_rules::*;
pub use campaigns::*;
pub use comment_replies::*;
pub use dm_sequences::*;
pub use follow_history::*;
pub use groups::*;
pub use logs::*;
pub use monitoring::*;
pub use pods::*;
pub use profile_stats::*;
pub use profiles::*;
pub use proxies::*;
pub use rules::*;
pub use settings::*;
pub use welcome_dm::*;

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

CREATE TABLE IF NOT EXISTS comment_reply_rules (
    id TEXT PRIMARY KEY,
    monitored_post_id TEXT NOT NULL REFERENCES monitored_posts(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 1,
    daily_limit INTEGER NOT NULL,
    min_delay_sec INTEGER NOT NULL,
    max_delay_sec INTEGER NOT NULL,
    reply_pool TEXT NOT NULL DEFAULT '[]',
    consecutive_errors INTEGER NOT NULL DEFAULT 0,
    backoff_until TEXT,
    last_checked_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(monitored_post_id)
);

CREATE TABLE IF NOT EXISTS monitored_post_comments (
    id TEXT PRIMARY KEY,
    monitored_post_id TEXT NOT NULL REFERENCES monitored_posts(id) ON DELETE CASCADE,
    platform_comment_id TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    replied INTEGER NOT NULL DEFAULT 0,
    replied_at TEXT,
    first_seen_at TEXT NOT NULL,
    UNIQUE(monitored_post_id, platform_comment_id)
);

CREATE TABLE IF NOT EXISTS dm_sequence_progress (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL REFERENCES action_rules(id) ON DELETE CASCADE,
    target TEXT NOT NULL,
    current_step INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    next_send_at TEXT NOT NULL,
    started_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(rule_id, target)
);

CREATE TABLE IF NOT EXISTS pods (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    window_hours INTEGER NOT NULL DEFAULT 6,
    daily_limit_per_member INTEGER NOT NULL DEFAULT 10,
    min_delay_sec INTEGER NOT NULL DEFAULT 120,
    max_delay_sec INTEGER NOT NULL DEFAULT 900,
    actions TEXT NOT NULL DEFAULT '["like"]',
    comment_pool TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pod_members (
    id TEXT PRIMARY KEY,
    pod_id TEXT NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_checked_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(pod_id, profile_id)
);

CREATE TABLE IF NOT EXISTS pod_posts (
    id TEXT PRIMARY KEY,
    pod_id TEXT NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
    member_profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_url TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    UNIQUE(pod_id, post_url)
);

CREATE TABLE IF NOT EXISTS pod_engagements (
    id TEXT PRIMARY KEY,
    pod_post_id TEXT NOT NULL REFERENCES pod_posts(id) ON DELETE CASCADE,
    acting_profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    status TEXT NOT NULL,
    executed_at TEXT NOT NULL,
    UNIQUE(pod_post_id, acting_profile_id, action_type)
);

CREATE TABLE IF NOT EXISTS known_followers (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    welcomed INTEGER NOT NULL DEFAULT 0,
    welcomed_at TEXT,
    UNIQUE(profile_id, username)
);

CREATE TABLE IF NOT EXISTS welcome_dm_config (
    profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 0,
    message_pool TEXT NOT NULL DEFAULT '[]',
    daily_limit INTEGER NOT NULL DEFAULT 10,
    min_delay_sec INTEGER NOT NULL DEFAULT 120,
    max_delay_sec INTEGER NOT NULL DEFAULT 600,
    last_scan_at TEXT,
    seeded INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS profile_stats (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    followers INTEGER,
    following INTEGER,
    posts INTEGER,
    captured_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_action_log_profile_type ON action_log(profile_id, action_type, executed_at);
CREATE INDEX IF NOT EXISTS idx_known_followers_unwelcomed ON known_followers(profile_id, welcomed);
CREATE INDEX IF NOT EXISTS idx_profile_stats_profile ON profile_stats(profile_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_mpc_unreplied ON monitored_post_comments(monitored_post_id, replied);
CREATE INDEX IF NOT EXISTS idx_dm_seq_due ON dm_sequence_progress(rule_id, status, next_send_at);
CREATE INDEX IF NOT EXISTS idx_pod_posts_active ON pod_posts(pod_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_pod_engagements_post ON pod_engagements(pod_post_id);
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
    add_column_if_missing(conn, "profiles", "device_name", "TEXT NOT NULL DEFAULT ''")?;
    add_column_if_missing(conn, "profiles", "device_id", "TEXT NOT NULL DEFAULT ''")?;
    add_column_if_missing(conn, "profiles", "login_password_enc", "TEXT")?;
    add_column_if_missing(conn, "action_rules", "reaction_type", "TEXT NOT NULL DEFAULT 'like'")?;
    add_column_if_missing(conn, "campaign_rules", "reaction_type", "TEXT NOT NULL DEFAULT 'like'")?;
    add_column_if_missing(conn, "action_rules", "sequence_steps", "TEXT NOT NULL DEFAULT '[]'")?;
    add_column_if_missing(conn, "profiles", "enabled", "INTEGER NOT NULL DEFAULT 1")?;
    // Per-rule active-window scheduling (working hours + weekdays). Window is [start,end);
    // 0..24 = always on. active_days is a JSON array of weekday ints (Mon=1..Sun=7).
    for table in ["action_rules", "campaign_rules"] {
        add_column_if_missing(conn, table, "active_hours_start", "INTEGER NOT NULL DEFAULT 0")?;
        add_column_if_missing(conn, table, "active_hours_end", "INTEGER NOT NULL DEFAULT 24")?;
        add_column_if_missing(conn, table, "active_days", "TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7]'")?;
    }
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
