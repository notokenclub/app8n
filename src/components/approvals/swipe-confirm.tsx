"use client";

import * as React from "react";
import { Check, ChevronsRight, Loader2 } from "lucide-react";
import { cn } from "cn";

/**
 * A drag-to-the-end control for the one irreversible button on the screen.
 *
 * Approving sends a real email or deletes a real event, and on a phone the
 * approve button sits under the thumb that was just scrolling. A deliberate
 * drag cannot be produced by a mis-scroll, so the gesture is the safety, not
 * decoration.
 *
 * Pointer events rather than touch events: the same code then covers mouse,
 * pen and touch, and `setPointerCapture` keeps the drag alive when the finger
 * leaves the track. Keyboard users get the same action from Enter or Space on
 * the knob, so the gesture is never the only way through.
 */
export function SwipeConfirm({
  label,
  confirmedLabel,
  onConfirm,
  disabled,
  pending,
  className,
}: {
  label: string;
  confirmedLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  pending?: boolean;
  className?: string;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [offset, setOffset] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [travel, setTravel] = React.useState(0);
  const startX = React.useRef(0);
  const locked = disabled || pending;

  // Measured rather than hard-coded so the knob still lands exactly at the end
  // of the track on any width, from a 320px phone to a desktop card.
  React.useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => setTravel(Math.max(0, track.clientWidth - 44 - 8));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const finish = React.useCallback(
    (value: number) => {
      setDragging(false);
      // 85% rather than 100%: asking for a pixel-perfect landing turns a
      // decisive swipe into a fiddly one, and 85% of the track is still far
      // outside anything an accidental drag produces.
      if (travel > 0 && value >= travel * 0.85) {
        setOffset(travel);
        onConfirm();
      } else {
        setOffset(0);
      }
    },
    [onConfirm, travel],
  );

  const progress = travel > 0 ? Math.min(1, offset / travel) : 0;

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative h-12 w-full touch-none overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10 select-none",
        locked && "opacity-60",
        className,
      )}
    >
      {/* Fill trails the knob so the control reads as "almost there" mid-drag. */}
      <div
        className="absolute inset-y-0 left-0 bg-emerald-500/20"
        style={{
          width: `${offset + 44}px`,
          transition: dragging ? "none" : "width 180ms ease-out",
        }}
      />

      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-300"
        style={{ opacity: 1 - progress }}
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Approving…
          </>
        ) : (
          <>
            {label}
            <ChevronsRight className="size-4 animate-pulse" />
          </>
        )}
      </span>

      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-emerald-200"
        style={{ opacity: progress }}
      >
        {confirmedLabel}
      </span>

      <button
        type="button"
        aria-label={label}
        disabled={locked}
        className="absolute top-1 left-1 flex size-10 cursor-grab items-center justify-center rounded-lg bg-emerald-500 text-emerald-950 shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-emerald-400/50 active:cursor-grabbing disabled:cursor-not-allowed"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 180ms ease-out",
        }}
        onPointerDown={(event) => {
          if (locked) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          startX.current = event.clientX - offset;
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!dragging || locked) return;
          const next = Math.min(
            travel,
            Math.max(0, event.clientX - startX.current),
          );
          setOffset(next);
        }}
        onPointerUp={() => finish(offset)}
        onPointerCancel={() => {
          setDragging(false);
          setOffset(0);
        }}
        onKeyDown={(event) => {
          if (locked) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOffset(travel);
            onConfirm();
          }
        }}
      >
        {pending ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Check className="size-5" />
        )}
      </button>
    </div>
  );
}
