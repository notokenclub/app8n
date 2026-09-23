import { NextResponse, type NextRequest } from "next/server";
import { appUrl, mobileRedirectUri } from "@/lib/config";
import { linkGoogleAccount } from "@/lib/google/credentials";
import {
  consumeOAuthState,
  exchangeAuthorizationCode,
  type OAuthClientKind,
} from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

/**
 * Google always redirects here — custom schemes like `app8n://` are rejected for
 * Web-type OAuth clients, and routing through the backend keeps the client
 * secret off the device. Mobile sessions are handed back via a deep link once
 * the token exchange has completed server-side.
 */
function finish(
  client: OAuthClientKind,
  returnTo: string | undefined,
  params: Record<string, string>,
) {
  if (client === "mobile") {
    const deepLink = new URL(mobileRedirectUri());
    for (const [key, value] of Object.entries(params)) {
      deepLink.searchParams.set(key, value);
    }
    return NextResponse.redirect(deepLink.toString());
  }

  const target = new URL(returnTo ?? "/settings", appUrl());
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target.toString());
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = params.get("state");
  const code = params.get("code");
  const oauthError = params.get("error");

  // Without valid state we cannot know which client started this, so fail on
  // the web path rather than guessing a deep link to redirect into.
  if (!state) {
    return finish("web", undefined, {
      status: "error",
      message: "Missing OAuth state.",
    });
  }

  let payload;
  try {
    payload = consumeOAuthState(state);
  } catch (error) {
    return finish("web", undefined, {
      status: "error",
      message:
        error instanceof Error ? error.message : "Invalid OAuth state.",
    });
  }

  if (oauthError) {
    return finish(payload.client, payload.returnTo, {
      status: "error",
      message:
        oauthError === "access_denied"
          ? "Google access was denied."
          : oauthError,
    });
  }

  if (!code) {
    return finish(payload.client, payload.returnTo, {
      status: "error",
      message: "Google did not return an authorization code.",
    });
  }

  try {
    const { tokens, profile } = await exchangeAuthorizationCode(
      code,
      payload.verifier,
    );
    const account = await linkGoogleAccount({
      userId: payload.userId,
      tokens,
      profile,
    });

    return finish(payload.client, payload.returnTo, {
      status: "success",
      email: account.email,
      accountId: account.id,
      services: account.services.join(","),
    });
  } catch (error) {
    return finish(payload.client, payload.returnTo, {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to complete the Google connection.",
    });
  }
}
