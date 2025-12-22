import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { RequestPanel } from "./components/RequestPanel";
import { ResponsePanel } from "./components/ResponsePanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import type { Collection, Endpoint, HistoryEntry, HttpMethod } from "./types";
import "./App.css";

const historyStorageKey = "restman.history";
const statusResetDelayMs = 4500;
const maxHistoryEntries = 50;

function formatExample(example?: unknown) {
  if (example === undefined || example === null) {
    return "";
  }
  if (typeof example === "object") {
    return JSON.stringify(example);
  }
  return String(example);
}

function formatBodyExample(bodyExample?: string) {
  if (!bodyExample) {
    return "";
  }
  try {
    const parsed = JSON.parse(bodyExample);
    return typeof parsed === "string"
      ? parsed
      : JSON.stringify(parsed, null, 2);
  } catch {
    return bodyExample;
  }
}

function App() {
  const [collections, setCollections] = useState<Record<string, Collection>>({});
  const [openApiUrl, setOpenApiUrl] = useState("");
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null);
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("");
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [requestBody, setRequestBody] = useState("");
  const [response, setResponse] = useState("");
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [isImporting, setIsImporting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const statusTimeoutRef = useRef<number | null>(null);

  const selectedEndpointKey = selectedEndpoint
    ? `${selectedEndpoint.method}:${selectedEndpoint.path}`
    : null;

  useEffect(() => {
    const unlisten = listen<Collection>("collection-updated", (event) => {
      const col = event.payload;
      setCollections((prev) => ({ ...prev, [col.url]: col }));
      showMessage(`Updated: ${col.name}`);
    });
    return () => {
      unlisten.then((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(historyStorageKey);
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored) as HistoryEntry[];
      if (Array.isArray(parsed)) {
        setHistory(parsed);
      }
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(historyStorageKey, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current !== null) {
        window.clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  function showMessage(msg: string) {
    setStatusMessage(msg);
    if (statusTimeoutRef.current !== null) {
      window.clearTimeout(statusTimeoutRef.current);
    }
    statusTimeoutRef.current = window.setTimeout(
      () => setStatusMessage("Ready"),
      statusResetDelayMs
    );
  }

  async function importOpenApi() {
    const trimmedUrl = openApiUrl.trim();
    if (!trimmedUrl) {
      showMessage("Enter an OpenAPI URL to import.");
      return;
    }
    setIsImporting(true);
    try {
      const col: Collection = await invoke("import_openapi", {
        url: trimmedUrl,
      });
      setCollections((prev) => ({ ...prev, [col.url]: col }));
      showMessage(`Imported: ${col.name}`);
      setOpenApiUrl("");
    } catch (error) {
      showMessage(`Import failed: ${String(error)}`);
    } finally {
      setIsImporting(false);
    }
  }

  function selectEndpoint(endpoint: Endpoint) {
    setSelectedEndpoint(endpoint);
    setMethod(endpoint.method);
    setUrl(endpoint.path);
    const newParams: Record<string, string> = {};
    endpoint.parameters.forEach((param) => {
      newParams[param.name] = formatExample(param.example);
    });
    setParamValues(newParams);
    setRequestBody(formatBodyExample(endpoint.body_example));
    setResponse("");
    showMessage(`Loaded: ${endpoint.method} ${endpoint.path}`);
  }

  function findEndpointByRequest(entry: HistoryEntry) {
    for (const collection of Object.values(collections)) {
      for (const endpoints of Object.values(collection.groups)) {
        for (const endpoint of endpoints) {
          if (endpoint.method === entry.method && endpoint.path === entry.url) {
            return endpoint;
          }
        }
      }
    }
    return null;
  }

  function addHistoryEntry(entry: HistoryEntry) {
    setHistory((prev) => [entry, ...prev].slice(0, maxHistoryEntries));
  }

  function reuseHistory(entry: HistoryEntry) {
    const matchedEndpoint = findEndpointByRequest(entry);
    setSelectedEndpoint(matchedEndpoint);
    setMethod(entry.method);
    setUrl(matchedEndpoint ? entry.url : entry.resolved_url || entry.url);
    setParamValues(entry.params);
    setRequestBody(entry.body);
    setResponse(entry.response);
    showMessage("히스토리에서 요청을 불러왔습니다.");
  }

  function previewHistory(entry: HistoryEntry) {
    setResponse(entry.response);
    showMessage("히스토리 응답을 표시했습니다.");
  }

  async function sendRequest() {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setResponse("Error: Request URL is required.");
      showMessage("Enter a request URL.");
      return;
    }
    const paramSnapshot = { ...paramValues };
    const bodySnapshot = requestBody;
    const urlSnapshot = trimmedUrl;
    setIsSending(true);
    setResponse("Sending request...");
    let finalResponse = "";
    let resolvedUrl = trimmedUrl;
    try {
      let finalUrl = trimmedUrl;
      const headers: Record<string, string> = {};
      const queryParams = new URLSearchParams();

      selectedEndpoint?.parameters.forEach((param) => {
        const val = paramSnapshot[param.name];
        if (!val) return;

        if (param.in_type === "path") {
          finalUrl = finalUrl.replace(
            `{${param.name}}`,
            encodeURIComponent(val)
          );
        } else if (param.in_type === "query") {
          queryParams.append(param.name, val);
        } else if (param.in_type === "header") {
          headers[param.name] = val;
        }
      });

      const queryString = queryParams.toString();
      if (queryString) {
        finalUrl += (finalUrl.includes("?") ? "&" : "?") + queryString;
      }
      resolvedUrl = finalUrl;

      const body =
        method !== "GET" && bodySnapshot.trim().length > 0
          ? bodySnapshot
          : null;
      const res: string = await invoke("request", {
        method,
        url: finalUrl,
        headers,
        body,
      });
      finalResponse = res;
      setResponse(res);
      showMessage("Request Success");
    } catch (error) {
      finalResponse = "Error: " + String(error);
      setResponse(finalResponse);
      showMessage("Request Failed");
    } finally {
      setIsSending(false);
      if (finalResponse) {
        addHistoryEntry({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          created_at: Date.now(),
          method,
          url: urlSnapshot,
          resolved_url: resolvedUrl,
          params: paramSnapshot,
          body: bodySnapshot,
          response: finalResponse,
        });
      }
    }
  }

  return (
    <div className="app">
      <Sidebar
        openApiUrl={openApiUrl}
        onOpenApiUrlChange={setOpenApiUrl}
        onImport={importOpenApi}
        collections={collections}
        selectedEndpointKey={selectedEndpointKey}
        onSelectEndpoint={selectEndpoint}
        isImporting={isImporting}
      />
      <main className="workspace">
        <RequestPanel
          method={method}
          url={url}
          onMethodChange={setMethod}
          onUrlChange={setUrl}
          onSend={sendRequest}
          isSending={isSending}
          selectedEndpoint={selectedEndpoint}
          paramValues={paramValues}
          onParamChange={(name, value) =>
            setParamValues((prev) => ({ ...prev, [name]: value }))
          }
          requestBody={requestBody}
          onRequestBodyChange={setRequestBody}
        />
        <ResponsePanel
          response={response}
          isSending={isSending}
          history={history}
          onReuseHistory={reuseHistory}
          onPreviewHistory={previewHistory}
        />
      </main>
      <StatusBar message={statusMessage} />
    </div>
  );
}

export default App;
