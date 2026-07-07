mod forklift;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            forklift::detect_binary,
            forklift::install_forklift,
            forklift::run_json,
            forklift::run_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
