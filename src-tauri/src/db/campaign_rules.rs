use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct CampaignRule {
    pub id: String,
    pub campaign_id: String,
    pub action_type: String,
    pub daily_limit: i64,
    pub min_delay_sec: i64,
    pub max_delay_sec: i64,
    pub target_source: Vec<String>,
    pub comment_pool: Vec<String>,
    pub source_type: String,
    pub source_seed: String,
    pub dm_message: String,
    pub filter_skip_no_avatar: bool,
    pub reaction_type: String,
    pub active_hours_start: i64,
    pub active_hours_end: i64,
    pub active_days: Vec<i64>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct NewCampaignRule {
    pub campaign_id: String,
    pub action_type: String,
    pub daily_limit: i64,
    pub min_delay_sec: i64,
    pub max_delay_sec: i64,
    #[serde(default)]
    pub target_source: Vec<String>,
    #[serde(default)]
    pub comment_pool: Vec<String>,
    #[serde(default = "default_source_type")]
    pub source_type: String,
    #[serde(default)]
    pub source_seed: String,
    #[serde(default)]
    pub dm_message: String,
    #[serde(default)]
    pub filter_skip_no_avatar: bool,
    #[serde(default = "default_reaction_type")]
    pub reaction_type: String,
    #[serde(default)]
    pub active_hours_start: i64,
    #[serde(default = "default_hours_end")]
    pub active_hours_end: i64,
    #[serde(default = "default_active_days")]
    pub active_days: Vec<i64>,
}

fn default_source_type() -> String {
    "explicit".to_string()
}

fn default_reaction_type() -> String {
    "like".to_string()
}

fn default_hours_end() -> i64 {
    24
}

fn default_active_days() -> Vec<i64> {
    vec![1, 2, 3, 4, 5, 6, 7]
}

fn row_to_campaign_rule(row: &rusqlite::Row) -> rusqlite::Result<CampaignRule> {
    let target_source: String = row.get("target_source")?;
    let comment_pool: String = row.get("comment_pool")?;
    let active_days: String = row.get("active_days")?;
    Ok(CampaignRule {
        id: row.get("id")?,
        campaign_id: row.get("campaign_id")?,
        action_type: row.get("action_type")?,
        daily_limit: row.get("daily_limit")?,
        min_delay_sec: row.get("min_delay_sec")?,
        max_delay_sec: row.get("max_delay_sec")?,
        target_source: serde_json::from_str(&target_source).unwrap_or_default(),
        comment_pool: serde_json::from_str(&comment_pool).unwrap_or_default(),
        source_type: row.get("source_type")?,
        source_seed: row.get("source_seed")?,
        dm_message: row.get("dm_message")?,
        filter_skip_no_avatar: row.get::<_, i64>("filter_skip_no_avatar")? != 0,
        reaction_type: row.get("reaction_type")?,
        active_hours_start: row.get("active_hours_start")?,
        active_hours_end: row.get("active_hours_end")?,
        active_days: serde_json::from_str(&active_days).unwrap_or_else(|_| vec![1, 2, 3, 4, 5, 6, 7]),
        created_at: row.get("created_at")?,
    })
}

pub fn insert_campaign_rule(conn: &Connection, new: &NewCampaignRule) -> rusqlite::Result<CampaignRule> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let target_source = serde_json::to_string(&new.target_source).unwrap();
    let comment_pool = serde_json::to_string(&new.comment_pool).unwrap();
    let active_days = serde_json::to_string(&new.active_days).unwrap();
    conn.execute(
        "INSERT INTO campaign_rules (id, campaign_id, action_type, daily_limit, min_delay_sec, max_delay_sec, target_source, comment_pool, source_type, source_seed, dm_message, filter_skip_no_avatar, reaction_type, active_hours_start, active_hours_end, active_days, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        params![
            id,
            new.campaign_id,
            new.action_type,
            new.daily_limit,
            new.min_delay_sec,
            new.max_delay_sec,
            target_source,
            comment_pool,
            new.source_type,
            new.source_seed,
            new.dm_message,
            new.filter_skip_no_avatar as i64,
            new.reaction_type,
            new.active_hours_start,
            new.active_hours_end,
            active_days,
            now,
        ],
    )?;
    conn.query_row(
        "SELECT * FROM campaign_rules WHERE id = ?1",
        params![id],
        row_to_campaign_rule,
    )
}

pub fn list_all_campaign_rules(conn: &Connection) -> rusqlite::Result<Vec<CampaignRule>> {
    let mut stmt = conn.prepare("SELECT * FROM campaign_rules ORDER BY created_at ASC")?;
    let rows = stmt.query_map([], row_to_campaign_rule)?;
    rows.collect()
}

pub fn list_campaign_rules(conn: &Connection, campaign_id: &str) -> rusqlite::Result<Vec<CampaignRule>> {
    let mut stmt = conn.prepare("SELECT * FROM campaign_rules WHERE campaign_id = ?1 ORDER BY created_at ASC")?;
    let rows = stmt.query_map(params![campaign_id], row_to_campaign_rule)?;
    rows.collect()
}

pub fn append_targets_to_campaign_rule(conn: &Connection, id: &str, new_targets: &[String]) -> rusqlite::Result<()> {
    let existing: String = conn.query_row(
        "SELECT target_source FROM campaign_rules WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    let mut targets: Vec<String> = serde_json::from_str(&existing).unwrap_or_default();
    for t in new_targets {
        if !targets.contains(t) {
            targets.push(t.clone());
        }
    }
    let encoded = serde_json::to_string(&targets).unwrap();
    conn.execute(
        "UPDATE campaign_rules SET target_source = ?1 WHERE id = ?2",
        params![encoded, id],
    )?;
    Ok(())
}

pub fn get_campaign_rule(conn: &Connection, id: &str) -> rusqlite::Result<Option<CampaignRule>> {
    use rusqlite::OptionalExtension;
    conn.query_row("SELECT * FROM campaign_rules WHERE id = ?1", params![id], row_to_campaign_rule)
        .optional()
}

pub fn delete_campaign_rule(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM campaign_rules WHERE id = ?1", params![id])?;
    Ok(())
}

/// Which action types are meaningful on which platform — used when enrolling a
/// profile into a campaign so we don't enroll it in a rule for an action the
/// platform doesn't support (e.g. "retweet" on an Instagram profile).
pub fn action_valid_for_platform(action_type: &str, platform: &str) -> bool {
    match platform {
        "instagram" => matches!(
            action_type,
            "follow" | "unfollow" | "like" | "unlike" | "comment" | "save" | "view_story" | "react_story" | "dm"
        ),
        "twitter" => matches!(
            action_type,
            "follow" | "unfollow" | "like" | "unlike" | "comment" | "retweet" | "unretweet" | "dm"
        ),
        "facebook" => matches!(action_type, "follow" | "unfollow" | "like" | "unlike" | "comment" | "dm"),
        "tiktok" => matches!(
            action_type,
            "follow" | "unfollow" | "like" | "unlike" | "comment" | "save" | "view_story" | "react_story" | "dm"
        ),
        "linkedin" => matches!(action_type, "follow" | "unfollow" | "like" | "unlike" | "comment" | "dm"),
        "youtube" => matches!(
            action_type,
            "follow" | "unfollow" | "like" | "unlike" | "comment" | "view_story" | "react_story" | "dm"
        ),
        _ => false,
    }
}
