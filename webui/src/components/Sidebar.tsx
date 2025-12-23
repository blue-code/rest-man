import { useEffect, useState } from "react";
import type { Collection, Endpoint } from "../types";

type SidebarProps = {
  openApiUrl: string;
  onOpenApiUrlChange: (value: string) => void;
  onImport: () => void;
  openApiHistory: string[];
  onSelectOpenApiHistory: (url: string) => void;
  collections: Record<string, Collection>;
  selectedEndpointKey: string | null;
  onSelectEndpoint: (endpoint: Endpoint) => void;
  onToggleCollectionSync: (url: string, enabled: boolean) => void;
  syncStatus: "idle" | "syncing" | "updated";
  lastSyncedAt: number | null;
  isImporting: boolean;
};

function endpointKey(endpoint: Endpoint) {
  return `${endpoint.method}:${endpoint.path}`;
}

function endpointLabel(endpoint: Endpoint) {
  const hint = endpoint.summary || endpoint.description;
  if (hint) {
    return hint;
  }
  const pathName = endpoint.path.split("/").filter(Boolean).pop();
  return pathName || "기본";
}

function endpointSortKey(endpoint: Endpoint) {
  return (endpoint.summary || endpoint.description || endpoint.path).toLowerCase();
}

function sortByLabel(a: string, b: string) {
  return a.localeCompare(b, "ko", { numeric: true, sensitivity: "base" });
}

function formatSyncLabel(
  status: "idle" | "syncing" | "updated",
  lastSyncedAt: number | null
) {
  if (status === "syncing") {
    return "OpenAPI 동기화 중";
  }
  if (lastSyncedAt) {
    const time = new Date(lastSyncedAt).toLocaleTimeString();
    return `최근 동기화 ${time}`;
  }
  return "동기화 대기";
}

