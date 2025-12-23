#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{command, State, Manager};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tokio::time::{sleep, Duration};
use chrono::{DateTime, Utc};
use tokio::fs::File;
use futures_util::StreamExt;
use serde_json::{Map, Value};
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Parameter {
    name: String,
    in_type: String,
    description: Option<String>,
    required: bool,
    example: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct BodyField {
    name: String,
    description: Option<String>,
    required: bool,
    is_file: bool,
    is_array: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Endpoint {
    method: String,
    path: String,
    summary: Option<String>,
    description: Option<String>,
    parameters: Vec<Parameter>,
    body_example: Option<String>,
    body_description: Option<String>,
    body_required: bool,
    body_media_types: Vec<String>,
    body_fields: Vec<BodyField>,
    body_fields_type: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct OpenApiCollection {
    name: String,
    url: String,
    groups: HashMap<String, Vec<Endpoint>>,
    last_updated: DateTime<Utc>,
    etag: Option<String>,
    sync_enabled: bool,
}

struct AppState {
    collections: Arc<Mutex<HashMap<String, OpenApiCollection>>>,
    client: Client,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct MultipartFile {
    name: String,
    paths: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct MultipartPayload {
    fields: HashMap<String, String>,
    files: Vec<MultipartFile>,
}

fn resolve_ref<'a>(doc: &'a Value, value: &'a Value, depth: usize) -> &'a Value {
    if depth > 10 {
        return value;
    }
    if let Some(ref_path) = value.get("$ref").and_then(|v| v.as_str()) {
        if let Some(resolved) = doc.pointer(ref_path.trim_start_matches('#')) {
            return resolve_ref(doc, resolved, depth + 1);
        }
    }
    value
}

fn extract_schema_example(doc: &Value, schema: &Value) -> Option<Value> {
    let resolved = resolve_ref(doc, schema, 0);
    if let Some(example) = resolved.get("example") {
        if !example.is_null() {
            return Some(example.clone());
        }
    }
    if let Some(default) = resolved.get("default") {
        if !default.is_null() {
            return Some(default.clone());
        }
    }
    if let Some(enum_values) = resolved.get("enum").and_then(|v| v.as_array()) {
        if let Some(first) = enum_values.first() {
            return Some(first.clone());
        }
    }
    None
}

fn build_example_from_schema(doc: &Value, schema: &Value, depth: usize) -> Option<Value> {
    if depth > 6 {
        return None;
    }
    let resolved = resolve_ref(doc, schema, 0);
    if let Some(example) = extract_schema_example(doc, resolved) {
        return Some(example);
    }
    if let Some(one_of) = resolved.get("oneOf").and_then(|v| v.as_array()) {
        for option in one_of {
            if let Some(example) = build_example_from_schema(doc, option, depth + 1) {
                return Some(example);
            }
        }
    }
    if let Some(any_of) = resolved.get("anyOf").and_then(|v| v.as_array()) {
        for option in any_of {
            if let Some(example) = build_example_from_schema(doc, option, depth + 1) {
                return Some(example);
            }
        }
    }
    let schema_type = resolved.get("type").and_then(|v| v.as_str());
    if schema_type == Some("object") || resolved.get("properties").is_some() {
        let mut obj = Map::new();
        if let Some(props) = resolved.get("properties").and_then(|v| v.as_object()) {
            for (name, prop_schema) in props {
                if let Some(example) = build_example_from_schema(doc, prop_schema, depth + 1) {
                    obj.insert(name.clone(), example);
                }
            }
        }
        return Some(Value::Object(obj));
    }
    if schema_type == Some("array") {
        if let Some(items) = resolved.get("items") {
            if let Some(example) = build_example_from_schema(doc, items, depth + 1) {
                return Some(Value::Array(vec![example]));
            }
        }
        return Some(Value::Array(vec![]));
    }
    if schema_type == Some("integer") {
        return Some(Value::from(0));
    }
    if schema_type == Some("number") {
        return Some(Value::from(0.0));
    }
    if schema_type == Some("boolean") {
        return Some(Value::from(false));
    }
    if schema_type == Some("string") {
        return Some(Value::from(""));
    }
    None
}

fn extract_parameter_example(doc: &Value, param: &Value) -> Option<Value> {
    let resolved = resolve_ref(doc, param, 0);
    if let Some(example) = resolved.get("example") {
        if !example.is_null() {
            return Some(example.clone());
        }
    }
    if let Some(examples) = resolved.get("examples").and_then(|v| v.as_object()) {
        for example in examples.values() {
            if let Some(value) = example.get("value") {
                if !value.is_null() {
                    return Some(value.clone());
                }
            }
        }
    }
    if let Some(schema) = resolved.get("schema") {
        if let Some(example) = extract_schema_example(doc, schema) {
            return Some(example);
        }
    }
    None
}

fn extract_request_body_example(doc: &Value, request_body: &Value) -> Option<Value> {
    let resolved = resolve_ref(doc, request_body, 0);
    let content = resolved.get("content")?;
    let json_content = content.get("application/json")?;
    if let Some(example) = json_content.get("example") {
        if !example.is_null() {
            return Some(example.clone());
        }
    }
    if let Some(examples) = json_content.get("examples").and_then(|v| v.as_object()) {
        for example in examples.values() {
            if let Some(value) = example.get("value") {
                if !value.is_null() {
                    return Some(value.clone());
                }
            }
        }
    }
    if let Some(schema) = json_content.get("schema") {
        if let Some(example) = build_example_from_schema(doc, schema, 0) {
            return Some(example);
        }
    }
    None
}

fn extract_request_body_description(doc: &Value, request_body: &Value) -> Option<String> {
    let resolved = resolve_ref(doc, request_body, 0);
    if let Some(desc) = resolved.get("description").and_then(|v| v.as_str()) {
        return Some(desc.to_string());
    }
    if let Some(content) = resolved.get("content") {
        if let Some(schema) = content
            .get("application/json")
            .and_then(|v| v.get("schema"))
        {
            let schema = resolve_ref(doc, schema, 0);
            if let Some(desc) = schema.get("description").and_then(|v| v.as_str()) {
                return Some(desc.to_string());
            }
        }
    }
    None
}

fn extract_request_body_media_types(doc: &Value, request_body: &Value) -> Vec<String> {
    let resolved = resolve_ref(doc, request_body, 0);
    let content = match resolved.get("content").and_then(|v| v.as_object()) {
        Some(content) => content,
        None => return Vec::new(),
    };
    content.keys().cloned().collect()
}

fn is_binary_schema(doc: &Value, schema: &Value) -> bool {
    let resolved = resolve_ref(doc, schema, 0);
    let schema_type = resolved.get("type").and_then(|v| v.as_str());
    let format = resolved.get("format").and_then(|v| v.as_str());
    schema_type == Some("string") && matches!(format, Some("binary") | Some("base64"))
}

fn extract_form_fields(doc: &Value, request_body: &Value, content_type: &str) -> Vec<BodyField> {
    let resolved = resolve_ref(doc, request_body, 0);
    let schema = match resolved
        .get("content")
        .and_then(|v| v.get(content_type))
        .and_then(|v| v.get("schema"))
    {
        Some(schema) => resolve_ref(doc, schema, 0),
        None => return Vec::new(),
    };
    let required_fields: std::collections::HashSet<String> = schema
        .get("required")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let props = match schema.get("properties").and_then(|v| v.as_object()) {
        Some(props) => props,
        None => return Vec::new(),
    };

    let mut fields = Vec::new();
    for (name, prop_schema) in props {
        let resolved_prop = resolve_ref(doc, prop_schema, 0);
        let description = resolved_prop
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let mut is_file = is_binary_schema(doc, resolved_prop);
        let mut is_array = false;
        if !is_file {
            if resolved_prop.get("type").and_then(|v| v.as_str()) == Some("array") {
                if let Some(items) = resolved_prop.get("items") {
                    if is_binary_schema(doc, items) {
                        is_file = true;
                        is_array = true;
                    }
                }
            }
        }
        fields.push(BodyField {
            name: name.clone(),
            description,
            required: required_fields.contains(name),
            is_file,
            is_array,
        });
    }
    fields
}

fn parse_openapi_internal(content: &str, url: &str, etag: Option<String>) -> Result<OpenApiCollection, String> {
    let json: serde_json::Value = serde_json::from_str(content).map_err(|e| e.to_string())?;
    let mut groups: HashMap<String, Vec<Endpoint>> = HashMap::new();
    let base_url = json["servers"][0]["url"].as_str().unwrap_or("").trim_end_matches('/');

    if let Some(paths) = json["paths"].as_object() {
        for (path, methods) in paths {
            if let Some(methods_obj) = methods.as_object() {
                let path_params = methods_obj.get("parameters").and_then(|v| v.as_array());
                for (method, details) in methods_obj {
                    if method == "parameters" { continue; }

                    let mut params = Vec::new();
                    let mut seen = std::collections::HashSet::new();
                    let op_params = details.get("parameters").and_then(|v| v.as_array());
                    let param_iter = path_params
                        .into_iter()
                        .flatten()
                        .chain(op_params.into_iter().flatten());
                    for p in param_iter {
                        let resolved = resolve_ref(&json, p, 0);
                        let name = resolved["name"].as_str().unwrap_or("").to_string();
                        let in_type = resolved["in"].as_str().unwrap_or("query").to_string();
                        let key = format!("{}:{}", in_type, name);
                        if !seen.insert(key) {
                            continue;
                        }
                        let description = resolved
                            .get("description")
                            .and_then(|v| v.as_str())
                            .or_else(|| {
                                resolved
                                    .get("schema")
                                    .and_then(|s| s.get("description"))
                                    .and_then(|v| v.as_str())
                            })
                            .map(|s| s.to_string());
                        params.push(Parameter {
                            name,
                            in_type,
                            description,
                            required: resolved["required"].as_bool().unwrap_or(false),
                            example: extract_parameter_example(&json, resolved),
                        });
                    }

                    let request_body = details.get("requestBody");
                    let body_description = request_body
                        .and_then(|body| extract_request_body_description(&json, body));
                    let body_required = request_body
                        .and_then(|body| resolve_ref(&json, body, 0).get("required"))
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    let body_example = request_body
                        .and_then(|body| extract_request_body_example(&json, body))
                        .map(|value| value.to_string());
                    let body_media_types = request_body
                        .map(|body| extract_request_body_media_types(&json, body))
                        .unwrap_or_default();
                    let mut body_fields = Vec::new();
                    let mut body_fields_type = None;
                    if let Some(body) = request_body {
                        if body_media_types.iter().any(|t| t == "multipart/form-data") {
                            body_fields = extract_form_fields(&json, body, "multipart/form-data");
                            body_fields_type = Some("multipart/form-data".to_string());
                        } else if body_media_types
                            .iter()
                            .any(|t| t == "application/x-www-form-urlencoded")
                        {
                            body_fields = extract_form_fields(
                                &json,
                                body,
                                "application/x-www-form-urlencoded",
                            );
                            body_fields_type = Some("application/x-www-form-urlencoded".to_string());
                        }
                    }

                    let endpoint = Endpoint {
                        method: method.to_uppercase(),
                        path: format!("{}{}", base_url, path),
                        summary: details["summary"].as_str().map(|s| s.to_string()),
                        description: details["description"].as_str().map(|s| s.to_string()),
                        parameters: params,
                        body_example,
                        body_description,
                        body_required,
                        body_media_types,
                        body_fields,
                        body_fields_type,
                    };

                    let tag = details["tags"][0].as_str().unwrap_or("Default").to_string();
                    groups.entry(tag).or_insert(Vec::new()).push(endpoint);
                }
            }
        }
    }

    let name = json["info"]["title"].as_str().unwrap_or(url).to_string();
    Ok(OpenApiCollection {
        name,
        url: url.to_string(),
        groups,
        last_updated: Utc::now(),
        etag,
        sync_enabled: true,
    })
}

#[command]
async fn request(
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    multipart: Option<MultipartPayload>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let client = state.client.clone();
    let req_method = match method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        _ => return Err("Invalid method".into()),
    };

    let mut request_builder = client.request(req_method, &url);
    let mut final_headers = headers;
    if multipart.is_some() {
        final_headers.retain(|key, _| !key.eq_ignore_ascii_case("content-type"));
    }
    for (key, value) in &final_headers {
        request_builder = request_builder.header(key, value);
    }
    if let Some(payload) = multipart {
        let mut form = reqwest::multipart::Form::new();
        for (key, value) in payload.fields {
            if !value.is_empty() {
                form = form.text(key, value);
            }
        }
        for file in payload.files {
            for path in file.paths {
                if path.is_empty() {
                    continue;
                }
                let filename = Path::new(&path)
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("file")
                    .to_string();
                let file_handle = File::open(&path).await.map_err(|e| e.to_string())?;
                let length = file_handle.metadata().await.map_err(|e| e.to_string())?.len();
                let part = reqwest::multipart::Part::stream_with_length(file_handle, length)
                    .file_name(filename);
                form = form.part(file.name.clone(), part);
            }
        }
        request_builder = request_builder.multipart(form);
    } else if let Some(b) = body {
        if !b.is_empty() {
            request_builder = request_builder.body(b);
            if !final_headers
                .keys()
                .any(|key| key.eq_ignore_ascii_case("content-type"))
            {
                request_builder = request_builder.header("Content-Type", "application/json");
            }
        }
    }

    let response = request_builder.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let headers_map = response.headers().clone();
    let text = response.text().await.map_err(|e| e.to_string())?;

    let mut header_str = String::new();
    for (k, v) in headers_map.iter() {
        header_str.push_str(&format!("{}: {:?}\n", k, v));
    }

    Ok(format!("Status: {}\n\nHeaders:\n{}\n\nBody:\n{}", status, header_str, text))
}

#[command]
async fn import_openapi(url: String, state: State<'_, AppState>) -> Result<OpenApiCollection, String> {
    let client = Client::new();
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let etag = response.headers().get("etag").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let content = response.text().await.map_err(|e| e.to_string())?;
    
    let collection = parse_openapi_internal(&content, &url, etag)?;
    let mut cols = state.collections.lock().unwrap();
    cols.insert(url, collection.clone());
    Ok(collection)
}

#[command]
async fn toggle_sync(url: String, enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    let mut cols = state.collections.lock().unwrap();
    if let Some(col) = cols.get_mut(&url) { col.sync_enabled = enabled; }
    Ok(())
}

#[command]
async fn download_file(url: String, save_path: String) -> Result<(), String> {
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let mut file = File::create(save_path).await.map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        tokio::io::copy(&mut &chunk[..], &mut file).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn background_update_checker(app_handle: tauri::AppHandle) {
    loop {
        sleep(Duration::from_secs(60)).await;
        let state = app_handle.state::<AppState>();
        let targets: Vec<(String, Option<String>)> = {
            let cols = state.collections.lock().unwrap();
            cols.values().filter(|c| c.sync_enabled).map(|c| (c.url.clone(), c.etag.clone())).collect()
        };
        let client = Client::new();
        for (url, current_etag) in targets {
            let mut req = client.get(&url);
            if let Some(etag) = current_etag { req = req.header("If-None-Match", etag); }
            if let Ok(resp) = req.send().await {
                if resp.status() == reqwest::StatusCode::OK {
                    let new_etag = resp.headers().get("etag").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
                    if let Ok(content) = resp.text().await {
                        if let Ok(updated_col) = parse_openapi_internal(&content, &url, new_etag) {
                            let mut cols = state.collections.lock().unwrap();
                            cols.insert(url.clone(), updated_col.clone());
                            app_handle.emit_all("collection-updated", updated_col).unwrap();
                        }
                    }
                }
            }
        }
    }
}

#[tokio::main]
async fn main() {
    let client = Client::builder()
        .cookie_store(true)
        .build()
        .expect("failed to build HTTP client");
    let state = AppState {
        collections: Arc::new(Mutex::new(HashMap::new())),
        client,
    };
    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![request, download_file, import_openapi, toggle_sync])
        .setup(|app| {
            let handle = app.handle();
            tokio::spawn(async move { background_update_checker(handle).await; });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
