"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { Icon, NumberBadge } from "@/ds";
import { usePendingApprovals } from "@/hooks/use-approvals";
import { isActivePath, NAV_ITEMS } from "@/lib/nav";

function DesktopNav({ pending }: { pending: number }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-background pl-safe-l md:flex">
      <div className="flex h-14 items-center gap-space-xs px-space-md">
        <Icon name="Automation" size={16} />
        <span className="font-display text-title-sm">app8n</span>
      </div>

      <nav className="flex flex-1 flex-col gap-space-xxs p-space-xs">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-start gap-space-sm rounded-sm px-space-sm py-space-xs transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted hover:bg-secondary hover:text-foreground",
              )}
            >
              <span className="mt-space-xxs shrink-0">
                <Icon name={item.icon} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-space-xs text-body-md font-medium">
                  {item.label}
                  {item.href === "/approvals" && pending > 0 && (
                    <NumberBadge count={pending} tone="primary" max={9} />
                  )}
                </span>
                <span className="block truncate text-caption text-muted">
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <p className="px-space-md pb-space-md text-legal leading-relaxed text-muted">
        Local-first. Your credentials stay in an encrypted vault on this
        machine.
      </p>
    </aside>
  );
}

function TabBar({ pending }: { pending: number }) {
  const pathname = usePathname();

  return (
    <nav
      // `pb-safe-b` clears the iOS home indicator; the bar's own height stays
      // constant so the layout does not jump between devices. Flat canvas and
      // a hairline, not a blur: this system has no glass surfaces.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-safe-b md:hidden"
    >
      <div className="mx-auto grid h-tabbar max-w-lg grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center justify-center gap-space-xxs text-legal font-medium transition-colors",
                active ? "text-primary" : "text-muted active:text-foreground",
              )}
            >
              <span className="relative flex items-center">
                <Icon name={item.icon} size={16} />
                {item.href === "/approvals" && pending > 0 && (
                  <span className="absolute -top-space-xs -right-space-xs">
                    <NumberBadge count={pending} tone="primary" max={9} />
                  </span>
                )}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * The app frame: a navigation rail on tablet and desktop, a bottom tab bar on
 * phones.
 *
 * Both navigations are always mounted and toggled with CSS rather than a
 * JavaScript breakpoint check, so the correct one is present in the very first
 * paint and a rotating device never flashes the wrong chrome.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: approvals } = usePendingApprovals();
  const pending = approvals?.length ?? 0;

  return (
    <div className="flex min-h-dvh">
      <DesktopNav pending={pending} />

      {/* The tab bar is fixed, so the main column reserves its height to keep
          the last line of content reachable above it. */}
      <main className="flex min-h-dvh w-full min-w-0 flex-col pb-[calc(var(--spacing-tabbar)+var(--spacing-safe-b))] md:pb-0">
        {children}
      </main>

      <TabBar pending={pending} />
    </div>
  );
}
