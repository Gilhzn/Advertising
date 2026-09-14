import { businesses, eq, getDb } from "@adv/db";
import { logger } from "@adv/shared";
import { AnalyticsError, PostHogClient } from "./posthog.js";

export type EnsureProjectResult =
  | { created: true; projectId: string }
  | { created: false; projectId: string; reason: "already_exists" }
  | { created: false; reason: "org_not_configured" };

/**
 * Creates a PostHog project for a business and stores its id/token, but only when
 * `POSTHOG_ORG_ID` is configured — otherwise returns `{ created: false, reason:
 * "org_not_configured" }` rather than throwing, since not every deployment provisions
 * projects automatically.
 */
export async function ensureProject(
  businessId: string,
  opts: { client?: PostHogClient } = {},
): Promise<EnsureProjectResult> {
  const db = getDb();
  const business = await db.query.businesses.findFirst({ where: eq(businesses.id, businessId) });
  if (!business) {
    throw new AnalyticsError(`business ${businessId} not found`, { code: "business_not_found" });
  }
  if (business.posthogProjectId) {
    return { created: false, projectId: business.posthogProjectId, reason: "already_exists" };
  }

  const orgId = process.env.POSTHOG_ORG_ID;
  if (!orgId) {
    logger.info({ businessId }, "ensureProject: POSTHOG_ORG_ID not set, skipping");
    return { created: false, reason: "org_not_configured" };
  }

  const client = opts.client ?? new PostHogClient();
  const project = await client.createProject(orgId, business.name);
  const projectId = String(project.id);

  await db
    .update(businesses)
    .set({ posthogProjectId: projectId, posthogProjectToken: project.api_token })
    .where(eq(businesses.id, businessId));

  logger.info({ businessId, projectId }, "ensureProject: created PostHog project");
  return { created: true, projectId };
}

export type SdkKind = "web" | "react" | "nextjs" | "ios" | "android" | "react_native" | "flutter" | "unity";

export interface Snippet {
  kind: SdkKind;
  language: string;
  /** Exact copy-paste install code. */
  install: string;
  /** Follow-up notes (utm behaviour, caveats, confidence flags). */
  notes: string[];
}

const UTM_NOTE =
  "Social post links from this app are built with buildTrackedUrl() (utm_source=<platform>, " +
  "utm_medium=social, utm_campaign=<postId>) so clicks show up under utm_attribution() and are " +
  "joined back to the originating post by syncProductAnalytics(). Don't strip utm_* params from " +
  "outbound links, and don't call posthog.capture() with a URL that already has utm_source set " +
  "to something else.";

/**
 * Exact install copy for each SDK kind, including autocapture, heatmaps, and session replay.
 * Web/React/Next.js snippets follow posthog-js's long-stable public install pattern. Mobile
 * snippets follow the equally stable posthog-ios/posthog-android/posthog-react-native/
 * posthog_flutter setup calls — "heatmaps" as a concept is web/DOM-only, so mobile snippets
 * enable session replay + autocapture (screen views, taps) as the closest equivalent and say
 * so explicitly. None of this was re-fetched live this session (see NOTES.md); the Unity
 * snippet in particular is flagged as the least certain.
 */
