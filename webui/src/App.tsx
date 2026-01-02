import { useEffect, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { RequestPanel } from "./components/RequestPanel";
import { ResponsePanel } from "./components/ResponsePanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import type {
  BodyField,
  Collection,
  Endpoint,
  HistoryEntry,
  HttpMethod,
} from "./types";
import "./App.css";

type RequestDraft = {
  params: Record<string, string>;
  body: string;
  bodyType: string;
  formValues: Record<string, string>;
  fileValues: Record<string, string[]>;
};

const formBodyTypes = new Set([
  "multipart/form-data",
  "application/x-www-form-urlencoded",
]);

const historyStorageKey = "restman.history";
const openApiHistoryKey = "restman.openapiHistory";
const autoRequestIntervalKey = "restman.autoRequestInterval";
const sidebarWidthKey = "restman.sidebarWidth";
const statusResetDelayMs = 4500;
const maxHistoryEntries = 50;
const maxOpenApiHistoryEntries = 8;
const defaultAutoRequestIntervalMs = 60000;
const syncResetDelayMs = 3500;
const minSidebarWidth = 240;
const minWorkspaceWidth = 360;

function endpointKey(endpoint: Endpoint) {
  return `${endpoint.method}:${endpoint.path}`;
}

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function normalizeEndpointPath(value: string) {
  if (!isAbsoluteUrl(value)) {
    return value;
  }
  try {
    const parsed = new URL(value);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return value;
  }
}

function resolveEndpointUrl(endpoint: Endpoint, collectionUrl?: string | null) {
  if (isAbsoluteUrl(endpoint.path)) {
    return endpoint.path;
  }
  if (!collectionUrl) {
    return endpoint.path;
  }
  try {
    const base = new URL(collectionUrl);
    if (!base.origin || base.origin === "null") {
      return endpoint.path;
    }
    if (endpoint.path.startsWith("/")) {
      return `${base.origin}${endpoint.path}`;
    }
    return `${base.origin}/${endpoint.path}`;
  } catch {
    return endpoint.path;
  }
}

function isFormBodyType(bodyType: string) {
  return formBodyTypes.has(bodyType);
}

function defaultBodyType(endpoint: Endpoint | null) {
  if (!endpoint?.body_media_types || endpoint.body_media_types.length === 0) {
    return "application/json";
  }
  if (endpoint.body_media_types.includes("multipart/form-data")) {
    return "multipart/form-data";
  }
  if (endpoint.body_media_types.includes("application/x-www-form-urlencoded")) {
    return "application/x-www-form-urlencoded";
  }
  return endpoint.body_media_types[0];
}

