"use client";

import { cn } from "cn";

/**
 * Sticky page title bar.
 *
 * `pt-safe-t` keeps the title clear of the notch when the app runs full-bleed
 * in a Capacitor webview; on the web that inset is 0px and the bar looks
 * ordinary. Sticky rather than fixed so it participates in the scroll
 * container and never overlaps the last row of content. Flat canvas with a
 * hairline underneath — the design system has no translucent chrome.
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
        "sticky top-0 z-30 flex items-center gap-space-sm border-b border-border bg-background px-space-md pt-safe-t pb-space-sm",
        className,
      )}
    >
      <div className="min-w-0 flex-1 pt-space-sm">
        <h1 className="truncate font-display text-title-md">{title}</h1>
        {subtitle && (
          <p className="truncate text-caption text-muted">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 pt-space-sm">{action}</div>}
    </header>
  );
}
