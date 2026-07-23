use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct ProfileGroup {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct NewProfileGroup {
    pub name: String,
    #[serde(default)]
    pub description: String,
}

fn row_to_group(row: &rusqlite::Row) -> rusqlite::Result<ProfileGroup> {
    Ok(ProfileGroup {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        created_at: row.get("created_at")?,
    })
}

pub fn insert_group(conn: &Connection, new: &NewProfileGroup) -> rusqlite::Result<ProfileGroup> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO profile_groups (id, name, description, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, new.name, new.description, now],
    )?;
    conn.query_row(
        "SELECT * FROM profile_groups WHERE id = ?1",
        params![id],
        row_to_group,
    )
}

pub fn list_groups(conn: &Connection) -> rusqlite::Result<Vec<ProfileGroup>> {
    let mut stmt = conn.prepare("SELECT * FROM profile_groups ORDER BY created_at DESC")?;
    let rows = stmt.query_map([], row_to_group)?;
    rows.collect()
}

pub fn delete_group(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE profiles SET group_id = NULL WHERE group_id = ?1", params![id])?;
    conn.execute("DELETE FROM profile_groups WHERE id = ?1", params![id])?;
    Ok(())
}
