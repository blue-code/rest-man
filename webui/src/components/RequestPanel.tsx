import { open } from "@tauri-apps/api/dialog";
import type { Endpoint, HttpMethod, Parameter } from "../types";

type RequestPanelProps = {
  method: HttpMethod;
  url: string;
  onMethodChange: (method: HttpMethod) => void;
  onUrlChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  selectedEndpoint: Endpoint | null;
  autoRequestEnabled: boolean;
  onToggleAutoRequest: (enabled: boolean) => void;
  autoRequestIntervalMs: number;
  onAutoRequestIntervalChange: (intervalMs: number) => void;
  paramValues: Record<string, string>;
  onParamChange: (name: string, value: string) => void;
  requestBody: string;
  onRequestBodyChange: (value: string) => void;
  bodyType: string;
  onBodyTypeChange: (value: string) => void;
  formValues: Record<string, string>;
  fileValues: Record<string, string[]>;
  onFormValueChange: (name: string, value: string) => void;
  onFileValuesChange: (name: string, paths: string[]) => void;
};

const methodOptions: HttpMethod[] = ["GET", "POST", "PUT", "DELETE"];

function hasBody(method: HttpMethod) {
  return method !== "GET";
}

function buildParamLabel(param: Parameter) {
  return `${param.name}${param.required ? " *" : ""}`;
}

function formatFieldLabel(name: string, required?: boolean) {
  return `${name}${required ? " *" : ""}`;
}

