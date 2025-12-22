import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { RequestPanel } from "./components/RequestPanel";
import { ResponsePanel } from "./components/ResponsePanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import type { Collection, Endpoint, HistoryEntry, HttpMethod } from "./types";
import "./App.css";

type RequestDraft = {
  params: Record<string, string>;
  body: string;
};

const historyStorageKey = "restman.history";
const openApiHistoryKey = "restman.openapiHistory";
const autoRequestIntervalKey = "restman.autoRequestInterval";
const statusResetDelayMs = 4500;
const maxHistoryEntries = 50;
const maxOpenApiHistoryEntries = 8;
const defaultAutoRequestIntervalMs = 60000;
const syncResetDelayMs = 3500;

function endpointKey(endpoint: Endpoint) {
  return `${endpoint.method}:${endpoint.path}`;
}

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
  const [openApiHistory, setOpenApiHistory] = useState<string[]>([]);
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
  const [endpointDrafts, setEndpointDrafts] = useState<
    Record<string, RequestDraft>
  >({});
  const [autoRequests, setAutoRequests] = useState<Record<string, boolean>>({});
  const [autoRequestIntervalMs, setAutoRequestIntervalMs] = useState(
    defaultAutoRequestIntervalMs
  );
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "updated"
  >("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const statusTimeoutRef = useRef<number | null>(null);
  const syncTimeoutRef = useRef<number | null>(null);
  const autoRequestTimersRef = useRef<Record<string, number>>({});
  const autoRequestInFlightRef = useRef<Record<string, boolean>>({});
  const draftsRef = useRef(endpointDrafts);
  const collectionsRef = useRef(collections);

  const selectedEndpointKey = selectedEndpoint
    ? endpointKey(selectedEndpoint)
    : null;

  useEffect(() => {
    const unlisten = listen<Collection>("collection-updated", (event) => {
      const col = event.payload;
      setCollections((prev) => ({ ...prev, [col.url]: col }));
      setLastSyncedAt(Date.now());
      setSyncStatus("updated");
      scheduleSyncReset();
      showMessage(`Updated: ${col.name}`);
    });
    return () => {
      unlisten.then((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    const historyStored = window.localStorage.getItem(historyStorageKey);
    if (historyStored) {
      try {
        const parsed = JSON.parse(historyStored) as HistoryEntry[];
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      } catch {
        setHistory([]);
      }
    }
    const openApiStored = window.localStorage.getItem(openApiHistoryKey);
    if (openApiStored) {
      try {
        const parsed = JSON.parse(openApiStored) as string[];
        if (Array.isArray(parsed)) {
          setOpenApiHistory(parsed);
        }
      } catch {
        setOpenApiHistory([]);
      }
    }
    const intervalStored = window.localStorage.getItem(autoRequestIntervalKey);
    if (intervalStored) {
      const parsed = Number(intervalStored);
      if (!Number.isNaN(parsed)) {
        setAutoRequestIntervalMs(parsed);
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(historyStorageKey, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    window.localStorage.setItem(
      openApiHistoryKey,
      JSON.stringify(openApiHistory)
    );
  }, [openApiHistory]);

  useEffect(() => {
    window.localStorage.setItem(
      autoRequestIntervalKey,
      String(autoRequestIntervalMs)
    );
  }, [autoRequestIntervalMs]);

  useEffect(() => {
    draftsRef.current = endpointDrafts;
  }, [endpointDrafts]);

  useEffect(() => {
    collectionsRef.current = collections;
  }, [collections]);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current !== null) {
        window.clearTimeout(statusTimeoutRef.current);
      }
      if (syncTimeoutRef.current !== null) {
        window.clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const timers = autoRequestTimersRef.current;
    Object.values(timers).forEach((timerId) => window.clearInterval(timerId));
    autoRequestTimersRef.current = {};

    Object.entries(autoRequests).forEach(([key, enabled]) => {
      if (!enabled) return;
      const timerId = window.setInterval(() => {
        const endpoint = findEndpointByKey(key);
        if (endpoint) {
          runBackgroundRequest(endpoint);
        }
      }, autoRequestIntervalMs);
      autoRequestTimersRef.current[key] = timerId;
      const endpoint = findEndpointByKey(key);
      if (endpoint) {
        runBackgroundRequest(endpoint);
      }
    });
  }, [autoRequests, autoRequestIntervalMs]);

  useEffect(() => {
    return () => {
      Object.values(autoRequestTimersRef.current).forEach((timerId) =>
        window.clearInterval(timerId)
      );
    };
  }, []);

  function scheduleSyncReset() {
    if (syncTimeoutRef.current !== null) {
      window.clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = window.setTimeout(
      () => setSyncStatus("idle"),
      syncResetDelayMs
    );
  }

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

  function updateOpenApiHistory(url: string) {
    setOpenApiHistory((prev) => {
      const next = [url, ...prev.filter((item) => item !== url)];
      return next.slice(0, maxOpenApiHistoryEntries);
    });
  }

  function buildDraftFromEndpoint(endpoint: Endpoint): RequestDraft {
    const params: Record<string, string> = {};
    endpoint.parameters.forEach((param) => {
      params[param.name] = formatExample(param.example);
    });
    return {
      params,
      body: formatBodyExample(endpoint.body_example),
    };
  }

  function updateDraftForSelected(
    nextParams: Record<string, string>,
    nextBody: string
  ) {
    if (!selectedEndpoint) {
      return;
    }
    const key = endpointKey(selectedEndpoint);
    setEndpointDrafts((prev) => ({
      ...prev,
      [key]: {
        params: nextParams,
        body: nextBody,
      },
    }));
  }

  function findEndpointByKey(key: string) {
    for (const collection of Object.values(collectionsRef.current)) {
      for (const endpoints of Object.values(collection.groups)) {
        for (const endpoint of endpoints) {
          if (endpointKey(endpoint) === key) {
            return endpoint;
          }
        }
      }
    }
    return null;
  }

  async function importOpenApi() {
    const trimmedUrl = openApiUrl.trim();
    if (!trimmedUrl) {
      showMessage("Enter an OpenAPI URL to import.");
      return;
    }
    setSyncStatus("syncing");
    setIsImporting(true);
    try {
      const col: Collection = await invoke("import_openapi", {
        url: trimmedUrl,
      });
      setCollections((prev) => ({ ...prev, [col.url]: col }));
      updateOpenApiHistory(trimmedUrl);
      setLastSyncedAt(Date.now());
      setSyncStatus("updated");
      scheduleSyncReset();
      showMessage(`Imported: ${col.name}`);
      setOpenApiUrl("");
    } catch (error) {
      showMessage(`Import failed: ${String(error)}`);
      setSyncStatus("idle");
    } finally {
      setIsImporting(false);
    }
  }

  function selectEndpoint(endpoint: Endpoint) {
    const key = endpointKey(endpoint);
    const draft = endpointDrafts[key] || buildDraftFromEndpoint(endpoint);
    setSelectedEndpoint(endpoint);
    setMethod(endpoint.method);
    setUrl(endpoint.path);
    setParamValues(draft.params);
    setRequestBody(draft.body);
    setEndpointDrafts((prev) => (prev[key] ? prev : { ...prev, [key]: draft }));
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

  function buildRequestPayload(
    endpoint: Endpoint | null,
    methodInput: HttpMethod,
    urlInput: string,
    params: Record<string, string>,
    bodyInput: string
  ) {
    let finalUrl = urlInput;
    const headers: Record<string, string> = {};
    const queryParams = new URLSearchParams();

    if (endpoint) {
      endpoint.parameters.forEach((param) => {
        const val = params[param.name];
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
    }

    const queryString = queryParams.toString();
    if (queryString) {
      finalUrl += (finalUrl.includes("?") ? "&" : "?") + queryString;
    }

    const body =
      methodInput !== "GET" && bodyInput.trim().length > 0
        ? bodyInput
        : null;

    return { finalUrl, headers, body };
  }

  async function runBackgroundRequest(endpoint: Endpoint) {
    const key = endpointKey(endpoint);
    if (autoRequestInFlightRef.current[key]) {
      return;
    }
    autoRequestInFlightRef.current[key] = true;
    const draft = draftsRef.current[key] || buildDraftFromEndpoint(endpoint);
    const { finalUrl, headers, body } = buildRequestPayload(
      endpoint,
      endpoint.method,
      endpoint.path,
      draft.params,
      draft.body
    );
    try {
      const res: string = await invoke("request", {
        method: endpoint.method,
        url: finalUrl,
        headers,
        body,
      });
      addHistoryEntry({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        created_at: Date.now(),
        method: endpoint.method,
        url: endpoint.path,
        resolved_url: finalUrl,
        params: draft.params,
        body: draft.body,
        response: res,
      });
    } catch (error) {
      addHistoryEntry({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        created_at: Date.now(),
        method: endpoint.method,
        url: endpoint.path,
        resolved_url: finalUrl,
        params: draft.params,
        body: draft.body,
        response: `Error: ${String(error)}`,
      });
    } finally {
      autoRequestInFlightRef.current[key] = false;
    }
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
      const { finalUrl, headers, body } = buildRequestPayload(
        selectedEndpoint,
        method,
        trimmedUrl,
        paramSnapshot,
        bodySnapshot
      );
      resolvedUrl = finalUrl;
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

  function toggleAutoRequest(endpoint: Endpoint, enabled: boolean) {
    const key = endpointKey(endpoint);
    if (enabled && !endpointDrafts[key]) {
      setEndpointDrafts((prev) => ({
        ...prev,
        [key]: buildDraftFromEndpoint(endpoint),
      }));
    }
    setAutoRequests((prev) => ({
      ...prev,
      [key]: enabled,
    }));
    showMessage(enabled ? "자동 요청을 시작했습니다." : "자동 요청을 중지했습니다.");
  }

  return (
    <div className="app">
      <Sidebar
        openApiUrl={openApiUrl}
        onOpenApiUrlChange={setOpenApiUrl}
        onImport={importOpenApi}
        openApiHistory={openApiHistory}
        onSelectOpenApiHistory={setOpenApiUrl}
        collections={collections}
        selectedEndpointKey={selectedEndpointKey}
        onSelectEndpoint={selectEndpoint}
        syncStatus={syncStatus}
        lastSyncedAt={lastSyncedAt}
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
          autoRequestEnabled={
            selectedEndpointKey
              ? Boolean(autoRequests[selectedEndpointKey])
              : false
          }
          onToggleAutoRequest={(enabled) => {
            if (selectedEndpoint) {
              toggleAutoRequest(selectedEndpoint, enabled);
            }
          }}
          autoRequestIntervalMs={autoRequestIntervalMs}
          onAutoRequestIntervalChange={setAutoRequestIntervalMs}
          paramValues={paramValues}
          onParamChange={(name, value) =>
            setParamValues((prev) => {
              const next = { ...prev, [name]: value };
              updateDraftForSelected(next, requestBody);
              return next;
            })
          }
          requestBody={requestBody}
          onRequestBodyChange={(value) => {
            setRequestBody(value);
            updateDraftForSelected(paramValues, value);
          }}
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
