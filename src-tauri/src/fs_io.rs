use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::Window;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

/// Read a file as text. Non-UTF-8 content (e.g. legacy ANSI files) is decoded
/// lossily so the file still opens; a leading BOM is stripped.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {e}"))?;
    let text = String::from_utf8_lossy(&bytes);
    Ok(text.strip_prefix('\u{feff}').unwrap_or(&text).to_string())
}

/// Atomic write: write to a temp file in the same directory, then rename over
/// the target so a crash mid-write never corrupts the user's document.
#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
        }
    }
    let tmp = match target.file_name() {
        Some(name) => target.with_file_name(format!("{}.quack-tmp", name.to_string_lossy())),
        None => return Err("Invalid file path".to_string()),
    };
    fs::write(&tmp, contents.as_bytes()).map_err(|e| format!("Failed to write file: {e}"))?;
    fs::rename(&tmp, &target).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Failed to save file: {e}")
    })
}

/// Extensions shown in the Explorer tree and file dialogs.
const TEXT_EXTENSIONS: [&str; 5] = ["md", "markdown", "txt", "log", "json"];

fn has_text_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| TEXT_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

/// Shallow directory listing for the Explorer tree: folders plus text-like
/// files, hidden entries skipped, folders first then case-insensitive by name.
#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let rd = fs::read_dir(&path).map_err(|e| format!("Failed to read folder: {e}"))?;
    let mut out: Vec<DirEntry> = Vec::new();
    for entry in rd.flatten() {
        let p = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let is_dir = p.is_dir();
        if !is_dir && !has_text_extension(&p) {
            continue;
        }
        out.push(DirEntry {
            name,
            path: p.to_string_lossy().to_string(),
            is_dir,
        });
    }
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

