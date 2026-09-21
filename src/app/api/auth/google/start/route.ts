import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { buildAuthorizationUrl, type OAuthClientKind } from "@/lib/google/oauth";
import { isGoogleService, type GoogleService } from "@/lib/google/scopes";

export const dynamic = "force-dynamic";

/**
 * Begins the Google consent flow.
 *
 * `client=mobile` marks the request so the callback finishes on the
 * `app8n://` deep link instead of a web page. The native shell opens this URL
 * in a system browser (ASWebAuthenticationSession / Custom Tabs) — the client
 * secret and PKCE verifier stay on the backend either way.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const client: OAuthClientKind =
    params.get("client") === "mobile" ? "mobile" : "web";

  const services = (params.get("services") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is GoogleService => isGoogleService(value));

  // Only same-origin relative paths, so `returnTo` cannot become an open redirect.
  const requestedReturn = params.get("returnTo");
  const returnTo =
    requestedReturn?.startsWith("/") && !requestedReturn.startsWith("//")
      ? requestedReturn
      : undefined;

  try {
    const userId = await getCurrentUserId();
    const { url } = buildAuthorizationUrl({
      userId,
      client,
      returnTo,
      services: services.length > 0 ? services : undefined,
      loginHint: params.get("loginHint") ?? undefined,
    });

    // Native clients need the URL to hand to the system browser themselves.
    if (params.get("response") === "json") {
      return NextResponse.json({ url });
    }
    return NextResponse.redirect(url);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start Google OAuth.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
