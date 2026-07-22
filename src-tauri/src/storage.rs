use std::path::{Path, PathBuf};

pub fn enc_path(app_data_dir: &Path, profile_id: &str) -> PathBuf {
    app_data_dir.join("storage_states").join(format!("{profile_id}.enc"))
}

pub fn tmp_plain_path(app_data_dir: &Path, profile_id: &str) -> PathBuf {
    app_data_dir.join("tmp").join(format!("{profile_id}.json"))
}