export function snippetFor(kind: SdkKind, token: string, host: string): Snippet {
  switch (kind) {
    case "web":
      return {
        kind,
        language: "html",
        install: `<script>
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){
  function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}
  (p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",
  (r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",
  u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},
  u.people.toString=function(){return u.toString(1)+".people (stub)"},
  o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);
  e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  posthog.init('${token}', {
    api_host: '${host}',
    person_profiles: 'identified_only',
    capture_pageview: true,
    autocapture: true,
    enable_heatmaps: true,
    session_recording: { maskAllInputs: true },
  });
</script>`,
        notes: [
          "Paste before </head> on every page that should be tracked.",
          "capture_pageview:true means you must NOT also call posthog.capture('$pageview') manually.",
          "enable_heatmaps:true + session_recording turns on both DOM click heatmaps and session replay for this project.",
          "Session replay masks every input by default. These snippets go into YOUR app and record YOUR users - unmasking inputs would send their passwords, emails and card numbers to this PostHog project. Unmask individual non-sensitive fields with a `ph-no-capture`-free selector rather than turning masking off wholesale.",
          UTM_NOTE,
        ],
      };
    case "react":
      return {
        kind,
        language: "tsx",
        install: `// index.tsx
import { PostHogProvider } from 'posthog-js/react';

const options = {
  api_host: '${host}',
  capture_pageview: true,
  autocapture: true,
  enable_heatmaps: true,
  session_recording: { maskAllInputs: true },
};

root.render(
  <PostHogProvider apiKey="${token}" options={options}>
    <App />
  </PostHogProvider>,
);`,
        notes: [
          "Requires `posthog-js` as a dependency (PostHogProvider re-exports the same client).",
          "capture_pageview:true is fine for a classic multi-page-load React app; for a client-side router see the Next.js snippet's manual-pageview pattern instead.",
          "Session replay masks every input by default. These snippets go into YOUR app and record YOUR users - unmasking inputs would send their passwords, emails and card numbers to this PostHog project. Unmask individual non-sensitive fields with a `ph-no-capture`-free selector rather than turning masking off wholesale.",
          UTM_NOTE,
        ],
      };
    case "nextjs":
      return {
        kind,
        language: "tsx",
        install: `// instrumentation-client.ts (Next.js app router)
import posthog from 'posthog-js';

posthog.init('${token}', {
  api_host: '${host}',
  capture_pageview: false, // captured manually below — app router navigations aren't full page loads
  autocapture: true,
  enable_heatmaps: true,
  session_recording: { maskAllInputs: true },
});

// app/PostHogPageView.tsx — mount once inside a client-boundary layout
'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import posthog from 'posthog-js';

export function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!pathname) return;
    const url = searchParams?.toString() ? \`\${pathname}?\${searchParams}\` : pathname;
    posthog.capture('$pageview', { $current_url: window.location.origin + url });
  }, [pathname, searchParams]);
  return null;
}`,
        notes: [
          "capture_pageview must be false on init — the App Router doesn't do full page loads, so posthog-js can't see route changes on its own; PostHogPageView captures them manually.",
          "Wrap <PostHogPageView /> in a <Suspense> boundary per Next.js's useSearchParams() rules.",
          "Session replay masks every input by default. These snippets go into YOUR app and record YOUR users - unmasking inputs would send their passwords, emails and card numbers to this PostHog project. Unmask individual non-sensitive fields with a `ph-no-capture`-free selector rather than turning masking off wholesale.",
          UTM_NOTE,
        ],
      };
    case "ios":
      return {
        kind,
        language: "swift",
        install: `// AppDelegate.swift / App.swift
import PostHog

let POSTHOG_API_KEY = "${token}"
let POSTHOG_HOST = "${host}"

let config = PostHogConfig(apiKey: POSTHOG_API_KEY, host: POSTHOG_HOST)
config.captureScreenViews = true   // autocapture equivalent: screen views, not DOM clicks
config.sessionReplay = true
config.sessionReplayConfig.maskAllTextInputs = true

PostHogSDK.shared.setup(config)`,
        notes: [
          "Add the SDK via Swift Package Manager: https://github.com/PostHog/posthog-ios.",
          "Heatmaps are a web/DOM concept; on iOS the equivalent product signal is session replay + captureScreenViews (screen name autocapture), enabled above.",
          "Session replay masks every input by default. These snippets go into YOUR app and record YOUR users - unmasking inputs would send their passwords, emails and card numbers to this PostHog project. Unmask individual non-sensitive fields with a `ph-no-capture`-free selector rather than turning masking off wholesale.",
          UTM_NOTE,
        ],
      };
    case "android":
      return {
        kind,
        language: "kotlin",
        install: `// Application.onCreate()
import com.posthog.android.PostHogAndroid
import com.posthog.android.PostHogAndroidConfig

val config = PostHogAndroidConfig(
    apiKey = "${token}",
    host = "${host}",
).apply {
    captureScreenViews = true
    sessionReplay = true
}

PostHogAndroid.setup(this, config)`,
        notes: [
          "Add the `com.posthog:posthog-android` Gradle dependency first.",
          "Heatmaps are web/DOM-only; captureScreenViews + sessionReplay are the mobile equivalent enabled here.",
          "Session replay masks every input by default. These snippets go into YOUR app and record YOUR users - unmasking inputs would send their passwords, emails and card numbers to this PostHog project. Unmask individual non-sensitive fields with a `ph-no-capture`-free selector rather than turning masking off wholesale.",
          UTM_NOTE,
        ],
      };
    case "react_native":
      return {
        kind,
        language: "tsx",
        install: `// App.tsx
import { PostHogProvider } from 'posthog-react-native';

export function App() {
  return (
    <PostHogProvider
      apiKey="${token}"
      options={{
        host: '${host}',
        enableSessionReplay: true,
      }}
      autocapture
    >
      <RestOfApp />
    </PostHogProvider>
  );
}`,
        notes: [
          "Requires `posthog-react-native` plus its peer deps (`expo-file-system`/`react-native-device-info` etc. per that package's README).",
          "autocapture here covers touches/screen views, not DOM heatmaps (mobile-only equivalent, as with iOS/Android).",
          "Session replay masks every input by default. These snippets go into YOUR app and record YOUR users - unmasking inputs would send their passwords, emails and card numbers to this PostHog project. Unmask individual non-sensitive fields with a `ph-no-capture`-free selector rather than turning masking off wholesale.",
          UTM_NOTE,
        ],
      };
    case "flutter":
      return {
        kind,
        language: "dart",
        install: `// main.dart
import 'package:posthog_flutter/posthog_flutter.dart';

final config = PostHogConfig('${token}')
  ..host = '${host}'
  ..captureApplicationLifecycleEvents = true
  ..sessionReplayConfig.enable = true;

await Posthog().setup(config);`,
        notes: [
          "Add the `posthog_flutter` pub package first.",
          "Screen autocapture + session replay are this platform's equivalent of web heatmaps.",
          "Session replay masks every input by default. These snippets go into YOUR app and record YOUR users - unmasking inputs would send their passwords, emails and card numbers to this PostHog project. Unmask individual non-sensitive fields with a `ph-no-capture`-free selector rather than turning masking off wholesale.",
          UTM_NOTE,
        ],
      };
    case "unity":
      return {
        kind,
        language: "csharp",
        install: `// Attach a PostHogIntegration behaviour (per PostHog's Unity SDK) or configure via the
// PostHog Unity package's ScriptableObject, then at startup:
using PostHogUnity;

var options = new PostHogOptions {
    Host = "${host}",
};
PostHogSDK.Instance.Setup("${token}", options);`,
        notes: [
          "LOWEST-CONFIDENCE SNIPPET — the Unity SDK's exact class/method names were not independently verified this session (see NOTES.md); confirm against posthog.com/docs/libraries/unity before shipping this verbatim.",
          "PostHog Unity SDK primarily targets event capture; heatmaps/session replay are not part of its feature set, so this snippet omits those options.",
          "Session replay masks every input by default. These snippets go into YOUR app and record YOUR users - unmasking inputs would send their passwords, emails and card numbers to this PostHog project. Unmask individual non-sensitive fields with a `ph-no-capture`-free selector rather than turning masking off wholesale.",
          UTM_NOTE,
        ],
      };
  }
}