/// Rename a file in place (same directory). Returns the new full path.
#[tauri::command]
pub fn rename_file(path: String, new_name: String) -> Result<String, String> {
    if new_name.contains('/') || new_name.contains('\\') {
        return Err("Name can't contain path separators".to_string());
    }
    if new_name.trim().is_empty() {
        return Err("Name can't be empty".to_string());
    }
    let target = PathBuf::from(&path);
    let parent = target
        .parent()
        .ok_or_else(|| "Invalid file path".to_string())?;
    let dest = parent.join(&new_name);
    if dest.exists() {
        return Err(format!("\"{new_name}\" already exists here"));
    }
    fs::rename(&target, &dest).map_err(|e| format!("Failed to rename: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}

/// Move a text file into a folder in the open workspace. The source may be an
/// externally opened document, but the destination is workspace-bound.
/// Existing files are never overwritten.
#[tauri::command]
pub fn move_file(
    path: String,
    destination_dir: String,
    workspace_root: String,
) -> Result<String, String> {
    let source_input = PathBuf::from(&path);
    let destination_input = PathBuf::from(&destination_dir);
    let source = fs::canonicalize(&source_input)
        .map_err(|e| format!("Failed to locate the source file: {e}"))?;
    let destination = fs::canonicalize(&destination_input)
        .map_err(|e| format!("Failed to locate the destination folder: {e}"))?;
    let workspace = fs::canonicalize(&workspace_root)
        .map_err(|e| format!("Failed to locate the workspace: {e}"))?;

    if !destination.starts_with(&workspace) {
        return Err("Files can only be moved into the open workspace".to_string());
    }
    if !source.is_file() {
        return Err("The dragged item is not a file".to_string());
    }
    if !destination.is_dir() {
        return Err("The drop target is not a folder".to_string());
    }
    if !has_text_extension(&source) {
        return Err("Only supported writing files can be moved".to_string());
    }
    if source.parent() == Some(destination.as_path()) {
        return Err("The file is already in this folder".to_string());
    }

    let file_name = source
        .file_name()
        .ok_or_else(|| "Invalid source file path".to_string())?;
    // Return a normal UI path rather than the extended path representation
    // produced by canonicalize on Windows.
    let target = destination_input.join(file_name);
    if target.exists() {
        return Err(format!(
            "\"{}\" already exists in that folder",
            file_name.to_string_lossy()
        ));
    }

    fs::rename(&source, &target).map_err(|e| format!("Failed to move file: {e}"))?;
    Ok(target.to_string_lossy().to_string())
}

/// Create a new writing file in a workspace folder. `create_new` makes the
/// collision check atomic so a drop can never overwrite an existing file.
#[tauri::command]
pub fn create_text_file(
    destination_dir: String,
    name: String,
    contents: String,
    workspace_root: String,
) -> Result<String, String> {
    if name.contains('/') || name.contains('\\') || name.trim().is_empty() {
        return Err("Invalid file name".to_string());
    }
    if !has_text_extension(Path::new(&name)) {
        return Err("Only supported writing files can be added".to_string());
    }

    let destination_input = PathBuf::from(&destination_dir);
    let destination = fs::canonicalize(&destination_input)
        .map_err(|e| format!("Failed to locate the destination folder: {e}"))?;
    let workspace = fs::canonicalize(&workspace_root)
        .map_err(|e| format!("Failed to locate the workspace: {e}"))?;
    if !destination.starts_with(&workspace) {
        return Err("Files can only be created in the open workspace".to_string());
    }
    if !destination.is_dir() {
        return Err("The drop target is not a folder".to_string());
    }

    let target = destination_input.join(&name);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|error| {
            if target.exists() {
                format!("\"{name}\" already exists in that folder")
            } else {
                format!("Failed to create file: {error}")
            }
        })?;
    if let Err(error) = file.write_all(contents.as_bytes()) {
        drop(file);
        let _ = fs::remove_file(&target);
        return Err(format!("Failed to write file: {error}"));
    }

    Ok(target.to_string_lossy().to_string())
}

/// Create a named subfolder inside the open workspace without replacing an
/// existing file or folder.
#[tauri::command]
pub fn create_folder(
    parent_dir: String,
    name: String,
    workspace_root: String,
) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err("Invalid folder name".to_string());
    }

    let parent_input = PathBuf::from(&parent_dir);
    let parent = fs::canonicalize(&parent_input)
        .map_err(|e| format!("Failed to locate the parent folder: {e}"))?;
    let workspace = fs::canonicalize(&workspace_root)
        .map_err(|e| format!("Failed to locate the workspace: {e}"))?;
    if !parent.starts_with(&workspace) {
        return Err("Folders can only be created in the open workspace".to_string());
    }
    if !parent.is_dir() {
        return Err("The selected parent is not a folder".to_string());
    }

    let target = parent_input.join(name);
    fs::create_dir(&target).map_err(|error| {
        if target.exists() {
            format!("\"{name}\" already exists in that folder")
        } else {
            format!("Failed to create folder: {error}")
        }
    })?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn pick_folder(window: Window) -> Result<Option<String>, String> {
    let path = window
        .dialog()
        .file()
        .set_title("Open Folder")
        .blocking_pick_folder();
    Ok(path.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn pick_file(window: Window) -> Result<Option<String>, String> {
    let path = window
        .dialog()
        .file()
        .set_title("Open Document")
        .add_filter("Text & Markdown", &TEXT_EXTENSIONS)
        .blocking_pick_file();
    Ok(path.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn pick_save_path(
    window: Window,
    suggested: Option<String>,
) -> Result<Option<String>, String> {
    let mut builder = window
        .dialog()
        .file()
        .set_title("Save Document")
        .add_filter("Text & Markdown", &["txt", "md", "markdown"]);
    if let Some(name) = suggested {
        builder = builder.set_file_name(name);
    }
    Ok(builder.blocking_save_file().map(|p| p.to_string()))
}

/// Native OK/Cancel confirmation dialog. Returns true when the user confirms.
#[tauri::command]
pub async fn ask_confirm(window: Window, title: String, message: String) -> Result<bool, String> {
    Ok(window
        .dialog()
        .message(message)
        .title(title)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn move_file_never_overwrites_and_then_moves_successfully() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let workspace = std::env::temp_dir().join(format!(
            "quack-writer-move-test-{}-{nonce}",
            std::process::id()
        ));
        let source_dir = workspace.join("drafts");
        let destination = workspace.join("finished");
        fs::create_dir_all(&source_dir).expect("create source folder");
        fs::create_dir_all(&destination).expect("create destination folder");

        let source = source_dir.join("chapter.md");
        let existing = destination.join("chapter.md");
        fs::write(&source, "new draft").expect("write source");
        fs::write(&existing, "existing draft").expect("write destination");

        let error = move_file(
            source.to_string_lossy().to_string(),
            destination.to_string_lossy().to_string(),
            workspace.to_string_lossy().to_string(),
        )
        .expect_err("an existing destination must block the move");
        assert!(error.contains("already exists"));
        assert_eq!(fs::read_to_string(&source).unwrap(), "new draft");
        assert_eq!(fs::read_to_string(&existing).unwrap(), "existing draft");

        fs::remove_file(&existing).expect("remove collision");
        let moved = move_file(
            source.to_string_lossy().to_string(),
            destination.to_string_lossy().to_string(),
            workspace.to_string_lossy().to_string(),
        )
        .expect("move should succeed");
        assert!(!source.exists());
        assert_eq!(PathBuf::from(moved), existing);
        assert_eq!(fs::read_to_string(&existing).unwrap(), "new draft");

        fs::remove_dir_all(workspace).expect("clean up test workspace");
    }

    #[test]
    fn open_and_scratch_documents_can_be_added_to_a_workspace() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let test_root = std::env::temp_dir().join(format!(
            "quack-writer-open-doc-test-{}-{nonce}",
            std::process::id()
        ));
        let workspace = test_root.join("workspace");
        let destination = workspace.join("chapters");
        fs::create_dir_all(&destination).expect("create workspace folder");

        let external = test_root.join("outside.md");
        fs::write(&external, "external document").expect("write external source");
        let moved = move_file(
            external.to_string_lossy().to_string(),
            destination.to_string_lossy().to_string(),
            workspace.to_string_lossy().to_string(),
        )
        .expect("an open external document can move into the workspace");
        assert!(!external.exists());
        assert_eq!(fs::read_to_string(moved).unwrap(), "external document");

        let created = create_text_file(
            destination.to_string_lossy().to_string(),
            "scratch.md".to_string(),
            "scratch document".to_string(),
            workspace.to_string_lossy().to_string(),
        )
        .expect("a scratch document can be created in the workspace");
        assert_eq!(fs::read_to_string(&created).unwrap(), "scratch document");
        let collision = create_text_file(
            destination.to_string_lossy().to_string(),
            "scratch.md".to_string(),
            "replacement".to_string(),
            workspace.to_string_lossy().to_string(),
        )
        .expect_err("creating a scratch document must not overwrite a file");
        assert!(collision.contains("already exists"));
        assert_eq!(fs::read_to_string(created).unwrap(), "scratch document");

        let folder = create_folder(
            destination.to_string_lossy().to_string(),
            "Scenes".to_string(),
            workspace.to_string_lossy().to_string(),
        )
        .expect("a subfolder can be created in the workspace");
        assert!(PathBuf::from(&folder).is_dir());
        let folder_collision = create_folder(
            destination.to_string_lossy().to_string(),
            "Scenes".to_string(),
            workspace.to_string_lossy().to_string(),
        )
        .expect_err("creating a subfolder must not replace an existing entry");
        assert!(folder_collision.contains("already exists"));

        fs::remove_dir_all(test_root).expect("clean up test workspace");
    }
}
