mod logs;
mod profiles;
mod proxies;
mod rules;

pub use logs::*;
pub use profiles::*;
pub use proxies::*;
pub use rules::*;

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

CREATE INDEX IF NOT EXISTS idx_action_log_profile_type ON action_log(profile_id, action_type, executed_at);
CREATE INDEX IF NOT EXISTS idx_action_rules_profile ON action_rules(profile_id);
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
