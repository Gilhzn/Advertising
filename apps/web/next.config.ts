import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy.
 *
 * `script-src` keeps `'unsafe-inline'`: Next 16's App Router injects inline bootstrap/flight scripts
 * on every page, and the nonce alternative requires a middleware that stamps a per-request nonce and
 * forces every route to be dynamically rendered. That trade is not worth it here - the dashboard has
 * no user-generated HTML - so the CSP is kept simple and documented. If a nonce is ever added, drop
 * `'unsafe-inline'` from `script-src` at the same time.
 *
 * `img-src` allows `https:` because post media lives on platform/R2 CDNs; `object-src 'none'` and
 * `frame-ancestors 'none'` kill plugin and clickjacking vectors.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HSTS only in production: it would pin localhost to https during development.
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  // Vercel's build provides its own output packaging; `standalone` is only for the
  // Docker/Railway deploy path (see docs/deploy.md).
  output: process.env.VERCEL ? undefined : "standalone",
  serverExternalPackages: ["pg-boss", "postgres", "@resvg/resvg-js"],
  // `@adv/media`'s satori renderer reads its vendored fonts from disk at runtime
  // (`packages/media/fonts/*.ttf`); the default file trace misses them since nothing
  // statically imports the binary files.
  outputFileTracingIncludes: {
    "/**": ["../../packages/media/fonts/**"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        // User-uploaded images served from the local-disk fallback: never sniffed, never downloaded
        // as an attachment, and never executed as a document (the CSP above already applies).
        source: "/uploads/:path*",
        headers: [
          { key: "Content-Disposition", value: "inline" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
