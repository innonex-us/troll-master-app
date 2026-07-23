use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct Proxy {
    pub id: String,
    pub label: String,
    pub protocol: String,
    pub host: String,
    pub port: i64,
    pub username: Option<String>,
    pub password: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct NewProxy {
    pub label: String,
    pub protocol: String,
    pub host: String,
    pub port: i64,
    pub username: Option<String>,
    pub password: Option<String>,
}

fn row_to_proxy(row: &rusqlite::Row) -> rusqlite::Result<Proxy> {
    Ok(Proxy {
        id: row.get("id")?,
        label: row.get("label")?,
        protocol: row.get("protocol")?,
        host: row.get("host")?,
        port: row.get("port")?,
        username: row.get("username")?,
        password: row.get("password")?,
        created_at: row.get("created_at")?,
    })
}

pub fn insert_proxy(conn: &Connection, new: &NewProxy) -> rusqlite::Result<Proxy> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO proxies (id, label, protocol, host, port, username, password, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, new.label, new.protocol, new.host, new.port, new.username, new.password, now],
    )?;
    conn.query_row("SELECT * FROM proxies WHERE id = ?1", params![id], row_to_proxy)
}

pub fn list_proxies(conn: &Connection) -> rusqlite::Result<Vec<Proxy>> {
    let mut stmt = conn.prepare("SELECT * FROM proxies ORDER BY created_at DESC")?;
    let rows = stmt.query_map([], row_to_proxy)?;
    rows.collect()
}

pub fn delete_proxy(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM proxies WHERE id = ?1", params![id])?;
    Ok(())
}
