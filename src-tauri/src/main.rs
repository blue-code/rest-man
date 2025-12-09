// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

// Request and Response structures
#[derive(Debug, Clone, Serialize, Deserialize)]
struct HttpRequest {
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct HttpResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: String,
    time_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct HistoryItem {
    id: Option<i64>,
    method: String,
    url: String,
    status: u16,
    timestamp: i64,
}

// Application state for managing history
struct AppState {
    history: Mutex<Vec<HistoryItem>>,
    environment_vars: Mutex<HashMap<String, String>>,
}

// Send HTTP request command
#[tauri::command]
async fn send_request(request: HttpRequest, state: State<'_, AppState>) -> Result<HttpResponse, String> {
    let start = std::time::Instant::now();

    // Build HTTP client
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true) // For testing purposes
        .build()
        .map_err(|e| e.to_string())?;

    // Replace environment variables in URL and body
    let (url, body) = {
        let env_vars = state.environment_vars.lock().unwrap();
        let url = replace_variables(&request.url, &env_vars);
        let body = request.body.as_ref().map(|b| replace_variables(b, &env_vars));
        (url, body)
    }; // env_vars is dropped here

    // Create request builder
    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .map_err(|e| e.to_string())?;

    let mut req_builder = client.request(method, &url);

    // Add headers
    for (key, value) in request.headers.iter() {
        req_builder = req_builder.header(key, value);
    }

    // Add body if present
    if let Some(body_content) = body {
        req_builder = req_builder.body(body_content);
    }

    // Send request
    let response = req_builder.send().await.map_err(|e| e.to_string())?;

    let status = response.status().as_u16();

    // Extract headers
    let mut headers = HashMap::new();
    for (key, value) in response.headers().iter() {
        headers.insert(
            key.to_string(),
            value.to_str().unwrap_or("").to_string(),
        );
    }

    // Get response body
    let body = response.text().await.map_err(|e| e.to_string())?;

    let duration = start.elapsed();

    // Save to history
    let history_item = HistoryItem {
        id: None,
        method: request.method.clone(),
        url: url.clone(),
        status,
        timestamp: chrono::Utc::now().timestamp(),
    };

    state.history.lock().unwrap().push(history_item);

    Ok(HttpResponse {
        status,
        headers,
        body,
        time_ms: duration.as_millis(),
    })
}

// Get request history
#[tauri::command]
fn get_history(state: State<'_, AppState>) -> Vec<HistoryItem> {
    state.history.lock().unwrap().clone()
}

// Clear history
#[tauri::command]
fn clear_history(state: State<'_, AppState>) -> Result<(), String> {
    state.history.lock().unwrap().clear();
    Ok(())
}

// Set environment variable
#[tauri::command]
fn set_env_var(key: String, value: String, state: State<'_, AppState>) -> Result<(), String> {
    state.environment_vars.lock().unwrap().insert(key, value);
    Ok(())
}

// Get all environment variables
#[tauri::command]
fn get_env_vars(state: State<'_, AppState>) -> HashMap<String, String> {
    state.environment_vars.lock().unwrap().clone()
}

// Delete environment variable
#[tauri::command]
fn delete_env_var(key: String, state: State<'_, AppState>) -> Result<(), String> {
    state.environment_vars.lock().unwrap().remove(&key);
    Ok(())
}

// Helper function to replace {{variable}} with actual values
fn replace_variables(text: &str, vars: &HashMap<String, String>) -> String {
    let mut result = text.to_string();
    for (key, value) in vars.iter() {
        let placeholder = format!("{{{{{}}}}}", key);
        result = result.replace(&placeholder, value);
    }
    result
}

fn main() {
    let app_state = AppState {
        history: Mutex::new(Vec::new()),
        environment_vars: Mutex::new(HashMap::new()),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            send_request,
            get_history,
            clear_history,
            set_env_var,
            get_env_vars,
            delete_env_var,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
