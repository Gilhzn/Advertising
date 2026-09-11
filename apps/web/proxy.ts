import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PREFIXES = ["/api/auth", "/api/oauth"];
const PUBLIC_PATHS = new Set(["/login", "/health"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    // only allow /api/oauth/*/callback publicly, everything else under /api/oauth needs auth
    if (pathname.startsWith("/api/oauth")) return pathname.endsWith("/callback");
    return true;
  }
  return false;
}

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();
  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?callbackUrl=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

// Proxy (the renamed `middleware` file convention, Next.js 16+) defaults to the Node.js
// runtime already - the Drizzle/postgres.js DB client needs Node APIs, and setting a
// `runtime` option here is now a build error, so it is intentionally omitted.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads).*)"],
};
