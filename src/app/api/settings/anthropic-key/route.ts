import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  clearAnthropicKey,
  getAnthropicKeyStatus,
  setAnthropicKey,
  testAnthropicKey,
} from "@/lib/agent/api-key";
import { DEFAULT_MODEL_ID } from "@/lib/agent/model";

export const dynamic = "force-dynamic";

interface PutBody {
  key?: string;
  /** When false the key is stored without a live call. Defaults to true. */
  test?: boolean;
}

export async function GET() {
  const userId = await getCurrentUserId();
  return NextResponse.json(await getAnthropicKeyStatus(userId));
}

/**
 * Stores an Anthropic key in the encrypted vault.
 *
 * The response never echoes the key — only the masked status — so a key
 * cannot be recovered by reading it back through the API, and it is verified
 * against Anthropic before it is written so a typo surfaces here rather than
 * as a failed automation hours later.
 */
export async function PUT(request: Request) {
  const userId = await getCurrentUserId();
  const body = (await request.json()) as PutBody;
  const key = body.key?.trim();

  if (!key) {
    return NextResponse.json(
      { error: "invalid_request", message: "A key is required." },
      { status: 400 },
    );
  }

  if (body.test !== false) {
    const result = await testAnthropicKey(key, DEFAULT_MODEL_ID);
    if (!result.ok) {
      return NextResponse.json(
        { error: "key_rejected", message: result.error },
        { status: 422 },
      );
    }
  }

  await setAnthropicKey(userId, key);
  return NextResponse.json({
    saved: true,
    status: await getAnthropicKeyStatus(userId),
  });
}

export async function DELETE() {
  const userId = await getCurrentUserId();
  await clearAnthropicKey(userId);
  return NextResponse.json({
    cleared: true,
    status: await getAnthropicKeyStatus(userId),
  });
}
