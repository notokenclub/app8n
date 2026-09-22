"use client";

import * as React from "react";
import { cn } from "cn";
import { Button, Icon, IconButton } from "@/ds";
import { useSpeechInput } from "@/hooks/use-speech-input";

/**
 * The chat input.
 *
 * `useChat` in this version of the SDK owns no input state — it exposes
 * `sendMessage` and nothing else — so the textarea is a plain controlled
 * component here. The field is a design-system input box (6px radius,
 * hairline inset) grown to fit multiple lines.
 */
export function Composer({
  onSend,
  onStop,
  busy,
  disabled,
  placeholder = "Ask app8n to do something",
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
      // Sticky rather than in normal flow: iOS shrinks the visual viewport
      // when the keyboard opens, and a footer inside the scroll container ends
      // up under the keyboard.
      className="sticky bottom-0 z-20 border-t border-border bg-background px-space-sm pt-space-xs pb-space-sm"
    >
      <div className="mx-auto flex max-w-3xl items-end gap-space-xs">
        <div className="flex min-w-0 flex-1 items-end rounded-sm border border-input bg-background px-space-xxs py-space-xxs focus-within:border-primary">
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
              "field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent px-space-xs py-space-xxs text-label-md outline-none placeholder:text-muted disabled:opacity-50 md:text-body-md",
              "scroll-region",
            )}
          />

          {speech.supported && (
            <IconButton
                  variant="circular"
              size={32}
              selected={speech.listening}
              aria-label={speech.listening ? "Stop dictation" : "Dictate"}
              aria-pressed={speech.listening}
              onClick={speech.toggle}
              icon={<Icon name="Megaphone" size={16} />}
            />
          )}
        </div>

        <Button
          variant="primary"
          size="sm"
          disabled={disabled || (!busy && value.trim() === "")}
          aria-label={busy ? "Stop generating" : "Send"}
          onClick={busy ? onStop : submit}
          icon={<Icon name={busy ? "Cross" : "ArrowUp"} size={16} />}
        >
          {busy ? "Stop" : "Send"}
        </Button>
      </div>
    </div>
  );
}