export function Sidebar({
  openApiUrl,
  onOpenApiUrlChange,
  onImport,
  openApiHistory,
  onSelectOpenApiHistory,
  collections,
  selectedEndpointKey,
  onSelectEndpoint,
  onToggleCollectionSync,
  syncStatus,
  lastSyncedAt,
  isImporting,
}: SidebarProps) {
  const collectionValues = Object.values(collections);
  const hasCollections = collectionValues.length > 0;
  const [expandedCollections, setExpandedCollections] = useState<
    Record<string, boolean>
  >({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {}
  );

  useEffect(() => {
    setExpandedCollections((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.keys(collections).forEach((url) => {
        if (next[url] === undefined) {
          next[url] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [collections]);

  useEffect(() => {
    setExpandedGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      collectionValues.forEach((collection) => {
        Object.keys(collection.groups).forEach((tag) => {
          const key = `${collection.url}::${tag}`;
          if (next[key] === undefined) {
            next[key] = false;
            changed = true;
          }
        });
      });
      return changed ? next : prev;
    });
  }, [collectionValues]);

  function toggleCollection(url: string) {
    setExpandedCollections((prev) => ({
      ...prev,
      [url]: !prev[url],
    }));
  }

  function toggleGroup(groupKey: string) {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <div className="sync-banner">
          <span
            className={
              syncStatus === "syncing"
                ? "sync-dot sync-dot--syncing"
                : syncStatus === "updated"
                  ? "sync-dot sync-dot--updated"
                  : "sync-dot"
            }
          />
          <span className="sync-text">
            {formatSyncLabel(syncStatus, lastSyncedAt)}
          </span>
        </div>
        <div className="brand">
          <img src="/logo.png" alt="RestMan Logo" className="brand__logo" />
          <div className="brand__content">
            <div className="brand__name">RestMan</div>
            <div className="brand__tagline">OpenAPI-driven request console</div>
          </div>
        </div>
        <div className="import">
          <label className="field-label" htmlFor="openapi-url">
            OpenAPI 가져오기
          </label>
          <div className="import__row">
            <input
              id="openapi-url"
              value={openApiUrl}
              onChange={(event) => onOpenApiUrlChange(event.target.value)}
              placeholder="https://api.example.com/openapi.json"
            />
            <button
              type="button"
              onClick={onImport}
              disabled={isImporting || !openApiUrl.trim()}
            >
              {isImporting ? "가져오는 중..." : "가져오기"}
            </button>
          </div>
        </div>
        {openApiHistory.length > 0 && (
          <div className="openapi-history">
            <div className="field-label">최근 OpenAPI</div>
            <div className="openapi-history__list">
              {openApiHistory.map((url) => (
                <button
                  key={url}
                  type="button"
                  className="openapi-history__item"
                  onClick={() => onSelectOpenApiHistory(url)}
                  title={url}
                >
                  {url}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="sidebar__content">
        <div className="sidebar__section-title">컬렉션</div>
        {!hasCollections && (
          <div className="empty-state">
            <div className="empty-state__title">아직 컬렉션이 없습니다</div>
            <div className="empty-state__body">
              OpenAPI JSON URL을 입력해 목록을 불러오세요.
            </div>
          </div>
        )}
        {collectionValues.map((collection) => (
          <div key={collection.url} className="collection">
            <div className="collection__header">
              <button
                type="button"
                className="collection__toggle"
                onClick={() => toggleCollection(collection.url)}
                aria-expanded={Boolean(expandedCollections[collection.url])}
              >
                <span className="collection__title">{collection.name}</span>
                <span
                  className={`chevron ${expandedCollections[collection.url] ? "chevron--open" : ""
                    }`}
                  aria-hidden="true"
                >
                  ▾
                </span>
              </button>
              <label className="sync-toggle sync-toggle--compact">
                <input
                  type="checkbox"
                  checked={collection.sync_enabled !== false}
                  onChange={(event) =>
                    onToggleCollectionSync(
                      collection.url,
                      event.target.checked
                    )
                  }
                />
                <span className="sync-toggle__label">동기화</span>
              </label>
            </div>
            {expandedCollections[collection.url] &&
              Object.entries(collection.groups)
                .sort(([tagA], [tagB]) => sortByLabel(tagA, tagB))
                .map(([tag, endpoints]) => {
                  const groupKey = `${collection.url}::${tag}`;
                  const isGroupOpen = expandedGroups[groupKey];
                  const sortedEndpoints = [...endpoints].sort((a, b) =>
                    sortByLabel(endpointSortKey(a), endpointSortKey(b))
                  );
                  return (
                    <div key={tag} className="tag-group">
                      <button
                        type="button"
                        className="tag-group__toggle"
                        onClick={() => toggleGroup(groupKey)}
                        aria-expanded={Boolean(isGroupOpen)}
                      >
                        <span className="tag-group__title">{tag}</span>
                        <span
                          className={`chevron ${isGroupOpen ? "chevron--open" : ""
                            }`}
                          aria-hidden="true"
                        >
                          ▾
                        </span>
                      </button>
                      {isGroupOpen &&
                        sortedEndpoints.map((endpoint) => {
                          const key = endpointKey(endpoint);
                          return (
                            <div
                              key={key}
                              role="button"
                              tabIndex={0}
                              className={`endpoint ${selectedEndpointKey === key
                                  ? "endpoint--active"
                                  : ""
                                }`}
                              onClick={() => onSelectEndpoint(endpoint)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  onSelectEndpoint(endpoint);
                                }
                              }}
                            >
                              <span
                                className={`method-pill method-pill--${endpoint.method}`}
                              >
                                {endpoint.method}
                              </span>
                              <span className="endpoint__text">
                                <span className="endpoint__name">
                                  {endpointLabel(endpoint)}
                                </span>
                                <span
                                  className="endpoint__path"
                                  title={endpoint.path}
                                >
                                  {endpoint.path}
                                </span>
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
          </div>
        ))}
      </div>
    </aside>
  );
}
