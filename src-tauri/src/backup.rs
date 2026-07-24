use std::collections::HashMap;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::db;

/// Pairs a `New*` payload with the id it had before export, so import can
/// remap cross-references (profile->proxy, rule->profile, etc.) onto the
/// fresh ids generated when each row is re-inserted.
#[derive(Serialize, Deserialize)]
pub struct IdTagged<T> {
    pub old_id: String,
    pub data: T,
}

#[derive(Serialize, Deserialize)]
pub struct ProfileExport {
    pub old_id: String,
    pub new: db::NewProfile,
    pub old_group_id: Option<String>,
    pub timezone: String,
    pub locale: String,
    pub user_agent: String,
    pub viewport_width: i64,
    pub viewport_height: i64,
    pub enabled: bool,
}

#[derive(Serialize, Deserialize)]
pub struct RuleExport {
    pub old_profile_id: String,
    pub new: db::NewActionRule,
    pub enabled: bool,
}

#[derive(Serialize, Deserialize)]
pub struct CampaignExport {
    pub old_id: String,
    pub new: db::NewCampaign,
    pub enabled: bool,
}

#[derive(Serialize, Deserialize)]
pub struct CampaignRuleExport {
    pub old_campaign_id: String,
    pub new: db::NewCampaignRule,
}

#[derive(Serialize, Deserialize)]
pub struct PodExport {
    pub old_id: String,
    pub new: db::NewPod,
    pub enabled: bool,
}

#[derive(Serialize, Deserialize)]
pub struct PodMemberExport {
    pub old_pod_id: String,
    pub old_profile_id: String,
}

#[derive(Serialize, Deserialize)]
pub struct BlacklistExport {
    pub old_profile_id: Option<String>,
    pub username: String,
}

/// Full-app config backup — deliberately excludes runtime/derived data (action
/// logs, follow history, monitored-post snapshots/comments, campaign
/// enrollments, dm-sequence progress, pod posts/engagements) and encrypted
/// session secrets (storage state, stored login passwords), since those are
/// tied to a local OS-keychain key and aren't portable across machines anyway.
/// Proxy credentials ARE included — they're already stored in plaintext in the
/// `proxies` table today, so export doesn't introduce new exposure.
#[derive(Serialize, Deserialize)]
pub struct BackupBundle {
    pub version: u32,
    pub exported_at: String,
    pub app_version: String,
    pub proxies: Vec<IdTagged<db::NewProxy>>,
    pub groups: Vec<IdTagged<db::NewProfileGroup>>,
    pub profiles: Vec<ProfileExport>,
    pub rules: Vec<RuleExport>,
    pub campaigns: Vec<CampaignExport>,
    pub campaign_rules: Vec<CampaignRuleExport>,
    pub pods: Vec<PodExport>,
    pub pod_members: Vec<PodMemberExport>,
    pub blacklist: Vec<BlacklistExport>,
    pub settings: db::AppSettings,
}

#[derive(Serialize)]
pub struct ImportSummary {
    pub proxies: usize,
    pub groups: usize,
    pub profiles: usize,
    pub rules: usize,
    pub campaigns: usize,
    pub campaign_rules: usize,
    pub pods: usize,
    pub pod_members: usize,
    pub blacklist: usize,
    pub settings_imported: bool,
}

