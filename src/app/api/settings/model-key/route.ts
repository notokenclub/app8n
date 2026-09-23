import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  activeProvider,
  clearModelKey,
  getKeyStatus,
  resolveKeyFor,
  setModelKey,
} from "@/lib/agent/model-key";
import { baseUrlFor, modelIdFor } from "@/lib/agent/providers";

export const dynamic = "force-dynamic";

interface PutBody {
  key?: string;
  /** When false the key is stored without a live call. Defaults to true. */
  test?: boolean;
}

export async function GET() {
  const userId = await getCurrentUserId();
  return NextResponse.json(await getKeyStatus(userId));
}

/**
 * Stores the model API key for the active provider in the encrypted vault.
 *
 * The response never echoes the key — only the masked status — so a key cannot
 * be recovered by reading it back through the API, and it is verified against
 * the provider before it is written so a typo surfaces here rather than as a
 * failed automation hours later.
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

  const provider = await activeProvider(userId);

  if (body.test !== false) {
    const result = await provider.testConnection({
      apiKey: key,
      modelId: modelIdFor(provider),
      baseUrl: baseUrlFor(provider),
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: "key_rejected", message: result.error },
        { status: 422 },
      );
    }
  }

  await setModelKey(userId, provider, key);
  return NextResponse.json({
    saved: true,
    status: await getKeyStatus(userId),
  });
}

/**
 * Live connection test for the active provider.
 *
 * Separate from PUT because a keyless provider has nothing to save: the check
 * *is* the setup step, and it reports a running server with the wrong model
 * pulled as clearly as an unreachable one.
 */
export async function POST() {
  const userId = await getCurrentUserId();
  const provider = await activeProvider(userId);
  const { key } = await resolveKeyFor(userId, provider);

  const result = await provider.testConnection({
    apiKey: key ?? undefined,
    modelId: modelIdFor(provider),
    baseUrl: baseUrlFor(provider),
  });

  return NextResponse.json(
    result.ok ? { ok: true } : { ok: false, error: result.error },
  );
}

export async function DELETE() {
  const userId = await getCurrentUserId();
  await clearModelKey(userId, await activeProvider(userId));
  return NextResponse.json({
    cleared: true,
    status: await getKeyStatus(userId),
  });
}
