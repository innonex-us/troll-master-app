use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct Campaign {
    pub id: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct NewCampaign {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

fn row_to_campaign(row: &rusqlite::Row) -> rusqlite::Result<Campaign> {
    let tags: String = row.get("tags")?;
    Ok(Campaign {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        enabled: row.get::<_, i64>("enabled")? != 0,
        tags: serde_json::from_str(&tags).unwrap_or_default(),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn insert_campaign(conn: &Connection, new: &NewCampaign) -> rusqlite::Result<Campaign> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let tags = serde_json::to_string(&new.tags).unwrap();
    conn.execute(
        "INSERT INTO campaigns (id, name, description, enabled, tags, created_at, updated_at) VALUES (?1, ?2, ?3, 1, ?4, ?5, ?5)",
        params![id, new.name, new.description, tags, now],
    )?;
    conn.query_row(
        "SELECT * FROM campaigns WHERE id = ?1",
        params![id],
        row_to_campaign,
    )
}

pub fn list_campaigns(conn: &Connection) -> rusqlite::Result<Vec<Campaign>> {
    let mut stmt = conn.prepare("SELECT * FROM campaigns ORDER BY created_at DESC")?;
    let rows = stmt.query_map([], row_to_campaign)?;
    rows.collect()
}

pub fn delete_campaign(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM campaigns WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn set_campaign_enabled(conn: &Connection, id: &str, enabled: bool) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE campaigns SET enabled = ?1, updated_at = ?2 WHERE id = ?3",
        params![enabled as i64, now, id],
    )?;
    Ok(())
}
