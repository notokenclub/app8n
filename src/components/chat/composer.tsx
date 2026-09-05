"use client";

import * as React from "react";
import { ArrowUp, Mic, Square } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { useSpeechInput } from "@/hooks/use-speech-input";

/**
 * The chat input.
 *
 * `useChat` in this version of the SDK owns no input state — it exposes
 * `sendMessage` and nothing else — so the textarea is a plain controlled
 * component here.
 */
export function Composer({
  onSend,
  onStop,
  busy,
  disabled,
  placeholder = "Ask app8n to do something…",
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  // Interim speech results are replaced on every event, so the text captured
  // before dictation began has to be remembered separately or each partial
  // transcript would eat what the user typed.
  const committedRef = React.useRef("");

  const speech = useSpeechInput({
    onTranscript: (text, isFinal) => {
      const base = committedRef.current;
      const next = base ? `${base.replace(/\s*$/, "")} ${text}` : text;
      setValue(next);
      if (isFinal) committedRef.current = next;
    },
  });

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || busy || disabled) return;
    onSend(trimmed);
    setValue("");
    committedRef.current = "";
  };

  return (
    <div
      // Fixed above the tab bar rather than in normal flow: iOS shrinks the
      // visual viewport when the keyboard opens, and a sticky footer inside a
      // scroll container ends up under the keyboard.
      className="sticky bottom-0 z-20 border-t border-border bg-background/90 px-3 pt-2 pb-3 backdrop-blur-lg"
    >
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <div className="flex min-w-0 flex-1 items-end rounded-2xl border border-input bg-input/30 px-1 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <textarea
            ref={textareaRef}
            value={value}
            rows={1}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(event) => {
              setValue(event.target.value);
              committedRef.current = event.target.value;
            }}
            onKeyDown={(event) => {
              // Enter sends on a physical keyboard, but a soft keyboard's
              // return key must insert a newline or a phone user can never
              // write a second paragraph.
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !("ontouchstart" in window)
              ) {
                event.preventDefault();
                submit();
              }
            }}
            className={cn(
              "field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2.5 py-1.5 text-base outline-none placeholder:text-muted-foreground disabled:opacity-50 md:text-sm",
              "scroll-region",
            )}
          />

          {speech.supported && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={speech.listening ? "Stop dictation" : "Dictate"}
              aria-pressed={speech.listening}
              onClick={speech.toggle}
              className={cn(
                "mb-0.5 shrink-0 rounded-full",
                speech.listening && "bg-destructive/15 text-destructive",
              )}
            >
              <Mic className={cn(speech.listening && "animate-pulse")} />
            </Button>
          )}
        </div>

        <Button
          type="button"
          size="icon-lg"
          aria-label={busy ? "Stop generating" : "Send"}
          disabled={disabled || (!busy && value.trim() === "")}
          onClick={busy ? onStop : submit}
          className="mb-0.5 shrink-0 rounded-full"
        >
          {busy ? <Square className="size-3.5 fill-current" /> : <ArrowUp />}
        </Button>
      </div>
    </div>
  );
}