function formatFileName(path: string) {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function RequestPanel({
  method,
  url,
  onMethodChange,
  onUrlChange,
  onSend,
  isSending,
  selectedEndpoint,
  autoRequestEnabled,
  onToggleAutoRequest,
  autoRequestIntervalMs,
  onAutoRequestIntervalChange,
  paramValues,
  onParamChange,
  requestBody,
  onRequestBodyChange,
  bodyType,
  onBodyTypeChange,
  formValues,
  fileValues,
  onFormValueChange,
  onFileValuesChange,
}: RequestPanelProps) {
  const showBody = hasBody(method);
  const parameters = selectedEndpoint?.parameters ?? [];
  const bodyRequired = selectedEndpoint?.body_required;
  const bodyDescription = selectedEndpoint?.body_description;
  const bodyMediaTypes = selectedEndpoint?.body_media_types ?? [];
  const bodyFields = selectedEndpoint?.body_fields ?? [];
  const autoToggleDisabled = !selectedEndpoint;
  const isFormBody =
    bodyType === "multipart/form-data" ||
    bodyType === "application/x-www-form-urlencoded";
  const showBodyTypeSelect = bodyMediaTypes.length > 1;
  const showBodyTypeLabel = bodyMediaTypes.length === 1;

  async function handlePickFile(fieldName: string, allowMultiple: boolean) {
    try {
      const selection = await open({ multiple: allowMultiple });
      if (!selection) {
        return;
      }
      const paths = Array.isArray(selection) ? selection : [selection];
      onFileValuesChange(fieldName, paths);
    } catch {
      return;
    }
  }

  return (
    <section className="panel panel--request">
      <div className="panel__header panel__header--split">
        <div>
          <div className="panel__title">Request</div>
          <div className="panel__hint">
            {selectedEndpoint
              ? selectedEndpoint.summary ||
                selectedEndpoint.description ||
                "Loaded from collection"
              : "Select an endpoint or type a URL"}
          </div>
        </div>
        <div className="panel__actions">
          <label className="sync-toggle">
            <input
              type="checkbox"
              checked={autoRequestEnabled}
              disabled={autoToggleDisabled}
              onChange={(event) => onToggleAutoRequest(event.target.checked)}
            />
            <span className="sync-toggle__label">자동 호출</span>
          </label>
          <select
            className="interval-select"
            value={String(autoRequestIntervalMs)}
            onChange={(event) =>
              onAutoRequestIntervalChange(Number(event.target.value))
            }
            disabled={autoToggleDisabled}
            aria-label="자동 호출 간격"
          >
            <option value="30000">30초</option>
            <option value="60000">1분</option>
            <option value="300000">5분</option>
          </select>
        </div>
      </div>
      <div className="panel__body">
        <div className="request-bar">
          <select
            value={method}
            onChange={(event) => onMethodChange(event.target.value as HttpMethod)}
            aria-label="HTTP method"
          >
            {methodOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder="https://api.example.com/v1/resource"
            aria-label="Request URL"
          />
          <button
            type="button"
            className="primary"
            onClick={onSend}
            disabled={isSending}
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </div>

        <div className="request-grid">
          <div className="card">
            <div className="card__header">Parameters</div>
            {parameters.length === 0 ? (
              <div className="empty-state empty-state--compact">
                <div className="empty-state__title">No parameters</div>
                <div className="empty-state__body">
                  This endpoint does not define path, query, or header inputs.
                </div>
              </div>
            ) : (
              <div className="param-list">
                {parameters.map((param) => (
                  <div key={param.name} className="param-row">
                    <div className="param-meta">
                      <span className="param-name">
                        <code>{buildParamLabel(param)}</code>
                      </span>
                      <span className="param-type">{param.in_type}</span>
                    </div>
                    <input
                      value={paramValues[param.name] || ""}
                      onChange={(event) =>
                        onParamChange(param.name, event.target.value)
                      }
                      placeholder={param.in_type}
                    />
                    <div className="param-desc">
                      {param.description || "No description"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`card ${showBody ? "" : "card--disabled"}`}>
            <div className="card__header">
              <span>
                Body {bodyRequired ? <span className="pill">Required</span> : null}
              </span>
              {showBodyTypeSelect ? (
                <select
                  className="body-type-select"
                  value={bodyType}
                  onChange={(event) => onBodyTypeChange(event.target.value)}
                  disabled={!showBody}
                  aria-label="Request body content type"
                >
                  {bodyMediaTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              ) : showBodyTypeLabel ? (
                <span className="pill">{bodyMediaTypes[0]}</span>
              ) : null}
            </div>
            {bodyDescription && (
              <div className="body-hint">{bodyDescription}</div>
            )}
            {showBody ? (
              isFormBody ? (
                bodyFields.length === 0 ? (
                  <div className="empty-state empty-state--compact">
                    <div className="empty-state__title">No form fields</div>
                    <div className="empty-state__body">
                      OpenAPI does not define multipart/form fields for this
                      request.
                    </div>
                  </div>
                ) : (
                  <div className="param-list">
                    {bodyFields.map((field) => {
                      const fieldFiles = fileValues[field.name] || [];
                      return (
                        <div key={field.name} className="param-row">
                          <div className="param-meta">
                            <span className="param-name">
                              <code>
                                {formatFieldLabel(field.name, field.required)}
                              </code>
                            </span>
                            <span className="param-type">
                              {field.is_file ? "file" : "text"}
                              {field.is_array ? "[]" : ""}
                            </span>
                          </div>
                          {field.is_file ? (
                            <div className="file-picker">
                              <div className="file-picker__actions">
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() =>
                                    handlePickFile(field.name, field.is_array)
                                  }
                                >
                                  파일 선택
                                </button>
                                {fieldFiles.length > 0 ? (
                                  <button
                                    type="button"
                                    className="ghost"
                                    onClick={() =>
                                      onFileValuesChange(field.name, [])
                                    }
                                  >
                                    비우기
                                  </button>
                                ) : null}
                              </div>
                              {fieldFiles.length > 0 ? (
                                <div className="file-picker__list">
                                  {fieldFiles.map((path) => (
                                    <span key={path}>
                                      {formatFileName(path)}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <div className="file-picker__empty">
                                  선택된 파일 없음
                                </div>
                              )}
                            </div>
                          ) : (
                            <input
                              value={formValues[field.name] || ""}
                              onChange={(event) =>
                                onFormValueChange(
                                  field.name,
                                  event.target.value
                                )
                              }
                              placeholder="text"
                            />
                          )}
                          <div className="param-desc">
                            {field.description || "No description"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <textarea
                  className="json-editor"
                  value={requestBody}
                  onChange={(event) => onRequestBodyChange(event.target.value)}
                  placeholder='{ "id": 1, "name": "example" }'
                />
              )
            ) : (
              <div className="empty-state empty-state--compact">
                <div className="empty-state__title">No body for GET</div>
                <div className="empty-state__body">
                  Switch to POST or PUT to enable a request body.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
