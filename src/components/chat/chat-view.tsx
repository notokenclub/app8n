"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  type UIMessage,
} from "ai";
import { AlertCircle, Sparkles } from "lucide-react";
import { cn } from "cn";
import { ApprovalCard, type ApprovalCardData } from "@/components/approvals/approval-card";
import { Button } from "@/components/ui/button";
import { APPROVALS_KEY } from "@/hooks/use-approvals";
import { apiUrl } from "@/lib/client-api";
import { ToolPart, type ToolPartView } from "./tool-part";
import { Composer } from "./composer";

/** Shape of the `data-approval` part written by /api/chat. */
interface ApprovalDataPart {
  approvalRequestId: string;
  executionId: string;
  toolCallId: string;
  toolName: string;
  summary: string;
  parameters: Record<string, unknown>;
}

const SUGGESTIONS = [
  "Summarise my unread email from today",
  "What's on my calendar tomorrow?",
  "Find the classes I've missed this month",
  "Draft a reply to the last email from my professor",
];

function isApprovalPart(
  part: UIMessage["parts"][number],
): part is { type: "data-approval"; id?: string; data: ApprovalDataPart } {
  return part.type === "data-approval";
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="size-7" />
      </span>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          What can I take off your plate?
        </h2>
        <p className="text-sm text-muted-foreground">
          I can read and act across Gmail, Calendar, Drive, Sheets, Docs and
          Tasks. Anything irreversible stops for your approval first.
        </p>
      </div>
      <div className="grid w-full max-w-md gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-xl border border-border bg-card/60 px-3.5 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-card hover:text-foreground active:bg-muted"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("");
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap text-primary-foreground">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {message.parts.map((part, index) => {
        const key = `${message.id}-${index}`;

        if (part.type === "text") {
          if (!part.text) return null;
          return (
            <div
              key={key}
              className="max-w-full text-sm leading-relaxed whitespace-pre-wrap text-foreground"
            >
              {part.text}
            </div>
          );
        }

        if (part.type === "reasoning") {
          return null;
        }

        if (isApprovalPart(part)) {
          const data = part.data;
          const approval: ApprovalCardData = {
            id: data.approvalRequestId,
            action: data.toolName,
            parameters: data.parameters,
            summary: data.summary,
          };
          return (
            <ApprovalCard key={key} approval={approval} className="w-full" />
          );
        }

        if (isToolUIPart(part)) {
          const view: ToolPartView = {
            toolCallId: part.toolCallId,
            toolName: getToolName(part),
            state: part.state,
            input: part.input,
            output: part.output,
            errorText: part.errorText,
          };
          return <ToolPart key={key} part={view} />;
        }

        return null;
      })}
    </div>
  );
}

/**
 * The conversational home screen.
 *
 * The transcript owns the scroll rather than the page, so the composer stays
 * pinned and iOS does not scroll the whole document out from under the
 * keyboard.
 */
export function ChatView() {
  const queryClient = useQueryClient();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  // Auto-scroll is suppressed the moment the user scrolls up: yanking someone
  // back to the bottom while they are reading an earlier tool result is the
  // single most irritating thing a streaming chat can do.
  const pinnedRef = React.useRef(true);

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        // Absolute so a Capacitor webview on capacitor:// resolves to the
        // configured backend instead of the app bundle.
        api: apiUrl("/api/chat"),
        body: {
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      }),
    [],
  );

  const { messages, sendMessage, status, stop, error, clearError } = useChat({
    transport,
    onData: (part) => {
      // A gate opened mid-stream; refresh the badge and the approvals list so
      // the tab count matches the card that just appeared in the transcript.
      if (part.type === "data-approval") {
        queryClient.invalidateQueries({ queryKey: APPROVALS_KEY });
      }
    },
  });

  const busy = status === "submitted" || status === "streaming";

  React.useEffect(() => {
    if (!pinnedRef.current) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const send = (text: string) => {
    pinnedRef.current = true;
    clearError();
    sendMessage({ text });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          pinnedRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="scroll-region flex-1 overflow-y-auto"
      >
        <div
          className={cn(
            "mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 px-4 py-4",
            messages.length === 0 && "justify-center",
          )}
        >
          {messages.length === 0 ? (
            <EmptyState onPick={send} />
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          )}

          {status === "submitted" && (
            <div className="flex gap-1 pl-1">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1 break-words">
                {error.message}
              </span>
              <Button
                variant="ghost"
                size="xs"
                onClick={clearError}
                className="shrink-0 text-destructive"
              >
                Dismiss
              </Button>
            </div>
          )}
        </div>
      </div>

      <Composer onSend={send} onStop={stop} busy={busy} />
    </div>
  );
}
