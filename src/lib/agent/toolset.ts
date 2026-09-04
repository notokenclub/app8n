import { tool, type ToolSet } from "ai";
import type { GoogleContext } from "@/lib/google/credentials";
import type { GoogleService } from "@/lib/google/scopes";
import { AGENT_TOOLS, type AgentTool, toolsForServices } from "./tools";

export interface ToolsetOptions {
  ctx: GoogleContext;
  /** Restrict the toolset to services the user has actually connected. */
  services?: readonly GoogleService[];
  onToolResult?: (event: {
    toolName: string;
    toolCallId: string;
    output: unknown;
  }) => void;
}

/**
 * Bridges the Phase 2 registry into the shape the AI SDK expects. The registry
 * stays framework-agnostic so the scheduler and any future MCP server can share
 * the same tool definitions.
 */
export function buildToolSet(options: ToolsetOptions): ToolSet {
  const selected: AgentTool[] = options.services
    ? toolsForServices(options.services)
    : AGENT_TOOLS;

  const entries = selected.map((agentTool) => [
    agentTool.name,
    tool({
      description: agentTool.description,
      inputSchema: agentTool.parameters,
      execute: async (input, { toolCallId }) => {
        const output = await agentTool.execute(input, options.ctx);
        options.onToolResult?.({
          toolName: agentTool.name,
          toolCallId,
          output,
        });
        return output ?? { ok: true };
      },
    }),
  ]);

  return Object.fromEntries(entries) as ToolSet;
}
