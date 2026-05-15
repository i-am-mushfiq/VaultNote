use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_file: bool,
    pub is_directory: bool,
    pub modified: Option<u64>,
    pub size: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileChangeEvent {
    pub paths: Vec<String>,
    pub kind: String,
}

struct WatcherState(Mutex<Option<Debouncer<RecommendedWatcher>>>);

// ── File system commands ──────────────────────────────────────────────────────

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directories: {}", e))?;
    }
    // Atomic-ish write: write to temp file then rename
    let tmp = format!("{}.tmp", path);
    fs::write(&tmp, &content).map_err(|e| format!("Failed to write temp file: {}", e))?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Failed to save {}: {}", path, e)
    })
}

#[tauri::command]
fn read_dir(path: String) -> Result<Vec<DirEntryInfo>, String> {
    let entries =
        fs::read_dir(&path).map_err(|e| format!("Failed to read directory {}: {}", path, e))?;

    let mut result = Vec::new();
    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let name = entry.file_name().to_string_lossy().to_string();
        // Skip hidden files/dirs (starting with .)
        if name.starts_with('.') {
            continue;
        }
        let entry_path = entry.path().to_string_lossy().to_string();
        result.push(DirEntryInfo {
            name,
            path: entry_path,
            is_file: metadata.is_file(),
            is_directory: metadata.is_dir(),
            modified: metadata
                .modified()
                .ok()
                .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs()),
            size: metadata.is_file().then(|| metadata.len()),
        });
    }

    result.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(result)
}

#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory {}: {}", path, e))
}

#[tauri::command]
fn remove_path(path: String, recursive: bool) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        if recursive {
            fs::remove_dir_all(&path)
        } else {
            fs::remove_dir(&path)
        }
    } else {
        fs::remove_file(&path)
    }
    .map_err(|e| format!("Failed to remove {}: {}", path, e))
}

#[tauri::command]
fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Failed to rename {} to {}: {}", old_path, new_path, e))
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn copy_file(src: String, dst: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&dst).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(&src, &dst)
        .map(|_| ())
        .map_err(|e| format!("Failed to copy {} to {}: {}", src, dst, e))
}

#[tauri::command]
fn get_file_info(path: String) -> Result<DirEntryInfo, String> {
    let p = Path::new(&path);
    let metadata =
        fs::metadata(&path).map_err(|e| format!("Failed to stat {}: {}", path, e))?;
    let name = p
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    Ok(DirEntryInfo {
        name,
        path: path.clone(),
        is_file: metadata.is_file(),
        is_directory: metadata.is_dir(),
        modified: metadata
            .modified()
            .ok()
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs()),
        size: metadata.is_file().then(|| metadata.len()),
    })
}

// ── File watcher commands ─────────────────────────────────────────────────────

#[tauri::command]
fn watch_vault(
    path: String,
    app_handle: AppHandle,
    watcher_state: State<WatcherState>,
) -> Result<(), String> {
    let mut state = watcher_state.0.lock().unwrap();
    // Drop any existing watcher
    *state = None;

    let handle = app_handle.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        move |res: DebounceEventResult| {
            if let Ok(events) = res {
                let paths: Vec<String> = events
                    .iter()
                    .map(|e| e.path.to_string_lossy().to_string())
                    .collect();
                if !paths.is_empty() {
                    let _ = handle.emit(
                        "vault-file-change",
                        FileChangeEvent {
                            paths,
                            kind: "change".to_string(),
                        },
                    );
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watcher()
        .watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    *state = Some(debouncer);
    Ok(())
}

#[tauri::command]
fn unwatch_vault(watcher_state: State<WatcherState>) {
    *watcher_state.0.lock().unwrap() = None;
}

// ── App entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WatcherState(Mutex::new(None)))
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            read_dir,
            create_dir,
            remove_path,
            rename_path,
            path_exists,
            copy_file,
            get_file_info,
            watch_vault,
            unwatch_vault,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
