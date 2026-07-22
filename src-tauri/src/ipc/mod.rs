use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;

use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{oneshot, Mutex, OnceCell};

type PendingMap = Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>>;

pub struct SidecarClient {
    stdin: Mutex<tokio::process::ChildStdin>,
    pending: PendingMap,
    _child: Mutex<Child>,
}

static CLIENT: OnceCell<Arc<SidecarClient>> = OnceCell::const_new();

impl SidecarClient {
    pub async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id.clone(), tx);

        let request = serde_json::json!({ "id": id, "method": method, "params": params });
        let line = format!("{request}\n");
        self.stdin
            .lock()
            .await
            .write_all(line.as_bytes())
            .await
            .map_err(|e| e.to_string())?;

        rx.await.map_err(|_| "sidecar closed connection".to_string())?
    }
}

/// In dev, `node` is resolved from PATH and the script runs straight out of the
/// sidecar package's build output next to src-tauri.
pub fn dev_sidecar_paths() -> (PathBuf, PathBuf) {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let script = Path::new(manifest_dir).join("../sidecar/dist/index.js");
    (PathBuf::from("node"), script)
}

/// In a packaged build, a vendored Node binary ships as a Tauri externalBin
/// (see `bundle.externalBin` in tauri.conf.json), and the sidecar's JS + node_modules
/// ship as bundle resources. Both are copied to predictable locations relative to
/// the running app: the binary next to the main executable, resources under the
/// app's resource directory.
pub fn prod_sidecar_paths(resource_dir: &Path) -> (PathBuf, PathBuf) {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .expect("resolve current exe dir");
    let bin_name = if cfg!(windows) { "jarveeauto-node.exe" } else { "jarveeauto-node" };
    let node = exe_dir.join(bin_name);
    let script = resource_dir.join("sidecar/dist/index.js");
    (node, script)
}

async fn spawn_client(exe: PathBuf, script: PathBuf) -> Arc<SidecarClient> {
    let mut child = Command::new(&exe)
        .arg(&script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap_or_else(|e| panic!("failed to spawn sidecar ({exe:?} {script:?}): {e}"));

    let stdin = child.stdin.take().expect("sidecar stdin not piped");
    let stdout = child.stdout.take().expect("sidecar stdout not piped");
    let stderr = child.stderr.take().expect("sidecar stderr not piped");

    let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));

    let pending_reader = pending.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let Ok(value) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            let Some(id) = value.get("id").and_then(|v| v.as_str()) else {
                continue;
            };
            if let Some(tx) = pending_reader.lock().await.remove(id) {
                if let Some(err) = value.get("error") {
                    let msg = err
                        .get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("sidecar error")
                        .to_string();
                    let _ = tx.send(Err(msg));
                } else {
                    let _ = tx.send(Ok(value.get("result").cloned().unwrap_or(Value::Null)));
                }
            }
        }
    });

    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[sidecar] {line}");
        }
    });

    Arc::new(SidecarClient {
        stdin: Mutex::new(stdin),
        pending,
        _child: Mutex::new(child),
    })
}

/// Lazily spawns the sidecar on first use. `exe`/`script` are only consulted the
/// very first time this resolves (whichever caller gets there first); every
/// subsequent call reuses the same running process regardless of the paths passed.
pub async fn client(exe: &Path, script: &Path) -> Arc<SidecarClient> {
    let exe = exe.to_path_buf();
    let script = script.to_path_buf();
    CLIENT.get_or_init(|| spawn_client(exe, script)).await.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn ping_roundtrip() {
        let (exe, script) = dev_sidecar_paths();
        let client = client(&exe, &script).await;
        let result = client.call("ping", serde_json::json!({})).await.unwrap();
        assert_eq!(result.get("pong").and_then(|v| v.as_bool()), Some(true));
    }
}
