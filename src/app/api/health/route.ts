import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGoogleConfigured, isMockGoogle } from "@/lib/config";
import { isAgentConfigured } from "@/lib/agent/model";
import { checkEnvironment } from "@/lib/env";
import { isNotifyConfigured } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness in one endpoint, exempt from the access token so an
 * orchestrator can probe it without holding a credential. It reports what is
 * configured, never what the values are.
 */
export async function GET() {
  const checks: Record<string, boolean> = {
    database: false,
    vaultKey: Boolean(process.env.APP8N_ENCRYPTION_KEY?.trim()),
    agentKey: isAgentConfigured(),
    googleOAuth: isGoogleConfigured(),
    mockGoogle: isMockGoogle(),
    notifications: isNotifyConfigured(),
    accessControl: Boolean(process.env.APP8N_ACCESS_TOKEN?.trim()),
  };

  try {
    db.$client.prepare("select 1").get();
    checks.database = true;
  } catch {
    checks.database = false;
  }

  const env = checkEnvironment();
  // Readiness is the database plus a usable vault: without either, every
  // request that matters would fail.
  const ready = checks.database && checks.vaultKey && env.errors.length === 0;

  return NextResponse.json(
    {
      status: ready ? "ok" : "degraded",
      version: process.env.npm_package_version ?? null,
      uptimeSeconds: Math.round(process.uptime()),
      checks,
      problems: env.errors.map((issue) => `${issue.variable}: ${issue.message}`),
      at: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  );
}
