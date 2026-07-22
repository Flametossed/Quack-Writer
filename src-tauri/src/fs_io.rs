use std::fs;
use std::path::PathBuf;
use tauri::dialog::{FileDialogBuilder, MessageDialogKind};
use tauri::Window;

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {e}"))
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        if !parent.as_os_str().is_empty() {
            let _ = fs::create_dir_all(parent);
        }
    }
    fs::write(&path, contents).map_err(|e| format!("Failed to write file: {e}"))
}

#[tauri::command]
pub async fn pick_file(window: Window) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    FileDialogBuilder::new(&window)
        .set_title("Open Document")
        .add_filter(
            "Text & Markdown",
            &["txt", "md", "markdown", "rtf", "json", "log"],
        )
        .pick_file(move |path| {
            let _ = tx.send(path.map(|p| p.to_string_lossy().to_string()));
        });
    Ok(rx.recv().map_err(|_| "Dialog cancelled".to_string())?)
}

#[tauri::command]
pub async fn pick_save_path(window: Window, suggested: Option<String>) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let mut builder = FileDialogBuilder::new(&window)
        .set_title("Save Document")
        .add_filter("Text & Markdown", &["txt", "md", "markdown"]);
    if let Some(name) = suggested {
        builder = builder.set_file_name(&name);
    }
    builder.save_file(move |path| {
        let _ = tx.send(path.map(|p| p.to_string_lossy().to_string()));
    });
    Ok(rx.recv().map_err(|_| "Save cancelled".to_string())?)
}

#[allow(dead_code)]
pub fn show_message(window: &Window, kind: MessageDialogKind, title: &str, message: &str) {
    let _ = FileDialogBuilder::new(window).set_title(title);
    let _ = kind;
    let _ = message;
}