import type { QueryResponse } from "./posthog.js";

/** `{ days }` = trailing window from now; `{ start, end }` = explicit ISO bounds. */
export type AnalyticsPeriod = { days: number } | { start: string; end: string };

export interface ResolvedPeriod {
  start: Date;
  end: Date;
}

export function resolvePeriod(period: AnalyticsPeriod, now: Date = new Date()): ResolvedPeriod {
  if ("days" in period) {
    const end = now;
    const start = new Date(end.getTime() - period.days * 24 * 60 * 60 * 1000);
    return { start, end };
  }
  return { start: new Date(period.start), end: new Date(period.end) };
}

function hogqlDateTime(d: Date): string {
  return `toDateTime('${d.toISOString()}')`;
}

/** Escapes a value as a single-quoted HogQL string literal. */
export function hogqlString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function timeWindow(period: AnalyticsPeriod): string {
  const { start, end } = resolvePeriod(period);
  return `timestamp >= ${hogqlDateTime(start)} and timestamp < ${hogqlDateTime(end)}`;
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nullableNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

// ---------------------------------------------------------------------------
// overview(period)
// ---------------------------------------------------------------------------

export interface OverviewRow {
  users: number;
  sessions: number;
  avgSessionDurationSeconds: number | null;
  bounceRate: number | null;
}

/**
 * Users, sessions, avg session duration, bounce rate. Bounce matches PostHog's own
 * definition (see NOTES.md): a session with exactly one `$pageview`, zero `$autocapture`
 * events, and less than 10 seconds of `$session_duration`.
 */
export function overviewQuery(period: AnalyticsPeriod): string {
  return `
select
  count(distinct person_id) as users,
  count(distinct session_id) as sessions,
  avg(duration) as avg_session_duration_seconds,
  countIf(pageviews = 1 and autocaptures = 0 and duration < 10) as bounced_sessions
from (
  select
    properties.$session_id as session_id,
    any(person_id) as person_id,
    countIf(event = '$pageview') as pageviews,
    countIf(event = '$autocapture') as autocaptures,
    max(properties.$session_duration) as duration
  from events
  where ${timeWindow(period)}
    and properties.$session_id is not null
  group by session_id
)`.trim();
}

export function normaliseOverview(res: QueryResponse): OverviewRow {
  const row = (res.results?.[0] ?? []) as unknown[];
  const [users, sessions, avgSessionDurationSeconds, bouncedSessions] = row;
  const sessionCount = num(sessions);
  return {
    users: num(users),
    sessions: sessionCount,
    avgSessionDurationSeconds: nullableNum(avgSessionDurationSeconds),
    bounceRate: sessionCount > 0 ? num(bouncedSessions) / sessionCount : null,
  };
}

// ---------------------------------------------------------------------------
// topScreens(period)
// ---------------------------------------------------------------------------

export interface TopScreenRow {
  screen: string;
  uniqueUsers: number;
  pageviews: number;
  /**
   * Approximate — see NOTES.md. Sums PostHog's session-level `$session_duration` property
   * across every pageview row for the screen, which overcounts sessions with more than one
   * pageview on the same screen (each of that session's rows contributes the whole-session
   * duration again). There is no per-pageview "time on screen" property in the raw event
   * schema to build an exact figure from HogQL alone.
   */
  totalDurationSeconds: number | null;
}

export function topScreensQuery(period: AnalyticsPeriod, limit = 50): string {
  return `
select
  coalesce(properties.$current_url, properties.$screen_name) as screen,
  count(distinct person_id) as unique_users,
  count() as pageviews,
  sum(properties.$session_duration) as total_duration_seconds
from events
where event in ('$pageview', '$screen')
  and ${timeWindow(period)}
  and coalesce(properties.$current_url, properties.$screen_name) is not null
group by screen
order by unique_users desc
limit ${limit}`.trim();
}

export function normaliseTopScreens(res: QueryResponse): TopScreenRow[] {
  return (res.results ?? []).map((r) => {
    const row = r as unknown[];
    return {
      screen: String(row[0] ?? ""),
      uniqueUsers: num(row[1]),
      pageviews: num(row[2]),
      totalDurationSeconds: nullableNum(row[3]),
    };
  });
}

// ---------------------------------------------------------------------------
// topElements(period) — the "hot areas" from $autocapture clicks
// ---------------------------------------------------------------------------

export interface TopElementRow {
  element: string;
  url: string | null;
  clicks: number;
  uniqueUsers: number;
}

export function topElementsQuery(period: AnalyticsPeriod, limit = 50): string {
  return `
select
  elements_chain as element,
  properties.$current_url as url,
  count() as clicks,
  count(distinct person_id) as unique_users
from events
where event = '$autocapture'
  and ${timeWindow(period)}
group by element, url
order by clicks desc
limit ${limit}`.trim();
}

export function normaliseTopElements(res: QueryResponse): TopElementRow[] {
  return (res.results ?? []).map((r) => {
    const row = r as unknown[];
    return {
      element: String(row[0] ?? ""),
      url: str(row[1]),
      clicks: num(row[2]),
      uniqueUsers: num(row[3]),
    };
  });
}

// ---------------------------------------------------------------------------
// rageClicks(period)
// ---------------------------------------------------------------------------

export interface RageClickRow {
  url: string | null;
  element: string | null;
  rageClicks: number;
  uniqueUsers: number;
}

export function rageClicksQuery(period: AnalyticsPeriod, limit = 50): string {
  return `
select
  properties.$current_url as url,
  elements_chain as element,
  count() as rage_clicks,
  count(distinct person_id) as unique_users
from events
where event = '$rageclick'
  and ${timeWindow(period)}
group by url, element
order by rage_clicks desc
limit ${limit}`.trim();
}

export function normaliseRageClicks(res: QueryResponse): RageClickRow[] {
  return (res.results ?? []).map((r) => {
    const row = r as unknown[];
    return {
      url: str(row[0]),
      element: str(row[1]),
      rageClicks: num(row[2]),
      uniqueUsers: num(row[3]),
    };
  });
}

// ---------------------------------------------------------------------------
// funnel(steps)
// ---------------------------------------------------------------------------

export interface FunnelStepRow {
  step: number;
  event: string;
  users: number;
  conversionFromFirst: number | null;
  conversionFromPrevious: number | null;
}

/**
 * Approximate funnel — see NOTES.md. Returns the distinct-user count for each step event
 * independently within the period; it does NOT enforce that a person did the steps in order
 * or within a bounded time window (PostHog's native `FunnelsQuery` kind does that, but it is
 * not a `HogQLQuery` and is out of scope for a HogQL-builder API). Good enough for a rough
 * drop-off read; not a substitute for PostHog's in-app funnel insight for anything precise.
 */
export function funnelQuery(steps: string[], period: AnalyticsPeriod): string {
  if (steps.length === 0) throw new Error("funnelQuery requires at least one step");
  const columns = steps
    .map((event, i) => `countDistinctIf(person_id, event = ${hogqlString(event)}) as step_${i}_users`)
    .join(",\n  ");
  const eventList = steps.map(hogqlString).join(", ");
  return `
select
  ${columns}
from events
where ${timeWindow(period)}
  and event in (${eventList})`.trim();
}

export function normaliseFunnel(res: QueryResponse, steps: string[]): FunnelStepRow[] {
  const row = (res.results?.[0] ?? []) as unknown[];
  const counts = steps.map((_, i) => num(row[i]));
  const first = counts[0] ?? 0;
  return steps.map((event, i) => {
    const users = counts[i] ?? 0;
    const prev = i > 0 ? counts[i - 1] : undefined;
    return {
      step: i,
      event,
      users,
      conversionFromFirst: first > 0 ? users / first : null,
      conversionFromPrevious: prev !== undefined && prev > 0 ? users / prev : null,
    };
  });
}

// ---------------------------------------------------------------------------
// retention(period, cohortDays)
// ---------------------------------------------------------------------------

export interface RetentionRow {
  cohortDate: string;
  cohortSize: number;
  retainedUsers: number;
  retentionRate: number;
}

/**
 * Simplified day-N retention — see NOTES.md. Buckets every person by the calendar day of
 * their first event in the period (`cohort_date`), then checks whether they also have an
 * event exactly `cohortDays` later. This is a single-cohort-offset read, not PostHog's native
 * multi-interval `RetentionQuery` breakdown.
 */
export function retentionQuery(period: AnalyticsPeriod, cohortDays: number): string {
  return `
select
  cohort_date,
  count(distinct person_id) as cohort_size,
  count(distinct if(returned, person_id, null)) as retained_users
from (
  select
    person_id,
    min(toDate(timestamp)) over (partition by person_id) as cohort_date,
    toDate(timestamp) = min(toDate(timestamp)) over (partition by person_id) + ${cohortDays} as returned
  from events
  where ${timeWindow(period)}
)
group by cohort_date
order by cohort_date`.trim();
}

export function normaliseRetention(res: QueryResponse): RetentionRow[] {
  return (res.results ?? []).map((r) => {
    const row = r as unknown[];
    const cohortSize = num(row[1]);
    const retainedUsers = num(row[2]);
    return {
      cohortDate: String(row[0] ?? ""),
      cohortSize,
      retainedUsers,
      retentionRate: cohortSize > 0 ? retainedUsers / cohortSize : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// utmAttribution(period) — lets social posts be attributed via buildTrackedUrl()
// ---------------------------------------------------------------------------

export interface UtmAttributionRow {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  pageviews: number;
  uniqueUsers: number;
}

export function utmAttributionQuery(period: AnalyticsPeriod, limit = 200): string {
  return `
select
  properties.utm_source as utm_source,
  properties.utm_medium as utm_medium,
  properties.utm_campaign as utm_campaign,
  count() as pageviews,
  count(distinct person_id) as unique_users
from events
where event = '$pageview'
  and ${timeWindow(period)}
  and properties.utm_source is not null
group by utm_source, utm_medium, utm_campaign
order by pageviews desc
limit ${limit}`.trim();
}

export function normaliseUtmAttribution(res: QueryResponse): UtmAttributionRow[] {
  return (res.results ?? []).map((r) => {
    const row = r as unknown[];
    return {
      utmSource: str(row[0]),
      utmMedium: str(row[1]),
      utmCampaign: str(row[2]),
      pageviews: num(row[3]),
      uniqueUsers: num(row[4]),
    };
  });
}

// ---------------------------------------------------------------------------
// buildTrackedUrl — posts carry utm_source=<platform>&utm_campaign=<postId> so
// utmAttribution() can join clicks back to a post (see sync.ts).
// ---------------------------------------------------------------------------

export interface TrackedUrlOptions {
  platform: string;
  postId: string;
  medium?: string;
}

export function buildTrackedUrl(url: string, opts: TrackedUrlOptions): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", opts.platform);
  u.searchParams.set("utm_medium", opts.medium ?? "social");
  u.searchParams.set("utm_campaign", opts.postId);
  return u.toString();
}
