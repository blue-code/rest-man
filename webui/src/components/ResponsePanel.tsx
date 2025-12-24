import { useEffect, useMemo, useState } from "react";
import type { HistoryEntry } from "../types";

type ParsedResponse = {
  statusLine: string | null;
  headers: Array<{ key: string; value: string }>;
  body: string;
  bodyPretty: string;
  isJson: boolean;
  jsonValue?: unknown;
};

type ResponsePanelProps = {
  response: string;
  isSending: boolean;
  history: HistoryEntry[];
  onReuseHistory: (entry: HistoryEntry) => void;
  onPreviewHistory: (entry: HistoryEntry) => void;
};

const headersPrefix = "\n\nHeaders:\n";
const bodyPrefix = "\n\nBody:\n";

function parseResponse(raw: string): ParsedResponse | null {
  if (!raw) return null;
  if (raw.startsWith("Error:")) {
    return {
      statusLine: "Error",
      headers: [],
      body: raw,
      bodyPretty: raw,
      isJson: false,
    };
  }
  if (!raw.startsWith("Status: ")) {
    return {
      statusLine: null,
      headers: [],
      body: raw,
      bodyPretty: raw,
      isJson: false,
    };
  }
  const headersIndex = raw.indexOf(headersPrefix);
  const bodyIndex = raw.indexOf(bodyPrefix);
  if (headersIndex === -1 || bodyIndex === -1) {
    return {
      statusLine: raw.replace("Status:", "").trim(),
      headers: [],
      body: raw,
      bodyPretty: raw,
      isJson: false,
    };
  }
  const statusLine = raw.slice("Status: ".length, headersIndex).trim();
  const headersBlock = raw
    .slice(headersIndex + headersPrefix.length, bodyIndex)
    .trim();
  const body = raw.slice(bodyIndex + bodyPrefix.length);
  const headers = headersBlock
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(":");
      if (separator === -1) {
        return { key: line, value: "" };
      }
      return {
        key: line.slice(0, separator).trim(),
        value: line.slice(separator + 1).trim(),
      };
    });
  const bodyTrimmed = body.trim();
  let bodyPretty = body;
  let isJson = false;
  let jsonValue: unknown = undefined;
  if (bodyTrimmed.startsWith("{") || bodyTrimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(bodyTrimmed);
      bodyPretty = JSON.stringify(parsed, null, 2);
      isJson = true;
      jsonValue = parsed;
    } catch {
      bodyPretty = body;
    }
  }
  return {
    statusLine,
    headers,
    body,
    bodyPretty,
    isJson,
    jsonValue,
  };
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function formatJsonValue(value: unknown) {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return `"${value}"`;
  }
  return String(value);
}

function JsonNode({
  name,
  value,
}: {
  name?: string;
  value: unknown;
}) {
  const isArray = Array.isArray(value);
  const isObject = value !== null && typeof value === "object" && !isArray;

  if (isArray) {
    const items = value as unknown[];
    return (
      <details className="json-node" open>
        <summary>
          <span className="json-node__key">{name || "root"}</span>
          <span className="json-node__meta">Array({items.length})</span>
        </summary>
        <div className="json-node__children">
          {items.map((item, index) => (
            <JsonNode key={index} name={String(index)} value={item} />
          ))}
        </div>
      </details>
    );
  }

  if (isObject) {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <details className="json-node" open>
        <summary>
          <span className="json-node__key">{name || "root"}</span>
          <span className="json-node__meta">Object({entries.length})</span>
        </summary>
        <div className="json-node__children">
          {entries.map(([key, child]) => (
            <JsonNode key={key} name={key} value={child} />
          ))}
        </div>
      </details>
    );
  }

  return (
    <div className="json-leaf">
      {name ? <span className="json-leaf__key">{name}</span> : null}
      <span className={`json-leaf__value json-leaf__value--${typeof value}`}>
        {formatJsonValue(value)}
      </span>
    </div>
  );
}

function hasRequestBody(entry: HistoryEntry) {
  if (entry.body && entry.body.trim().length > 0) {
    return true;
  }
  if (entry.form_values) {
    if (Object.values(entry.form_values).some((value) => value)) {
      return true;
    }
  }
  if (entry.file_values) {
    if (Object.values(entry.file_values).some((paths) => paths.length > 0)) {
      return true;
    }
  }
  return false;
}

