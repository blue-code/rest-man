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
};

const methodOptions: HttpMethod[] = ["GET", "POST", "PUT", "DELETE"];

function hasBody(method: HttpMethod) {
  return method !== "GET";
}

function buildParamLabel(param: Parameter) {
  return `${param.name}${param.required ? " *" : ""}`;
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
}: RequestPanelProps) {
  const showBody = hasBody(method);
  const parameters = selectedEndpoint?.parameters ?? [];
  const bodyRequired = selectedEndpoint?.body_required;
  const bodyDescription = selectedEndpoint?.body_description;
  const autoToggleDisabled = !selectedEndpoint;

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
              Body {bodyRequired ? <span className="pill">Required</span> : null}
            </div>
            {bodyDescription && (
              <div className="body-hint">{bodyDescription}</div>
            )}
            {showBody ? (
              <textarea
                className="json-editor"
                value={requestBody}
                onChange={(event) => onRequestBodyChange(event.target.value)}
                placeholder='{ "id": 1, "name": "example" }'
              />
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
