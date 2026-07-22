mod fs_io;
mod spell;

#[cfg(debug_assertions)]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            #[cfg(not(debug_assertions))]
            {
                let _ = app;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fs_io::read_text_file,
            fs_io::write_text_file,
            fs_io::pick_file,
            fs_io::pick_save_path,
            fs_io::pick_folder,
            fs_io::list_dir,
            fs_io::rename_file,
            fs_io::move_file,
            fs_io::create_text_file,
            fs_io::create_folder,
            fs_io::ask_confirm,
            spell::spell_suggest,
            spell::spell_add_word,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Quack Writer");
}
