use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

/// Per-(campaign_rule, profile) execution state. A campaign_rule is a shared
/// definition (targets, delays, daily_limit); each enrolled profile walks it
/// independently — its own cursor, its own backoff, its own error streak —
/// while daily-limit counting still comes from action_log (profile_id, action_type),
/// so a profile can't blow past its own per-account safety cap regardless of
/// how many rules/campaigns are driving it.
#[derive(Serialize, Deserialize, Clone)]
pub struct CampaignRuleState {
    pub id: String,
    pub campaign_rule_id: String,
    pub profile_id: String,
    pub enabled: bool,
    pub target_cursor: i64,
    pub consecutive_errors: i64,
    pub backoff_until: Option<String>,
    pub created_at: String,
}

fn row_to_state(row: &rusqlite::Row) -> rusqlite::Result<CampaignRuleState> {
    Ok(CampaignRuleState {
        id: row.get("id")?,
        campaign_rule_id: row.get("campaign_rule_id")?,
        profile_id: row.get("profile_id")?,
        enabled: row.get::<_, i64>("enabled")? != 0,
        target_cursor: row.get("target_cursor")?,
        consecutive_errors: row.get("consecutive_errors")?,
        backoff_until: row.get("backoff_until")?,
        created_at: row.get("created_at")?,
    })
}

pub fn enroll_profile_in_rule(
    conn: &Connection,
    campaign_rule_id: &str,
    profile_id: &str,
) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO campaign_rule_state (id, campaign_rule_id, profile_id, enabled, target_cursor, consecutive_errors, backoff_until, created_at)
         VALUES (?1, ?2, ?3, 1, 0, 0, NULL, ?4)",
        params![id, campaign_rule_id, profile_id, now],
    )?;
    Ok(())
}

pub fn unenroll_profile_from_rule(
    conn: &Connection,
    campaign_rule_id: &str,
    profile_id: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM campaign_rule_state WHERE campaign_rule_id = ?1 AND profile_id = ?2",
        params![campaign_rule_id, profile_id],
    )?;
    Ok(())
}

/// Distinct profiles enrolled in any rule of this campaign.
pub fn list_enrolled_profile_ids(conn: &Connection, campaign_id: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT s.profile_id FROM campaign_rule_state s
         JOIN campaign_rules r ON r.id = s.campaign_rule_id
         WHERE r.campaign_id = ?1",
    )?;
    let rows = stmt.query_map(params![campaign_id], |row| row.get(0))?;
    rows.collect()
}

pub fn list_states_for_rule(conn: &Connection, campaign_rule_id: &str) -> rusqlite::Result<Vec<CampaignRuleState>> {
    let mut stmt = conn.prepare("SELECT * FROM campaign_rule_state WHERE campaign_rule_id = ?1")?;
    let rows = stmt.query_map(params![campaign_rule_id], row_to_state)?;
    rows.collect()
}

/// All (rule, state) pairs whose parent campaign is enabled — what the scheduler drives.
pub fn list_active_campaign_states(conn: &Connection) -> rusqlite::Result<Vec<(super::CampaignRule, CampaignRuleState)>> {
    let mut stmt = conn.prepare(
        "SELECT s.* FROM campaign_rule_state s
         JOIN campaign_rules r ON r.id = s.campaign_rule_id
         JOIN campaigns c ON c.id = r.campaign_id
         WHERE s.enabled = 1 AND c.enabled = 1",
    )?;
    let states: Vec<CampaignRuleState> = stmt.query_map([], row_to_state)?.collect::<rusqlite::Result<_>>()?;

    let mut out = Vec::with_capacity(states.len());
    for state in states {
        if let Some(rule) = super::get_campaign_rule(conn, &state.campaign_rule_id)? {
            out.push((rule, state));
        }
    }
    Ok(out)
}

pub fn advance_state_cursor(conn: &Connection, id: &str, len: i64) -> rusqlite::Result<()> {
    if len <= 0 {
        return Ok(());
    }
    conn.execute(
        "UPDATE campaign_rule_state SET target_cursor = (target_cursor + 1) % ?1 WHERE id = ?2",
        params![len, id],
    )?;
    Ok(())
}

pub fn record_state_success(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE campaign_rule_state SET consecutive_errors = 0, backoff_until = NULL WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

pub fn record_state_error(conn: &Connection, id: &str, backoff_until: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE campaign_rule_state SET consecutive_errors = consecutive_errors + 1, backoff_until = ?1 WHERE id = ?2",
        params![backoff_until, id],
    )?;
    Ok(())
}

/// "Reset" a campaign: every enrolled profile starts over (cursor, errors, backoff cleared).
pub fn reset_campaign_state(conn: &Connection, campaign_id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE campaign_rule_state SET target_cursor = 0, consecutive_errors = 0, backoff_until = NULL
         WHERE campaign_rule_id IN (SELECT id FROM campaign_rules WHERE campaign_id = ?1)",
        params![campaign_id],
    )?;
    Ok(())
}

/// "Retry Failed Accounts": clear backoff without losing cursor progress or error history.
pub fn retry_failed_campaign_state(conn: &Connection, campaign_id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE campaign_rule_state SET backoff_until = NULL
         WHERE campaign_rule_id IN (SELECT id FROM campaign_rules WHERE campaign_id = ?1) AND backoff_until IS NOT NULL",
        params![campaign_id],
    )?;
    Ok(())
}
