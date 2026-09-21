"use client";

import { cn } from "cn";

/**
 * Sticky page title bar.
 *
 * `pt-safe-t` keeps the title clear of the notch when the app runs full-bleed
 * in a Capacitor webview; on the web that inset is 0px and the bar looks
 * ordinary. Sticky rather than fixed so it participates in the scroll
 * container and never overlaps the last row of content.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/85 px-4 pt-safe-t pb-3 backdrop-blur-lg",
        className,
      )}
    >
      <div className="min-w-0 flex-1 pt-3">
        <h1 className="truncate text-base font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 pt-3">{action}</div>}
    </header>
  );
}
