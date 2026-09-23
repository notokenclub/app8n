import { NextResponse, type NextRequest } from "next/server";

/**
 * Access control for a deployed backend.
 *
 * This is Next's `proxy` convention (what used to be `middleware`, renamed in
 * this version), so it runs before any route is rendered.
 *
 * app8n is single-tenant by design: there is one implicit owner and no login.
 * That is right on a laptop and dangerous on a server, because the backend
 * holds Google tokens and can send mail on the owner's behalf. When
 * `APP8N_ACCESS_TOKEN` is set, every request must present it — as a
 * `Bearer` header for API clients and the native shell, or as a cookie the
 * browser keeps after one visit to `/?access_token=…`.
 *
 * Two paths are deliberately exempt:
 *
 * - `/api/health`, so an orchestrator can probe liveness without the secret;
 * - `/api/hooks/*`, which authenticates each call against the workflow's own
 *   vault-stored webhook secret, in constant time.
 *
 * With no token set the middleware does nothing, so local development is
 * unchanged. Production refuses to boot in that state unless
 * `APP8N_ALLOW_UNAUTHENTICATED=1` says the network is private — see
 * `src/lib/env.ts`.
 */

const COOKIE = "app8n_access";
const EXEMPT = ["/api/health", "/api/hooks/"];

function timingSafeEquals(a: string, b: string): boolean {
  // The edge runtime has no node:crypto, so this is the constant-time
  // comparison written out: always compare every byte of the longer string.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function proxy(request: NextRequest) {
  const expected = process.env.APP8N_ACCESS_TOKEN?.trim();
  if (!expected) return NextResponse.next();

  const { pathname, searchParams } = request.nextUrl;
  if (EXEMPT.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer /i, "");
  const header = request.headers.get("x-app8n-access-token");
  const cookie = request.cookies.get(COOKIE)?.value;
  const query = searchParams.get("access_token");

  for (const candidate of [bearer, header, cookie, query]) {
    if (candidate && timingSafeEquals(candidate, expected)) {
      const response = NextResponse.next();
      // Remember the token so the link only has to be used once, and keep it
      // out of JavaScript's reach.
      if (query) {
        response.cookies.set(COOKIE, expected, {
          httpOnly: true,
          sameSite: "lax",
          secure: request.nextUrl.protocol === "https:",
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
        });
      }
      return response;
    }
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "unauthorized", message: "Missing or invalid access token." },
      { status: 401 },
    );
  }

  return new NextResponse(
    "app8n is protected. Open it with ?access_token=… once, or send an Authorization: Bearer header.",
    { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

export const config = {
  // Everything except Next's own static output, which carries no data.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
