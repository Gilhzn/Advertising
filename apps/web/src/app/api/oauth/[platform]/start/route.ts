import { PLATFORM_IDS, randomToken } from "@adv/shared";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureConnectorsRegistered, getConnector, hasConnector } from "@/lib/connectors";
import { getBusinessById } from "@/lib/data/businesses";
import { createOAuthState } from "@/lib/data/oauth-state";

export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const url = new URL(req.url);
  const businessId = url.searchParams.get("businessId");

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }
  if (!(PLATFORM_IDS as readonly string[]).includes(platform)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }
  const business = await getBusinessById(session.user.id, businessId);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  ensureConnectorsRegistered();
  const platformId = platform as (typeof PLATFORM_IDS)[number];
  if (!hasConnector(platformId)) {
    return NextResponse.json({ error: "Connector not available for this platform yet" }, { status: 501 });
  }
  const connector = getConnector(platformId);
  if (connector.authKind !== "oauth" || !connector.authUrl) {
    return NextResponse.json({ error: "This platform does not use OAuth" }, { status: 400 });
  }

  const codeVerifier = randomToken(32);
  const stateRow = await createOAuthState(businessId, platformId, codeVerifier);

  const redirectUri = `${process.env.APP_URL ?? url.origin}/api/oauth/${platformId}/callback`;
  const authUrl = connector.authUrl({
    businessId,
    redirectUri,
    state: stateRow.state,
    codeVerifier,
  });

  return NextResponse.redirect(authUrl);
}
