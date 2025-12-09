import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";

interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  time_ms: number;
}

interface HistoryItem {
  id?: number;
  method: string;
  url: string;
  status: number;
  timestamp: number;
}

type TabType = "params" | "headers" | "body";

function App() {
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("https://jsonplaceholder.typicode.com/posts/1");
  const [activeTab, setActiveTab] = useState<TabType>("headers");
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>([
    { key: "Content-Type", value: "application/json" },
  ]);
  const [params, setParams] = useState<Array<{ key: string; value: string }>>([]);
  const [body, setBody] = useState("");
  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [showEnvVars, setShowEnvVars] = useState(false);
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");

  useEffect(() => {
    loadHistory();
    loadEnvVars();
  }, []);

  const loadHistory = async () => {
    try {
      const hist = await invoke<HistoryItem[]>("get_history");
      setHistory(hist.reverse());
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  };

  const loadEnvVars = async () => {
    try {
      const vars = await invoke<Record<string, string>>("get_env_vars");
      setEnvVars(vars);
    } catch (err) {
      console.error("Failed to load environment variables:", err);
    }
  };

  const addHeader = () => {
    setHeaders([...headers, { key: "", value: "" }]);
  };

  const updateHeader = (index: number, field: "key" | "value", value: string) => {
    const newHeaders = [...headers];
    newHeaders[index][field] = value;
    setHeaders(newHeaders);
  };

  const removeHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
  };

  const addParam = () => {
    setParams([...params, { key: "", value: "" }]);
  };

  const updateParam = (index: number, field: "key" | "value", value: string) => {
    const newParams = [...params];
    newParams[index][field] = value;
    setParams(newParams);
  };

  const removeParam = (index: number) => {
    setParams(params.filter((_, i) => i !== index));
  };

  const addEnvVar = async () => {
    if (!newEnvKey) return;
    try {
      await invoke("set_env_var", { key: newEnvKey, value: newEnvValue });
      setEnvVars({ ...envVars, [newEnvKey]: newEnvValue });
      setNewEnvKey("");
      setNewEnvValue("");
    } catch (err) {
      console.error("Failed to add environment variable:", err);
    }
  };

  const deleteEnvVar = async (key: string) => {
    try {
      await invoke("delete_env_var", { key });
      const newVars = { ...envVars };
      delete newVars[key];
      setEnvVars(newVars);
    } catch (err) {
      console.error("Failed to delete environment variable:", err);
    }
  };

  const buildUrlWithParams = () => {
    let finalUrl = url;
    if (params.length > 0) {
      const validParams = params.filter((p) => p.key);
      if (validParams.length > 0) {
        const queryString = validParams.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join("&");
        finalUrl = url.includes("?") ? `${url}&${queryString}` : `${url}?${queryString}`;
      }
    }
    return finalUrl;
  };

  const sendRequest = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const headersObj: Record<string, string> = {};
      headers.forEach((h) => {
        if (h.key) {
          headersObj[h.key] = h.value;
        }
      });

      const request: HttpRequest = {
        method,
        url: buildUrlWithParams(),
        headers: headersObj,
        body: body || null,
      };

      const res = await invoke<HttpResponse>("send_request", { request });
      setResponse(res);
      await loadHistory();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setMethod(item.method);
    setUrl(item.url);
    setResponse(null);
    setError(null);
  };

  const formatJson = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return text;
    }
  };

  const getStatusClass = (status: number) => {
    if (status >= 200 && status < 300) return "status-200";
    if (status >= 400 && status < 500) return "status-400";
    if (status >= 500) return "status-500";
    return "";
  };

  return (
    <div className="app">
      <div className="header">
        <h1>RestMan - API Client</h1>
        <button className="button" onClick={() => setShowEnvVars(!showEnvVars)}>
          {showEnvVars ? "Hide" : "Show"} Environment Variables
        </button>
      </div>

      <div className="main-content">
        <div className="sidebar">
          <h2>History</h2>
          {history.length === 0 ? (
            <div style={{ color: "#888", fontSize: "12px", padding: "10px 0" }}>No requests yet</div>
          ) : (
            history.map((item, idx) => (
              <div key={idx} className="history-item" onClick={() => loadFromHistory(item)}>
                <div>
                  <span className="method">{item.method}</span>
                  <span className={`status ${getStatusClass(item.status)}`}>({item.status})</span>
                </div>
                <div className="url">{item.url}</div>
              </div>
            ))
          )}
        </div>

        <div className="content">
          {showEnvVars && (
            <div className="env-vars-section">
              <h3>Environment Variables</h3>
              <div className="key-value-list">
                {Object.entries(envVars).map(([key, value]) => (
                  <div key={key} className="key-value-row">
                    <input type="text" value={key} readOnly />
                    <input type="text" value={value} readOnly />
                    <button onClick={() => deleteEnvVar(key)}>Delete</button>
                  </div>
                ))}
                <div className="key-value-row">
                  <input type="text" placeholder="Key" value={newEnvKey} onChange={(e) => setNewEnvKey(e.target.value)} />
                  <input type="text" placeholder="Value" value={newEnvValue} onChange={(e) => setNewEnvValue(e.target.value)} />
                  <button onClick={addEnvVar}>Add</button>
                </div>
              </div>
              <div style={{ fontSize: "11px", color: "#888", marginTop: "10px" }}>
                Use variables in URL or body with: {"{"}{"{"} variable_name {"}"}{"}"}
              </div>
            </div>
          )}

          <div className="request-section">
            <h3>Request</h3>
            <div className="request-url">
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
                <option value="HEAD">HEAD</option>
                <option value="OPTIONS">OPTIONS</option>
              </select>
              <input type="text" placeholder="Enter request URL" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button className="button" onClick={sendRequest} disabled={loading}>
                {loading ? "Sending..." : "Send"}
              </button>
            </div>

            <div className="tabs">
              <button className={`tab ${activeTab === "params" ? "active" : ""}`} onClick={() => setActiveTab("params")}>
                Params
              </button>
              <button className={`tab ${activeTab === "headers" ? "active" : ""}`} onClick={() => setActiveTab("headers")}>
                Headers
              </button>
              <button className={`tab ${activeTab === "body" ? "active" : ""}`} onClick={() => setActiveTab("body")}>
                Body
              </button>
            </div>

            {activeTab === "params" && (
              <div className="key-value-list">
                {params.map((param, idx) => (
                  <div key={idx} className="key-value-row">
                    <input type="text" placeholder="Key" value={param.key} onChange={(e) => updateParam(idx, "key", e.target.value)} />
                    <input type="text" placeholder="Value" value={param.value} onChange={(e) => updateParam(idx, "value", e.target.value)} />
                    <button onClick={() => removeParam(idx)}>Remove</button>
                  </div>
                ))}
                <button className="add-button" onClick={addParam}>
                  + Add Parameter
                </button>
              </div>
            )}

            {activeTab === "headers" && (
              <div className="key-value-list">
                {headers.map((header, idx) => (
                  <div key={idx} className="key-value-row">
                    <input type="text" placeholder="Key" value={header.key} onChange={(e) => updateHeader(idx, "key", e.target.value)} />
                    <input type="text" placeholder="Value" value={header.value} onChange={(e) => updateHeader(idx, "value", e.target.value)} />
                    <button onClick={() => removeHeader(idx)}>Remove</button>
                  </div>
                ))}
                <button className="add-button" onClick={addHeader}>
                  + Add Header
                </button>
              </div>
            )}

            {activeTab === "body" && (
              <div>
                <textarea className="body-editor" placeholder="Enter request body (JSON, XML, etc.)" value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
            )}
          </div>

          {error && <div className="error">Error: {error}</div>}

          {response && (
            <div className="response-section">
              <h3>Response</h3>
              <div className="response-meta">
                <span>
                  Status: <strong className={getStatusClass(response.status)}>{response.status}</strong>
                </span>
                <span>
                  Time: <strong>{response.time_ms}ms</strong>
                </span>
                <span>
                  Size: <strong>{new Blob([response.body]).size} bytes</strong>
                </span>
              </div>

              <div className="tabs">
                <button className="tab active">Body</button>
              </div>

              <div className="response-body">{formatJson(response.body)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
