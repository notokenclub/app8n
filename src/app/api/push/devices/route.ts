import { getCurrentUserId } from "@/lib/auth/session";
import { PUSH_PLATFORMS, type PushPlatform } from "@/lib/db/schema";
import { listDevices, registerDevice, removeDevice } from "@/lib/push/devices";
import { isPushConfigured } from "@/lib/push/dispatch";

export const dynamic = "force-dynamic";

function isPlatform(value: unknown): value is PushPlatform {
  return (
    typeof value === "string" &&
    (PUSH_PLATFORMS as readonly string[]).includes(value)
  );
}

export async function GET() {
  const userId = await getCurrentUserId();
  const devices = await listDevices(userId);

  return Response.json({
    // Whether a provider exists is the difference between "no devices yet" and
    // "push can never arrive", and only the server knows which one it is.
    configured: isPushConfigured(),
    devices: devices.map((device) => ({
      id: device.id,
      platform: device.platform,
      // A push token is a delivery address, not a secret, but it is also of no
      // use to the UI beyond identifying the row it came from.
      tokenHint: `…${device.token.slice(-6)}`,
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    })),
  });
}

interface RegisterBody {
  token?: string;
  platform?: string;
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  const body = (await request.json()) as RegisterBody;

  if (typeof body.token !== "string" || body.token.length < 8) {
    return Response.json(
      { error: "invalid_request", message: "A device token is required." },
      { status: 400 },
    );
  }
  if (!isPlatform(body.platform)) {
    return Response.json(
      {
        error: "invalid_request",
        message: `platform must be one of ${PUSH_PLATFORMS.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const device = await registerDevice({
    userId,
    platform: body.platform,
    token: body.token,
  });

  return Response.json({
    id: device.id,
    platform: device.platform,
    configured: isPushConfigured(),
  });
}

export async function DELETE(request: Request) {
  const userId = await getCurrentUserId();
  const body = (await request.json().catch(() => null)) as RegisterBody | null;

  if (typeof body?.token !== "string") {
    return Response.json(
      { error: "invalid_request", message: "A device token is required." },
      { status: 400 },
    );
  }

  const removed = await removeDevice(userId, body.token);
  if (!removed) {
    return Response.json(
      { error: "not_found", message: "No such registered device." },
      { status: 404 },
    );
  }

  return Response.json({ removed: true });
}
