import { logger } from "@adv/shared";

/**
 * Typed error for every failure mode this client can produce. `retryAfter` (seconds) is set
 * for 429 responses, read from the `Retry-After` header PostHog documents on rate-limited
 * requests (see NOTES.md — the exact requests/hour figure PostHog enforces has moved over
 * time, so we never hardcode a number and always defer to the server).
 */
export class AnalyticsError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryAfter?: number;

  constructor(
    message: string,
    opts: { code: string; status?: number; retryAfter?: number; cause?: unknown },
  ) {
    super(message);
    this.name = "AnalyticsError";
    this.code = opts.code;
    this.status = opts.status;
    this.retryAfter = opts.retryAfter;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

export interface PostHogClientOptions {
  host?: string;
  personalApiKey?: string;
  fetchImpl?: typeof fetch;
}

export interface PostHogProject {
  id: number;
  organization: string;
  name: string;
  /** Client-side SDK token (`phc_...`) — this is what goes into `snippetFor`. */
  api_token: string;
  [key: string]: unknown;
}

export interface QueryOptions {
  /** Appended as `LIMIT n` when the HogQL text doesn't already contain a LIMIT clause. */
  limit?: number;
  name?: string;
}

export interface QueryResponse<Row = unknown[]> {
  results: Row[];
  columns?: string[];
  types?: string[];
  hogql?: string;
  is_cached?: boolean;
  [key: string]: unknown;
}

/**
 * One aggregated heatmap data point. Shape is best-effort (see NOTES.md) — PostHog's heatmap
 * API only exposes aggregated click/mouse buckets, not raw session-by-session paths.
 */
export interface HeatmapBucket {
  x: number;
  y: number;
  count: number;
  [key: string]: unknown;
}

export interface HeatmapListParams {
  url?: string;
  urlExact?: string;
  dateFrom?: string;
  dateTo?: string;
  type?: "click" | "rageclick" | "mousemove" | "scrolldepth";
}

export interface SessionRecordingSummary {
  id: string;
  distinct_id?: string;
  start_time?: string;
  end_time?: string;
  recording_duration?: number;
  viewed?: boolean;
  [key: string]: unknown;
}

export interface ListRecordingsResult {
  results: SessionRecordingSummary[];
  next?: string | null;
}

const DEFAULT_HOST = "https://us.posthog.com";

/**
 * Thin PostHog REST client. Every method throws {@link AnalyticsError} on failure so callers
 * (jobs, tests) can branch on `.code`/`.status`/`.retryAfter` instead of parsing messages.
 */
export class PostHogClient {
  private readonly host: string;
  private readonly key: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: PostHogClientOptions = {}) {
    this.host = (opts.host ?? process.env.POSTHOG_HOST ?? DEFAULT_HOST).replace(/\/+$/, "");
    const key = opts.personalApiKey ?? process.env.POSTHOG_PERSONAL_API_KEY;
    if (!key) {
      throw new AnalyticsError("POSTHOG_PERSONAL_API_KEY is not set", { code: "missing_api_key" });
    }
    this.key = key;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.host}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.key}`,
          ...(init.headers ?? {}),
        },
      });
    } catch (cause) {
      throw new AnalyticsError(`PostHog request to ${path} failed`, { code: "network_error", cause });
    }

    if (res.status === 429) {
      const retryAfterHeader = res.headers.get("Retry-After");
      const retryAfter = retryAfterHeader !== null ? Number(retryAfterHeader) : undefined;
      let code = "rate_limited";
      try {
        const body = (await res.clone().json()) as { code?: string };
        if (typeof body.code === "string") code = body.code;
      } catch {
        // non-JSON body — keep the generic code
      }
      logger.warn({ path, retryAfter, code }, "posthog rate limit hit");
      throw new AnalyticsError("PostHog rate limit exceeded", {
        code,
        status: 429,
        retryAfter: retryAfter !== undefined && !Number.isNaN(retryAfter) ? retryAfter : undefined,
      });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ path, status: res.status }, "posthog request failed");
      throw new AnalyticsError(`PostHog request to ${path} failed with ${res.status}`, {
        code: "http_error",
        status: res.status,
        cause: text,
      });
    }

    return (await res.json()) as T;
  }

  /** POST /api/organizations/:org/projects/ — verified via NOTES.md. */
  async createProject(organizationId: string, name: string): Promise<PostHogProject> {
    return this.request<PostHogProject>(`/api/organizations/${organizationId}/projects/`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  /** GET /api/projects/:id/ — returns `api_token`, used for SDK install snippets. */
  async getProject(projectId: string | number): Promise<PostHogProject> {
    return this.request<PostHogProject>(`/api/projects/${projectId}/`);
  }

  /**
   * POST /api/projects/:id/query/ with `{ query: { kind: "HogQLQuery", query } }` — verified
   * shape (NOTES.md). Throws a typed {@link AnalyticsError} with `retryAfter` on 429.
   */
  async query<Row = unknown[]>(
    projectId: string | number,
    hogql: string,
    opts: QueryOptions = {},
  ): Promise<QueryResponse<Row>> {
    const hasLimit = /\blimit\b/i.test(hogql);
    const sql = !hasLimit && opts.limit ? `${hogql.trimEnd()}\nLIMIT ${opts.limit}` : hogql;
    return this.request<QueryResponse<Row>>(`/api/projects/${projectId}/query/`, {
      method: "POST",
      body: JSON.stringify({
        query: { kind: "HogQLQuery", query: sql },
        ...(opts.name ? { name: opts.name } : {}),
      }),
    });
  }

  /**
   * GET /api/projects/:id/heatmaps/ — aggregated buckets only (see NOTES.md: only saved /
   * aggregated heatmap data appears to be exposed, not raw session paths).
   */
  async listHeatmaps(projectId: string | number, params: HeatmapListParams = {}): Promise<HeatmapBucket[]> {
    const qs = new URLSearchParams();
    if (params.url) qs.set("url", params.url);
    if (params.urlExact) qs.set("url_exact", params.urlExact);
    if (params.dateFrom) qs.set("date_from", params.dateFrom);
    if (params.dateTo) qs.set("date_to", params.dateTo);
    if (params.type) qs.set("type", params.type);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const res = await this.request<{ results: HeatmapBucket[] }>(
      `/api/projects/${projectId}/heatmaps/${suffix}`,
    );
    return res.results ?? [];
  }

  /**
   * GET /api/projects/:id/heatmaps/screenshot/ — UNVERIFIED path (see NOTES.md). Returns the
   * raw JSON body loosely typed so a shape mismatch surfaces as a missing field rather than a
   * thrown parse error.
   */
  async getHeatmapScreenshot(
    projectId: string | number,
    params: { url: string },
  ): Promise<Record<string, unknown>> {
    const qs = new URLSearchParams({ url: params.url });
    return this.request<Record<string, unknown>>(
      `/api/projects/${projectId}/heatmaps/screenshot/?${qs.toString()}`,
    );
  }

  /** GET /api/projects/:id/session_recordings/?limit=N */
  async listRecordings(
    projectId: string | number,
    opts: { limit?: number } = {},
  ): Promise<ListRecordingsResult> {
    const qs = new URLSearchParams();
    if (opts.limit) qs.set("limit", String(opts.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<ListRecordingsResult>(`/api/projects/${projectId}/session_recordings/${suffix}`);
  }
}
