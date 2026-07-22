use std::path::PathBuf;

use crate::db::Db;

pub struct AppState {
    pub db: Db,
    pub app_data_dir: PathBuf,
}
