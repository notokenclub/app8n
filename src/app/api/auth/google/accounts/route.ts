import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { isGoogleConfigured, isMockGoogle } from "@/lib/config";
import {
  listGoogleAccounts,
  unlinkGoogleAccount,
} from "@/lib/google/credentials";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const accounts = await listGoogleAccounts(userId);
    return NextResponse.json({
      accounts,
      googleConfigured: isGoogleConfigured(),
      mockMode: isMockGoogle(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list accounts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json(
      { error: "accountId is required." },
      { status: 400 },
    );
  }

  try {
    const userId = await getCurrentUserId();
    await unlinkGoogleAccount(userId, accountId);
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to disconnect account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
