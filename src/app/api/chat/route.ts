import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { getCurrentUserId } from "@/lib/auth/session";
import { resolveAgentContext } from "@/lib/agent/context";
import { isAgentConfigured } from "@/lib/agent/model";
import { streamAgent } from "@/lib/agent/orchestrator";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ChatBody {
  messages: UIMessage[];
  accountId?: string;
  workflowId?: string;
  timeZone?: string;
}

export async function POST(request: Request) {
  if (!isAgentConfigured()) {
    return Response.json(
      {
        error: "agent_not_configured",
        message:
          "ANTHROPIC_API_KEY is not set. Add it to .env.local to enable the agent.",
      },
      { status: 503 },
    );
  }

  const body = (await request.json()) as ChatBody;
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json(
      { error: "invalid_request", message: "messages is required." },
      { status: 400 },
    );
  }

  const userId = await getCurrentUserId();
  const ctx = await resolveAgentContext(userId, body.accountId);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const { executionId, stream: result } = await streamAgent({
        userId,
        trigger: "chat",
        messages: await convertToModelMessages(body.messages),
        services: ctx.services,
        accountId: ctx.accountId,
        email: ctx.email,
        workflowId: body.workflowId,
        timeZone: body.timeZone,
        // The SDK emits its own tool-approval-request chunk; this carries the
        // persisted row so the client can render a full approval card and act
        // on it later from another device.
        onApprovalRequired: (event) => {
          writer.write({
            type: "data-approval",
            id: event.approvalRequestId,
            data: {
              ...event,
              status: "approval_required",
            },
          });
        },
      });

      writer.write({
        type: "data-execution",
        id: executionId,
        data: { executionId },
      });

      writer.merge(toUIMessageStream({ stream: result.stream }));
    },
    onError: (error) =>
      error instanceof Error ? error.message : "Agent run failed.",
  });

  return createUIMessageStreamResponse({ stream });
}