export function ResponsePanel({
  response,
  isSending,
  history,
  onReuseHistory,
  onPreviewHistory,
}: ResponsePanelProps) {
  const [activeTab, setActiveTab] = useState<"response" | "history">(
    "response"
  );
  const [headersExpanded, setHeadersExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle"
  );
  const parsed = useMemo(() => parseResponse(response), [response]);

  useEffect(() => {
    setHeadersExpanded(false);
    setCopyState("idle");
  }, [response]);

  async function copyBody() {
    const text = parsed?.bodyPretty || response;
    if (!text) {
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 1600);
    }
  }

  return (
    <section className="panel panel--response">
      <div className="panel__header panel__header--tabs">
        <div>
          <div className="panel__title">응답</div>
          <div className="panel__hint">
            {isSending
              ? "서버 응답을 기다리는 중입니다."
              : "상태, 헤더, 본문 결과를 확인하세요."}
          </div>
        </div>
        <div className="tabs">
          <button
            type="button"
            className={`tab ${activeTab === "response" ? "tab--active" : ""}`}
            onClick={() => setActiveTab("response")}
          >
            결과
          </button>
          <button
            type="button"
            className={`tab ${activeTab === "history" ? "tab--active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            히스토리
          </button>
        </div>
      </div>
      <div className="panel__body panel__body--scroll">
        {activeTab === "response" ? (
          !response ? (
            <div className="empty-state">
              <div className="empty-state__title">응답이 없습니다</div>
              <div className="empty-state__body">
                요청을 보내면 여기에 결과가 표시됩니다.
              </div>
            </div>
          ) : (
            <div className="response-layout">
              {parsed?.statusLine && (
                <div className="response-meta">
                  <span className="response-badge">Status</span>
                  <span className="response-status">{parsed.statusLine}</span>
                </div>
              )}
              {parsed?.headers.length ? (
                <div className="response-section">
                  <div className="response-section__header">
                    <div className="response-section__title">Headers</div>
                    <button
                      type="button"
                      className="ghost ghost--compact"
                      onClick={() => setHeadersExpanded((prev) => !prev)}
                    >
                      {headersExpanded ? "접기" : "펼치기"}
                    </button>
                  </div>
                  {headersExpanded ? (
                    <div className="response-headers">
                      {parsed.headers.map((header) => (
                        <div key={`${header.key}:${header.value}`}>
                          <span className="response-key">{header.key}</span>
                          <span className="response-value">{header.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="response-headers__collapsed">
                      {parsed.headers.length}개 헤더 숨김
                    </div>
                  )}
                </div>
              ) : null}
              <div className="response-section">
                <div className="response-section__header">
                  <div className="response-section__title">
                    Body{" "}
                    {parsed?.isJson ? <span className="pill">JSON</span> : null}
                  </div>
                  {response ? (
                    <button
                      type="button"
                      className="ghost ghost--compact"
                      onClick={copyBody}
                    >
                      {copyState === "copied"
                        ? "복사됨"
                        : copyState === "error"
                        ? "복사 실패"
                        : "복사"}
                    </button>
                  ) : null}
                </div>
                {parsed?.isJson && parsed.jsonValue !== undefined ? (
                  <div className="json-tree">
                    <JsonNode value={parsed.jsonValue} />
                  </div>
                ) : (
                  <pre className="response-block">
                    {parsed ? parsed.bodyPretty : response}
                  </pre>
                )}
              </div>
            </div>
          )
        ) : history.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__title">히스토리가 비어 있습니다</div>
            <div className="empty-state__body">
              요청을 보내면 자동으로 기록됩니다.
            </div>
          </div>
        ) : (
          <div className="history-list">
            {history.map((entry) => {
              const parsedEntry = parseResponse(entry.response);
              return (
                <div key={entry.id} className="history-item">
                  <div className="history-item__header">
                    <span className={`method-pill method-pill--${entry.method}`}>
                      {entry.method}
                    </span>
                    <div className="history-item__meta">
                      <div className="history-item__url">
                        {entry.resolved_url || entry.url}
                      </div>
                      <div className="history-item__time">
                        {formatTimestamp(entry.created_at)}
                      </div>
                    </div>
                    <div className="history-item__actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setActiveTab("response");
                          onPreviewHistory(entry);
                        }}
                      >
                        보기
                      </button>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => onReuseHistory(entry)}
                      >
                        다시 사용
                      </button>
                    </div>
                  </div>
                  <div className="history-item__body">
                    <div className="history-item__row">
                      <span className="history-item__label">요청 본문</span>
                      <span className="history-item__value">
                        {hasRequestBody(entry) ? "있음" : "없음"}
                      </span>
                    </div>
                    <div className="history-item__row">
                      <span className="history-item__label">파라미터</span>
                      <span className="history-item__value">
                        {Object.keys(entry.params).length}개
                      </span>
                    </div>
                    <div className="history-item__row">
                      <span className="history-item__label">응답 상태</span>
                      <span className="history-item__value">
                        {parsedEntry?.statusLine || "확인 불가"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
