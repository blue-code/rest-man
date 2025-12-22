export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface Parameter {
  name: string;
  in_type: "path" | "query" | "header" | string;
  description?: string;
  required: boolean;
  example?: unknown;
}

export interface Endpoint {
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  parameters: Parameter[];
  body_example?: string;
  body_description?: string;
  body_required?: boolean;
}

export interface HistoryEntry {
  id: string;
  created_at: number;
  method: HttpMethod;
  url: string;
  resolved_url?: string;
  params: Record<string, string>;
  body: string;
  response: string;
}

export interface Collection {
  name: string;
  url: string;
  groups: Record<string, Endpoint[]>;
}