function buildFormDefaults(fields: BodyField[] | undefined) {
  const formValues: Record<string, string> = {};
  const fileValues: Record<string, string[]> = {};
  if (!fields) {
    return { formValues, fileValues };
  }
  fields.forEach((field) => {
    if (field.is_file) {
      fileValues[field.name] = [];
    } else {
      formValues[field.name] = "";
    }
  });
  return { formValues, fileValues };
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
  const [bodyType, setBodyType] = useState("application/json");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [fileValues, setFileValues] = useState<Record<string, string[]>>({});
  const [response, setResponse] = useState("");
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [isImporting, setIsImporting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [endpointDrafts, setEndpointDrafts] = useState<
    Record<string, RequestDraft>
  >({});
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = window.localStorage.getItem(sidebarWidthKey);
    const parsed = stored ? Number(stored) : NaN;
    return Number.isNaN(parsed) ? 300 : parsed;
  });
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
  const appRef = useRef<HTMLDivElement | null>(null);
  const isResizingRef = useRef(false);

  const selectedEndpointKey = selectedEndpoint
    ? endpointKey(selectedEndpoint)
    : null;
  const selectedEndpointPath = selectedEndpoint
    ? normalizeEndpointPath(selectedEndpoint.path)
    : null;
  const visibleHistory = selectedEndpoint
    ? history.filter(
        (entry) =>
          entry.method === selectedEndpoint.method &&
          normalizeEndpointPath(entry.url) === selectedEndpointPath
      )
    : history;
  const appStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
  } as CSSProperties;

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
    window.localStorage.setItem(sidebarWidthKey, String(sidebarWidth));
  }, [sidebarWidth]);

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
    function handleMouseMove(event: MouseEvent) {
      if (!isResizingRef.current) {
        return;
      }
      const rect = appRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const maxWidth = Math.max(minSidebarWidth, rect.width - minWorkspaceWidth);
      const nextWidth = Math.min(
        Math.max(event.clientX - rect.left, minSidebarWidth),
        maxWidth
      );
      setSidebarWidth(nextWidth);
    }

    function stopResize() {
      if (!isResizingRef.current) {
        return;
      }
      isResizingRef.current = false;
      document.body.classList.remove("is-resizing");
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResize);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResize);
    };
  }, []);

  useEffect(() => {
    function handleResize() {
      const rect = appRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const maxWidth = Math.max(minSidebarWidth, rect.width - minWorkspaceWidth);
      setSidebarWidth((prev) => Math.min(prev, maxWidth));
    }
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
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

  function startResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    if (window.innerWidth < 900) {
      return;
    }
    isResizingRef.current = true;
    document.body.classList.add("is-resizing");
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
    const { formValues: nextFormValues, fileValues: nextFileValues } =
      buildFormDefaults(endpoint.body_fields);
    return {
      params,
      body: formatBodyExample(endpoint.body_example),
      bodyType: defaultBodyType(endpoint),
      formValues: nextFormValues,
      fileValues: nextFileValues,
    };
  }

  function updateDraftForSelected(
    nextParams: Record<string, string>,
    nextBody: string,
    nextBodyType: string,
    nextFormValues: Record<string, string>,
    nextFileValues: Record<string, string[]>
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
        bodyType: nextBodyType,
        formValues: nextFormValues,
        fileValues: nextFileValues,
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

  function findCollectionUrlForEndpoint(endpoint: Endpoint) {
    const targetKey = endpointKey(endpoint);
    for (const collection of Object.values(collectionsRef.current)) {
      for (const endpoints of Object.values(collection.groups)) {
        for (const candidate of endpoints) {
          if (candidate === endpoint || endpointKey(candidate) === targetKey) {
            return collection.url;
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

  function selectEndpoint(endpoint: Endpoint, collectionUrl: string) {
    const key = endpointKey(endpoint);
    const draft = endpointDrafts[key] || buildDraftFromEndpoint(endpoint);
    const resolvedBodyType =
      endpoint.body_media_types?.includes(draft.bodyType) || !endpoint.body_media_types
        ? draft.bodyType
        : defaultBodyType(endpoint);
    const { formValues: defaultFormValues, fileValues: defaultFileValues } =
      buildFormDefaults(endpoint.body_fields);
    const nextDraft: RequestDraft = {
      ...draft,
      bodyType: resolvedBodyType,
      formValues: draft.formValues || defaultFormValues,
      fileValues: draft.fileValues || defaultFileValues,
    };
    setSelectedEndpoint(endpoint);
    setMethod(endpoint.method);
    setUrl(resolveEndpointUrl(endpoint, collectionUrl));
    setParamValues(draft.params);
    setRequestBody(draft.body);
    setBodyType(resolvedBodyType);
    setFormValues(nextDraft.formValues);
    setFileValues(nextDraft.fileValues);
    setEndpointDrafts((prev) => ({ ...prev, [key]: nextDraft }));
    setResponse("");
    showMessage(`Loaded: ${endpoint.method} ${endpoint.path}`);
  }

  function findEndpointByRequest(entry: HistoryEntry) {
    for (const collection of Object.values(collections)) {
      for (const endpoints of Object.values(collection.groups)) {
        for (const endpoint of endpoints) {
          if (
            endpoint.method === entry.method &&
            normalizeEndpointPath(endpoint.path) === normalizeEndpointPath(entry.url)
          ) {
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
    const requestedBodyType =
      entry.body_type ||
      (matchedEndpoint ? defaultBodyType(matchedEndpoint) : "application/json");
    const nextBodyType =
      matchedEndpoint?.body_media_types &&
      matchedEndpoint.body_media_types.length > 0 &&
      !matchedEndpoint.body_media_types.includes(requestedBodyType)
        ? defaultBodyType(matchedEndpoint)
        : requestedBodyType;
    setSelectedEndpoint(matchedEndpoint);
    setMethod(entry.method);
    if (matchedEndpoint) {
      const collectionUrl = findCollectionUrlForEndpoint(matchedEndpoint);
      setUrl(resolveEndpointUrl(matchedEndpoint, collectionUrl));
    } else {
      setUrl(entry.resolved_url || entry.url);
    }
    setParamValues(entry.params);
    setBodyType(nextBodyType);
    if (isFormBodyType(nextBodyType)) {
      setFormValues(entry.form_values || {});
      setFileValues(entry.file_values || {});
      setRequestBody("");
    } else {
      setFormValues({});
      setFileValues({});
      setRequestBody(entry.body);
    }
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
    bodyInput: string,
    bodyTypeInput: string,
    formValuesInput: Record<string, string>,
    fileValuesInput: Record<string, string[]>
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

    const hasHeader = (name: string) =>
      Object.keys(headers).some(
        (key) => key.toLowerCase() === name.toLowerCase()
      );
    const isFormBody = isFormBodyType(bodyTypeInput);
    const allowBody = methodInput !== "GET";
    let body: string | null = null;
    let multipart: {
      fields: Record<string, string>;
      files: Array<{ name: string; paths: string[] }>;
    } | null = null;

    if (allowBody) {
      if (bodyTypeInput === "multipart/form-data") {
        const fields = Object.fromEntries(
          Object.entries(formValuesInput).filter(([, value]) => value)
        );
        const files = Object.entries(fileValuesInput)
          .map(([name, paths]) => ({
            name,
            paths: paths.filter((path) => path),
          }))
          .filter((entry) => entry.paths.length > 0);
        multipart = { fields, files };
      } else if (bodyTypeInput === "application/x-www-form-urlencoded") {
        const formParams = new URLSearchParams();
        Object.entries(formValuesInput).forEach(([key, value]) => {
          if (value) {
            formParams.append(key, value);
          }
        });
        const encoded = formParams.toString();
        body = encoded.length > 0 ? encoded : null;
        if (body && !hasHeader("Content-Type")) {
          headers["Content-Type"] = "application/x-www-form-urlencoded";
        }
      } else if (!isFormBody) {
        const trimmed = bodyInput.trim();
        body = trimmed.length > 0 ? bodyInput : null;
        if (body && bodyTypeInput && !hasHeader("Content-Type")) {
          headers["Content-Type"] = bodyTypeInput;
        }
      }
    }

    return { finalUrl, headers, body, multipart };
  }

  async function runBackgroundRequest(endpoint: Endpoint) {
    const key = endpointKey(endpoint);
    if (autoRequestInFlightRef.current[key]) {
      return;
    }
    autoRequestInFlightRef.current[key] = true;
    const collectionUrl = findCollectionUrlForEndpoint(endpoint);
    const resolvedEndpointUrl = resolveEndpointUrl(endpoint, collectionUrl);
    const draft = draftsRef.current[key] || buildDraftFromEndpoint(endpoint);
    const { finalUrl, headers, body, multipart } = buildRequestPayload(
      endpoint,
      endpoint.method,
      resolvedEndpointUrl,
      draft.params,
      draft.body,
      draft.bodyType,
      draft.formValues,
      draft.fileValues
    );
    try {
      const res: string = await invoke("request", {
        method: endpoint.method,
        url: finalUrl,
        headers,
        body,
        multipart,
      });
      addHistoryEntry({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        created_at: Date.now(),
        method: endpoint.method,
        url: endpoint.path,
        resolved_url: finalUrl,
        params: draft.params,
        body: isFormBodyType(draft.bodyType) ? "" : draft.body,
        body_type: draft.bodyType,
        form_values: isFormBodyType(draft.bodyType) ? draft.formValues : undefined,
        file_values: isFormBodyType(draft.bodyType) ? draft.fileValues : undefined,
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
        body: isFormBodyType(draft.bodyType) ? "" : draft.body,
        body_type: draft.bodyType,
        form_values: isFormBodyType(draft.bodyType) ? draft.formValues : undefined,
        file_values: isFormBodyType(draft.bodyType) ? draft.fileValues : undefined,
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
    const bodyTypeSnapshot = bodyType;
    const formSnapshot = { ...formValues };
    const fileSnapshot = { ...fileValues };
    const urlSnapshot = trimmedUrl;
    setIsSending(true);
    setResponse("Sending request...");
    let finalResponse = "";
    let resolvedUrl = trimmedUrl;
    try {
      const { finalUrl, headers, body, multipart } = buildRequestPayload(
        selectedEndpoint,
        method,
        trimmedUrl,
        paramSnapshot,
        bodySnapshot,
        bodyTypeSnapshot,
        formSnapshot,
        fileSnapshot
      );
      resolvedUrl = finalUrl;
      const res: string = await invoke("request", {
        method,
        url: finalUrl,
        headers,
        body,
        multipart,
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
          body: isFormBodyType(bodyTypeSnapshot) ? "" : bodySnapshot,
          body_type: bodyTypeSnapshot,
          form_values: isFormBodyType(bodyTypeSnapshot)
            ? formSnapshot
            : undefined,
          file_values: isFormBodyType(bodyTypeSnapshot)
            ? fileSnapshot
            : undefined,
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
    <div className="app" ref={appRef} style={appStyle}>
      <Sidebar
        openApiUrl={openApiUrl}
        onOpenApiUrlChange={setOpenApiUrl}
        onImport={importOpenApi}
        openApiHistory={openApiHistory}
        onSelectOpenApiHistory={setOpenApiUrl}
        collections={collections}
        selectedEndpointKey={selectedEndpointKey}
        onSelectEndpoint={selectEndpoint}
        onToggleCollectionSync={async (url, enabled) => {
          try {
            await invoke("toggle_sync", { url, enabled });
            setCollections((prev) => {
              const collection = prev[url];
              if (!collection) {
                return prev;
              }
              return {
                ...prev,
                [url]: {
                  ...collection,
                  sync_enabled: enabled,
                },
              };
            });
            showMessage(
              enabled
                ? "OpenAPI 동기화를 켰습니다."
                : "OpenAPI 동기화를 껐습니다."
            );
          } catch (error) {
            showMessage(`동기화 설정 실패: ${String(error)}`);
          }
        }}
        syncStatus={syncStatus}
        lastSyncedAt={lastSyncedAt}
        isImporting={isImporting}
      />
      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={startResize}
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
              updateDraftForSelected(
                next,
                requestBody,
                bodyType,
                formValues,
                fileValues
              );
              return next;
            })
          }
          requestBody={requestBody}
          onRequestBodyChange={(value) => {
            setRequestBody(value);
            updateDraftForSelected(
              paramValues,
              value,
              bodyType,
              formValues,
              fileValues
            );
          }}
          bodyType={bodyType}
          onBodyTypeChange={(value) => {
            setBodyType(value);
            updateDraftForSelected(
              paramValues,
              requestBody,
              value,
              formValues,
              fileValues
            );
          }}
          formValues={formValues}
          fileValues={fileValues}
          onFormValueChange={(name, value) => {
            setFormValues((prev) => {
              const next = { ...prev, [name]: value };
              updateDraftForSelected(
                paramValues,
                requestBody,
                bodyType,
                next,
                fileValues
              );
              return next;
            });
          }}
          onFileValuesChange={(name, paths) => {
            setFileValues((prev) => {
              const next = { ...prev, [name]: paths };
              updateDraftForSelected(
                paramValues,
                requestBody,
                bodyType,
                formValues,
                next
              );
              return next;
            });
          }}
        />
        <ResponsePanel
          response={response}
          isSending={isSending}
          history={visibleHistory}
          responseSchemas={selectedEndpoint?.response_schemas ?? []}
          onReuseHistory={reuseHistory}
          onPreviewHistory={previewHistory}
        />
      </main>
      <StatusBar message={statusMessage} />
    </div>
  );
}

export default App;
