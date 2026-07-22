mod fs_io;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fs_io::read_text_file,
            fs_io::write_text_file,
            fs_io::pick_file,
            fs_io::pick_save_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Quack Writer");
}