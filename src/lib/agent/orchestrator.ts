import {
  generateText,
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type ToolApprovalStatus,
  type ToolSet,
} from "ai";
import type { ExecutionStep, TriggerType } from "@/lib/db/schema";
import type { GoogleContext } from "@/lib/google/credentials";
import type { GoogleService } from "@/lib/google/scopes";
import {
  approvalSigningSecret,
  createApprovalRequest,
  summariseAction,
  toolNeedsApproval,
} from "./approvals";
import {
  finishExecution,
  recordSteps,
  startExecution,
} from "./execution";
import { agentModelFor } from "./model";
import { buildSystemPrompt } from "./prompt";
import { buildToolSet } from "./toolset";

/** Upper bound on the agent's tool loop, so a confused model cannot spin. */
export const MAX_STEPS = 12;

export interface AgentRunOptions {
  userId: string;
  trigger: TriggerType;
  messages: ModelMessage[];
  services?: readonly GoogleService[];
  accountId?: string;
  workflowId?: string;
  executionId?: string;
  model?: LanguageModel;
  email?: string;
  timeZone?: string;
  /** Notified as soon as a gate opens, so a caller can stream it or push it. */
  onApprovalRequired?: (event: ApprovalRequiredEvent) => void;
}

export interface ApprovalRequiredEvent {
  approvalRequestId: string;
  executionId: string;
  toolCallId: string;
  toolName: string;
  summary: string;
  parameters: Record<string, unknown>;
}

interface AgentConfig {
  executionId: string;
  model: LanguageModel;
  system: string;
  tools: ToolSet;
  toolApproval: (options: {
    toolCall: { toolCallId: string; toolName: string; input: unknown };
  }) => Promise<ToolApprovalStatus>;
  steps: ExecutionStep[];
  approvals: ApprovalRequiredEvent[];
}

/**
 * Assembles everything a run needs. Shared by the streaming chat path and the
 * headless scheduler path so both enforce the identical approval gate — the
 * gate must not be something a caller can forget to wire up.
 */