pub fn export_bundle(conn: &Connection) -> rusqlite::Result<BackupBundle> {
    let proxies = db::list_proxies(conn)?
        .into_iter()
        .map(|p| IdTagged {
            old_id: p.id,
            data: db::NewProxy {
                label: p.label,
                protocol: p.protocol,
                host: p.host,
                port: p.port,
                username: p.username,
                password: p.password,
            },
        })
        .collect();

    let groups = db::list_groups(conn)?
        .into_iter()
        .map(|g| IdTagged {
            old_id: g.id,
            data: db::NewProfileGroup {
                name: g.name,
                description: g.description,
            },
        })
        .collect();

    let profiles = db::list_profiles(conn)?
        .into_iter()
        .map(|p| ProfileExport {
            old_id: p.id,
            new: db::NewProfile {
                platform: p.platform,
                display_name: p.display_name,
                username: p.username,
                proxy_id: p.proxy_id, // old proxy id — remapped on import
                device_name: p.device_name,
            },
            old_group_id: p.group_id,
            timezone: p.timezone,
            locale: p.locale,
            user_agent: p.user_agent,
            viewport_width: p.viewport_width,
            viewport_height: p.viewport_height,
            enabled: p.enabled,
        })
        .collect();

    let rules = db::list_all_rules(conn)?
        .into_iter()
        .map(|r| RuleExport {
            old_profile_id: r.profile_id.clone(),
            enabled: r.enabled,
            new: db::NewActionRule {
                profile_id: r.profile_id, // old profile id — remapped on import
                action_type: r.action_type,
                daily_limit: r.daily_limit,
                min_delay_sec: r.min_delay_sec,
                max_delay_sec: r.max_delay_sec,
                target_source: r.target_source,
                comment_pool: r.comment_pool,
                source_type: r.source_type,
                source_seed: r.source_seed,
                dm_message: r.dm_message,
                filter_skip_no_avatar: r.filter_skip_no_avatar,
                reaction_type: r.reaction_type,
                sequence_steps: r.sequence_steps,
                active_hours_start: r.active_hours_start,
                active_hours_end: r.active_hours_end,
                active_days: r.active_days,
            },
        })
        .collect();

    let campaigns = db::list_campaigns(conn)?
        .into_iter()
        .map(|c| CampaignExport {
            old_id: c.id,
            enabled: c.enabled,
            new: db::NewCampaign {
                name: c.name,
                description: c.description,
                tags: c.tags,
            },
        })
        .collect();

    let campaign_rules = db::list_all_campaign_rules(conn)?
        .into_iter()
        .map(|r| CampaignRuleExport {
            old_campaign_id: r.campaign_id.clone(),
            new: db::NewCampaignRule {
                campaign_id: r.campaign_id, // old campaign id — remapped on import
                action_type: r.action_type,
                daily_limit: r.daily_limit,
                min_delay_sec: r.min_delay_sec,
                max_delay_sec: r.max_delay_sec,
                target_source: r.target_source,
                comment_pool: r.comment_pool,
                source_type: r.source_type,
                source_seed: r.source_seed,
                dm_message: r.dm_message,
                filter_skip_no_avatar: r.filter_skip_no_avatar,
                reaction_type: r.reaction_type,
                active_hours_start: r.active_hours_start,
                active_hours_end: r.active_hours_end,
                active_days: r.active_days,
            },
        })
        .collect();

    let pods = db::list_pods(conn)?
        .into_iter()
        .map(|p| PodExport {
            old_id: p.id,
            enabled: p.enabled,
            new: db::NewPod {
                name: p.name,
                description: p.description,
                window_hours: p.window_hours,
                daily_limit_per_member: p.daily_limit_per_member,
                min_delay_sec: p.min_delay_sec,
                max_delay_sec: p.max_delay_sec,
                actions: p.actions,
                comment_pool: p.comment_pool,
            },
        })
        .collect();

    let pod_members = db::list_all_pod_members(conn)?
        .into_iter()
        .map(|m| PodMemberExport {
            old_pod_id: m.pod_id,
            old_profile_id: m.profile_id,
        })
        .collect();

    let blacklist = db::list_blacklist(conn)?
        .into_iter()
        .map(|b| BlacklistExport {
            old_profile_id: b.profile_id,
            username: b.username,
        })
        .collect();

    Ok(BackupBundle {
        version: 1,
        exported_at: chrono::Utc::now().to_rfc3339(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        proxies,
        groups,
        profiles,
        rules,
        campaigns,
        campaign_rules,
        pods,
        pod_members,
        blacklist,
        settings: db::get_settings(conn),
    })
}

/// Always additive — every entity is re-created as a brand-new row with a fresh
/// id, never merged with or overwriting existing data. The one exception is
/// global settings, which fully replace the current app_settings bundle, and
/// only if `include_settings` is set. Runs inside a single transaction so a
/// failure partway through (e.g. malformed input) rolls back cleanly instead
/// of leaving partially-linked rows behind.
pub fn import_bundle(
    conn: &mut Connection,
    bundle: &BackupBundle,
    include_settings: bool,
) -> rusqlite::Result<ImportSummary> {
    let tx = conn.transaction()?;

    let mut proxy_ids: HashMap<String, String> = HashMap::new();
    for item in &bundle.proxies {
        let created = db::insert_proxy(&tx, &item.data)?;
        proxy_ids.insert(item.old_id.clone(), created.id);
    }

    let mut group_ids: HashMap<String, String> = HashMap::new();
    for item in &bundle.groups {
        let created = db::insert_group(&tx, &item.data)?;
        group_ids.insert(item.old_id.clone(), created.id);
    }

    let mut profile_ids: HashMap<String, String> = HashMap::new();
    for p in &bundle.profiles {
        let new = db::NewProfile {
            platform: p.new.platform.clone(),
            display_name: p.new.display_name.clone(),
            username: p.new.username.clone(),
            proxy_id: p.new.proxy_id.as_ref().and_then(|old| proxy_ids.get(old).cloned()),
            device_name: p.new.device_name.clone(),
        };
        let fp = crate::fingerprint::Fingerprint {
            user_agent: p.user_agent.clone(),
            timezone: p.timezone.clone(),
            locale: p.locale.clone(),
            viewport_width: p.viewport_width,
            viewport_height: p.viewport_height,
        };
        let created = db::insert_profile(&tx, &new, &fp)?;
        if let Some(new_group_id) = p.old_group_id.as_ref().and_then(|old| group_ids.get(old)) {
            db::set_profile_group(&tx, &created.id, Some(new_group_id))?;
        }
        if !p.enabled {
            db::set_profile_enabled(&tx, &created.id, false)?;
        }
        profile_ids.insert(p.old_id.clone(), created.id);
    }

    let mut rules_count = 0usize;
    for r in &bundle.rules {
        let Some(new_profile_id) = profile_ids.get(&r.old_profile_id) else { continue };
        let new_rule = db::NewActionRule {
            profile_id: new_profile_id.clone(),
            action_type: r.new.action_type.clone(),
            daily_limit: r.new.daily_limit,
            min_delay_sec: r.new.min_delay_sec,
            max_delay_sec: r.new.max_delay_sec,
            target_source: r.new.target_source.clone(),
            comment_pool: r.new.comment_pool.clone(),
            source_type: r.new.source_type.clone(),
            source_seed: r.new.source_seed.clone(),
            dm_message: r.new.dm_message.clone(),
            filter_skip_no_avatar: r.new.filter_skip_no_avatar,
            reaction_type: r.new.reaction_type.clone(),
            sequence_steps: r.new.sequence_steps.clone(),
            active_hours_start: r.new.active_hours_start,
            active_hours_end: r.new.active_hours_end,
            active_days: r.new.active_days.clone(),
        };
        let created = db::insert_rule(&tx, &new_rule)?;
        if !r.enabled {
            db::set_rule_enabled(&tx, &created.id, false)?;
        }
        rules_count += 1;
    }

    let mut campaign_ids: HashMap<String, String> = HashMap::new();
    for c in &bundle.campaigns {
        let created = db::insert_campaign(&tx, &c.new)?;
        if !c.enabled {
            db::set_campaign_enabled(&tx, &created.id, false)?;
        }
        campaign_ids.insert(c.old_id.clone(), created.id);
    }

    let mut campaign_rules_count = 0usize;
    for cr in &bundle.campaign_rules {
        let Some(new_campaign_id) = campaign_ids.get(&cr.old_campaign_id) else { continue };
        let new_cr = db::NewCampaignRule {
            campaign_id: new_campaign_id.clone(),
            action_type: cr.new.action_type.clone(),
            daily_limit: cr.new.daily_limit,
            min_delay_sec: cr.new.min_delay_sec,
            max_delay_sec: cr.new.max_delay_sec,
            target_source: cr.new.target_source.clone(),
            comment_pool: cr.new.comment_pool.clone(),
            source_type: cr.new.source_type.clone(),
            source_seed: cr.new.source_seed.clone(),
            dm_message: cr.new.dm_message.clone(),
            filter_skip_no_avatar: cr.new.filter_skip_no_avatar,
            reaction_type: cr.new.reaction_type.clone(),
            active_hours_start: cr.new.active_hours_start,
            active_hours_end: cr.new.active_hours_end,
            active_days: cr.new.active_days.clone(),
        };
        db::insert_campaign_rule(&tx, &new_cr)?;
        campaign_rules_count += 1;
    }

    let mut pod_ids: HashMap<String, String> = HashMap::new();
    for p in &bundle.pods {
        let created = db::insert_pod(&tx, &p.new)?;
        if !p.enabled {
            db::set_pod_enabled(&tx, &created.id, false)?;
        }
        pod_ids.insert(p.old_id.clone(), created.id);
    }

    let mut pod_members_count = 0usize;
    for m in &bundle.pod_members {
        let (Some(new_pod_id), Some(new_profile_id)) =
            (pod_ids.get(&m.old_pod_id), profile_ids.get(&m.old_profile_id))
        else {
            continue;
        };
        db::add_pod_member(&tx, new_pod_id, new_profile_id)?;
        pod_members_count += 1;
    }

    let mut blacklist_count = 0usize;
    for b in &bundle.blacklist {
        let new_profile_id = match &b.old_profile_id {
            Some(old) => match profile_ids.get(old) {
                Some(id) => Some(id.as_str()),
                None => continue,
            },
            None => None,
        };
        db::add_blacklist_entry(&tx, new_profile_id, &b.username)?;
        blacklist_count += 1;
    }

    let settings_imported = if include_settings {
        db::save_settings(&tx, &bundle.settings)?;
        true
    } else {
        false
    };

    tx.commit()?;

    Ok(ImportSummary {
        proxies: proxy_ids.len(),
        groups: group_ids.len(),
        profiles: profile_ids.len(),
        rules: rules_count,
        campaigns: campaign_ids.len(),
        campaign_rules: campaign_rules_count,
        pods: pod_ids.len(),
        pod_members: pod_members_count,
        blacklist: blacklist_count,
        settings_imported,
    })
}

// ---------- Per-section (scoped) export/import ----------
//
// Unlike `BackupBundle`, these cover just one management page's own data (plus
// its direct dependents, e.g. rules for profiles). Ids for entities INSIDE the
// exported scope are still freshly generated and remapped on import, exactly
// like the full bundle. Cross-references to entities OUTSIDE the scope (e.g. a
// profile's proxy_id when exporting only Profiles) are resolved by checking
// whether that same id still exists in the current database — not remapped —
// since those rows aren't being recreated by this import.

#[derive(Serialize, Deserialize)]
pub struct ProfilesBundle {
    pub version: u32,
    pub exported_at: String,
    pub profiles: Vec<ProfileExport>,
    pub rules: Vec<RuleExport>,
}

#[derive(Serialize)]
pub struct ProfilesImportSummary {
    pub profiles: usize,
    pub rules: usize,
}

pub fn export_profiles_bundle(conn: &Connection) -> rusqlite::Result<ProfilesBundle> {
    let full = export_bundle(conn)?;
    Ok(ProfilesBundle {
        version: 1,
        exported_at: full.exported_at,
        profiles: full.profiles,
        rules: full.rules,
    })
}

pub fn import_profiles_bundle(
    conn: &mut Connection,
    bundle: &ProfilesBundle,
) -> rusqlite::Result<ProfilesImportSummary> {
    let tx = conn.transaction()?;

    let mut profile_ids: HashMap<String, String> = HashMap::new();
    for p in &bundle.profiles {
        let proxy_id = match &p.new.proxy_id {
            Some(old) => db::get_proxy(&tx, old)?.map(|_| old.clone()),
            None => None,
        };
        let group_id = match &p.old_group_id {
            Some(old) => db::get_group(&tx, old)?.map(|_| old.clone()),
            None => None,
        };
        let new = db::NewProfile {
            platform: p.new.platform.clone(),
            display_name: p.new.display_name.clone(),
            username: p.new.username.clone(),
            proxy_id,
            device_name: p.new.device_name.clone(),
        };
        let fp = crate::fingerprint::Fingerprint {
            user_agent: p.user_agent.clone(),
            timezone: p.timezone.clone(),
            locale: p.locale.clone(),
            viewport_width: p.viewport_width,
            viewport_height: p.viewport_height,
        };
        let created = db::insert_profile(&tx, &new, &fp)?;
        if group_id.is_some() {
            db::set_profile_group(&tx, &created.id, group_id.as_deref())?;
        }
        if !p.enabled {
            db::set_profile_enabled(&tx, &created.id, false)?;
        }
        profile_ids.insert(p.old_id.clone(), created.id);
    }

    let mut rules_count = 0usize;
    for r in &bundle.rules {
        let Some(new_profile_id) = profile_ids.get(&r.old_profile_id) else { continue };
        let new_rule = db::NewActionRule {
            profile_id: new_profile_id.clone(),
            action_type: r.new.action_type.clone(),
            daily_limit: r.new.daily_limit,
            min_delay_sec: r.new.min_delay_sec,
            max_delay_sec: r.new.max_delay_sec,
            target_source: r.new.target_source.clone(),
            comment_pool: r.new.comment_pool.clone(),
            source_type: r.new.source_type.clone(),
            source_seed: r.new.source_seed.clone(),
            dm_message: r.new.dm_message.clone(),
            filter_skip_no_avatar: r.new.filter_skip_no_avatar,
            reaction_type: r.new.reaction_type.clone(),
            sequence_steps: r.new.sequence_steps.clone(),
            active_hours_start: r.new.active_hours_start,
            active_hours_end: r.new.active_hours_end,
            active_days: r.new.active_days.clone(),
        };
        let created = db::insert_rule(&tx, &new_rule)?;
        if !r.enabled {
            db::set_rule_enabled(&tx, &created.id, false)?;
        }
        rules_count += 1;
    }

    tx.commit()?;
    Ok(ProfilesImportSummary {
        profiles: profile_ids.len(),
        rules: rules_count,
    })
}

#[derive(Serialize, Deserialize)]
pub struct CampaignsBundle {
    pub version: u32,
    pub exported_at: String,
    pub campaigns: Vec<CampaignExport>,
    pub campaign_rules: Vec<CampaignRuleExport>,
}

#[derive(Serialize)]
pub struct CampaignsImportSummary {
    pub campaigns: usize,
    pub campaign_rules: usize,
}

pub fn export_campaigns_bundle(conn: &Connection) -> rusqlite::Result<CampaignsBundle> {
    let full = export_bundle(conn)?;
    Ok(CampaignsBundle {
        version: 1,
        exported_at: full.exported_at,
        campaigns: full.campaigns,
        campaign_rules: full.campaign_rules,
    })
}

pub fn import_campaigns_bundle(
    conn: &mut Connection,
    bundle: &CampaignsBundle,
) -> rusqlite::Result<CampaignsImportSummary> {
    let tx = conn.transaction()?;

    let mut campaign_ids: HashMap<String, String> = HashMap::new();
    for c in &bundle.campaigns {
        let created = db::insert_campaign(&tx, &c.new)?;
        if !c.enabled {
            db::set_campaign_enabled(&tx, &created.id, false)?;
        }
        campaign_ids.insert(c.old_id.clone(), created.id);
    }

    let mut campaign_rules_count = 0usize;
    for cr in &bundle.campaign_rules {
        let Some(new_campaign_id) = campaign_ids.get(&cr.old_campaign_id) else { continue };
        let new_cr = db::NewCampaignRule {
            campaign_id: new_campaign_id.clone(),
            action_type: cr.new.action_type.clone(),
            daily_limit: cr.new.daily_limit,
            min_delay_sec: cr.new.min_delay_sec,
            max_delay_sec: cr.new.max_delay_sec,
            target_source: cr.new.target_source.clone(),
            comment_pool: cr.new.comment_pool.clone(),
            source_type: cr.new.source_type.clone(),
            source_seed: cr.new.source_seed.clone(),
            dm_message: cr.new.dm_message.clone(),
            filter_skip_no_avatar: cr.new.filter_skip_no_avatar,
            reaction_type: cr.new.reaction_type.clone(),
            active_hours_start: cr.new.active_hours_start,
            active_hours_end: cr.new.active_hours_end,
            active_days: cr.new.active_days.clone(),
        };
        db::insert_campaign_rule(&tx, &new_cr)?;
        campaign_rules_count += 1;
    }

    tx.commit()?;
    Ok(CampaignsImportSummary {
        campaigns: campaign_ids.len(),
        campaign_rules: campaign_rules_count,
    })
}

#[derive(Serialize, Deserialize)]
pub struct PodsBundle {
    pub version: u32,
    pub exported_at: String,
    pub pods: Vec<PodExport>,
    pub pod_members: Vec<PodMemberExport>,
}

#[derive(Serialize)]
pub struct PodsImportSummary {
    pub pods: usize,
    pub pod_members: usize,
}

pub fn export_pods_bundle(conn: &Connection) -> rusqlite::Result<PodsBundle> {
    let full = export_bundle(conn)?;
    Ok(PodsBundle {
        version: 1,
        exported_at: full.exported_at,
        pods: full.pods,
        pod_members: full.pod_members,
    })
}

pub fn import_pods_bundle(conn: &mut Connection, bundle: &PodsBundle) -> rusqlite::Result<PodsImportSummary> {
    let tx = conn.transaction()?;

    let mut pod_ids: HashMap<String, String> = HashMap::new();
    for p in &bundle.pods {
        let created = db::insert_pod(&tx, &p.new)?;
        if !p.enabled {
            db::set_pod_enabled(&tx, &created.id, false)?;
        }
        pod_ids.insert(p.old_id.clone(), created.id);
    }

    let mut pod_members_count = 0usize;
    for m in &bundle.pod_members {
        let Some(new_pod_id) = pod_ids.get(&m.old_pod_id) else { continue };
        // profile isn't part of this import — only usable if it still exists as-is
        let Some(profile) = db::get_profile(&tx, &m.old_profile_id)? else { continue };
        db::add_pod_member(&tx, new_pod_id, &profile.id)?;
        pod_members_count += 1;
    }

    tx.commit()?;
    Ok(PodsImportSummary {
        pods: pod_ids.len(),
        pod_members: pod_members_count,
    })
}

#[derive(Serialize, Deserialize)]
pub struct ProxiesBundle {
    pub version: u32,
    pub exported_at: String,
    pub proxies: Vec<IdTagged<db::NewProxy>>,
}

#[derive(Serialize)]
pub struct ProxiesImportSummary {
    pub proxies: usize,
}

pub fn export_proxies_bundle(conn: &Connection) -> rusqlite::Result<ProxiesBundle> {
    let full = export_bundle(conn)?;
    Ok(ProxiesBundle {
        version: 1,
        exported_at: full.exported_at,
        proxies: full.proxies,
    })
}

pub fn import_proxies_bundle(
    conn: &mut Connection,
    bundle: &ProxiesBundle,
) -> rusqlite::Result<ProxiesImportSummary> {
    let tx = conn.transaction()?;
    for item in &bundle.proxies {
        db::insert_proxy(&tx, &item.data)?;
    }
    tx.commit()?;
    Ok(ProxiesImportSummary {
        proxies: bundle.proxies.len(),
    })
}

#[derive(Serialize, Deserialize)]
pub struct BlacklistBundle {
    pub version: u32,
    pub exported_at: String,
    pub blacklist: Vec<BlacklistExport>,
}

#[derive(Serialize)]
pub struct BlacklistImportSummary {
    pub blacklist: usize,
}

pub fn export_blacklist_bundle(conn: &Connection) -> rusqlite::Result<BlacklistBundle> {
    let full = export_bundle(conn)?;
    Ok(BlacklistBundle {
        version: 1,
        exported_at: full.exported_at,
        blacklist: full.blacklist,
    })
}

pub fn import_blacklist_bundle(
    conn: &mut Connection,
    bundle: &BlacklistBundle,
) -> rusqlite::Result<BlacklistImportSummary> {
    let tx = conn.transaction()?;
    let mut count = 0usize;
    for b in &bundle.blacklist {
        let profile_id = match &b.old_profile_id {
            Some(old) => db::get_profile(&tx, old)?.map(|_| old.clone()),
            None => None,
        };
        db::add_blacklist_entry(&tx, profile_id.as_deref(), &b.username)?;
        count += 1;
    }
    tx.commit()?;
    Ok(BlacklistImportSummary { blacklist: count })
}
