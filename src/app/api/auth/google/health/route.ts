import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { checkAccountHealth } from "@/lib/google/health";
import { GoogleOAuthError } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

/**
 * POST rather than GET: this makes live calls to Google on every invocation,
 * so it must not sit behind anything that may replay or prefetch it.
 */
export async function POST(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json(
      { error: "invalid_request", message: "accountId is required." },
      { status: 400 },
    );
  }

  const userId = await getCurrentUserId();

  try {
    return NextResponse.json(await checkAccountHealth(userId, accountId));
  } catch (error) {
    if (error instanceof GoogleOAuthError) {
      return NextResponse.json(
        { error: "not_found", message: error.message },
        { status: 404 },
      );
    }
    throw error;
  }
}