async function buildAgentConfig(options: AgentRunOptions): Promise<AgentConfig> {
  const executionId =
    options.executionId ??
    (await startExecution({
      userId: options.userId,
      trigger: options.trigger,
      workflowId: options.workflowId,
      input: { messages: options.messages },
    }));

  // Everything after the row exists must close it on the way out: the model
  // is resolved below, and a missing API key used to throw here and leave a
  // run marked `running` for ever — a ghost in the history and a client that
  // polls it until the tab is closed.
  try {
    return await assembleAgentConfig(options, executionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordSteps(executionId, [
      { kind: "error", message, at: Date.now() },
    ]);
    await finishExecution({ executionId, status: "failed", error: message });
    throw error;
  }
}

async function assembleAgentConfig(
  options: AgentRunOptions,
  executionId: string,
): Promise<AgentConfig> {
  const ctx: GoogleContext = {
    userId: options.userId,
    accountId: options.accountId,
  };

  const steps: ExecutionStep[] = [];
  const approvals: ApprovalRequiredEvent[] = [];

  const tools = buildToolSet({
    ctx,
    services: options.services,
    onToolResult: ({ toolName, toolCallId, output }) => {
      steps.push({
        kind: "tool_result",
        toolName,
        toolCallId,
        output,
        at: Date.now(),
      });
    },
  });

  const toolApproval = async ({
    toolCall,
  }: {
    toolCall: { toolCallId: string; toolName: string; input: unknown };
  }): Promise<ToolApprovalStatus> => {
    if (!toolNeedsApproval(toolCall.toolName)) {
      return { type: "not-applicable" };
    }

    const input = (toolCall.input ?? {}) as Record<string, unknown>;
    const record = await createApprovalRequest({
      executionId,
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      input,
    });

    const event: ApprovalRequiredEvent = {
      approvalRequestId: record.id,
      executionId,
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      summary: record.summary ?? summariseAction(toolCall.toolName, input),
      parameters: input,
    };

    approvals.push(event);
    steps.push({
      kind: "approval_required",
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      approvalId: record.id,
      at: Date.now(),
    });
    options.onApprovalRequired?.(event);

    return { type: "user-approval", reason: event.summary };
  };

  return {
    executionId,
    model: options.model ?? (await agentModelFor(options.userId)),
    system: buildSystemPrompt({
      services: options.services ?? [],
      email: options.email,
      timeZone: options.timeZone,
    }),
    tools,
    toolApproval,
    steps,
    approvals,
  };
}

export interface HeadlessRunResult {
  executionId: string;
  text: string;
  approvals: ApprovalRequiredEvent[];
  status: "success" | "awaiting_approval" | "failed";
  error?: string;
}

/**
 * Runs the agent to completion without a client attached. Used by the
 * scheduler; a run that hits an approval gate parks itself with its
 * conversation state so it can be resumed once a human decides.
 */
export async function runAgent(
  options: AgentRunOptions,
): Promise<HeadlessRunResult> {
  const config = await buildAgentConfig(options);

  try {
    const result = await generateText({
      model: config.model,
      system: config.system,
      messages: options.messages,
      tools: config.tools,
      toolApproval: config.toolApproval,
      experimental_toolApprovalSecret: approvalSigningSecret(),
      stopWhen: stepCountIs(MAX_STEPS),
      onStepFinish: (step) => {
        if (step.text.trim()) {
          config.steps.push({
            kind: "text",
            text: step.text,
            at: Date.now(),
          });
        }
        for (const call of step.toolCalls) {
          config.steps.push({
            kind: "tool_call",
            toolName: call.toolName,
            toolCallId: call.toolCallId,
            input: call.input,
            at: Date.now(),
          });
        }
      },
    });

    await recordSteps(config.executionId, config.steps);

    const awaiting = config.approvals.length > 0;
    await finishExecution({
      executionId: config.executionId,
      status: awaiting ? "awaiting_approval" : "success",
      output: { text: result.text, approvals: config.approvals },
      messages: awaiting
        ? ([...options.messages, ...result.response.messages] as unknown[])
        : undefined,
    });

    return {
      executionId: config.executionId,
      text: result.text,
      approvals: config.approvals,
      status: awaiting ? "awaiting_approval" : "success",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    config.steps.push({ kind: "error", message, at: Date.now() });
    await recordSteps(config.executionId, config.steps);
    await finishExecution({
      executionId: config.executionId,
      status: "failed",
      error: message,
    });

    return {
      executionId: config.executionId,
      text: "",
      approvals: config.approvals,
      status: "failed",
      error: message,
    };
  }
}

export interface StreamingRun {
  executionId: string;
  stream: ReturnType<typeof streamText>;
}

/**
 * Streaming counterpart of {@link runAgent}. Returns the live result so the
 * route can merge it into a UI message stream, and finalises the execution
 * record once the model is done.
 */
export async function streamAgent(
  options: AgentRunOptions,
): Promise<StreamingRun> {
  const config = await buildAgentConfig(options);

  const stream = streamText({
    model: config.model,
    system: config.system,
    messages: options.messages,
    tools: config.tools,
    toolApproval: config.toolApproval,
    experimental_toolApprovalSecret: approvalSigningSecret(),
    stopWhen: stepCountIs(MAX_STEPS),
    onStepFinish: (step) => {
      if (step.text.trim()) {
        config.steps.push({ kind: "text", text: step.text, at: Date.now() });
      }
      for (const call of step.toolCalls) {
        config.steps.push({
          kind: "tool_call",
          toolName: call.toolName,
          toolCallId: call.toolCallId,
          input: call.input,
          at: Date.now(),
        });
      }
    },
    onError: async ({ error }) => {
      const message = error instanceof Error ? error.message : String(error);
      config.steps.push({ kind: "error", message, at: Date.now() });
      await recordSteps(config.executionId, config.steps);
      await finishExecution({
        executionId: config.executionId,
        status: "failed",
        error: message,
      });
    },
    onFinish: async ({ text, response }) => {
      await recordSteps(config.executionId, config.steps);
      const awaiting = config.approvals.length > 0;
      await finishExecution({
        executionId: config.executionId,
        status: awaiting ? "awaiting_approval" : "success",
        output: { text, approvals: config.approvals },
        messages: awaiting
          ? ([...options.messages, ...response.messages] as unknown[])
          : undefined,
      });
    },
  });

  return { executionId: config.executionId, stream };
}
