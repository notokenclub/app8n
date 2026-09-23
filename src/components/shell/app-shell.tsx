"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "cn";
import { usePendingApprovals } from "@/hooks/use-approvals";
import { usePushRegistration } from "@/hooks/use-push";
import { isActivePath, NAV_ITEMS } from "@/lib/nav";

/** Small count bubble on the Approvals tab. Hidden at zero. */
function PendingBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] font-semibold text-white tabular-nums",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function Sidebar({ pending }: { pending: number }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar pl-safe-l md:flex">
      <div className="flex h-14 items-center gap-2 px-4">
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-semibold tracking-tight">app8n</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-start gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
              )}
            >
              <item.icon className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2 font-medium">
                  {item.label}
                  {item.href === "/approvals" && (
                    <PendingBadge count={pending} />
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <p className="px-4 pb-4 text-[0.625rem] leading-relaxed text-muted-foreground">
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
      // constant so the layout does not jump between devices.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/85 pb-safe-b backdrop-blur-lg md:hidden"
    >
      <div
        className="mx-auto grid h-tabbar max-w-lg"
        // Derived from the nav list rather than hardcoded: a tab added to
        // NAV_ITEMS must not silently overflow a fixed column count.
        style={{
          gridTemplateColumns: `repeat(${NAV_ITEMS.length}, minmax(0, 1fr))`,
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 text-[0.625rem] font-medium transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground active:text-foreground",
              )}
            >
              <span className="relative">
                <item.icon
                  className={cn("size-5", active && "text-primary")}
                  strokeWidth={active ? 2.4 : 1.8}
                />
                {item.href === "/approvals" && (
                  <PendingBadge
                    count={pending}
                    className="absolute -top-1 -right-2"
                  />
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
 * The app frame: a sidebar on tablet and desktop, a bottom tab bar on phones.
 *
 * Both navigations are always mounted and toggled with CSS rather than a
 * JavaScript breakpoint check, so the correct one is present in the very first
 * paint and a rotating device never flashes the wrong chrome.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: approvals } = usePendingApprovals();
  // Mounted at the frame so a device registers once per app launch, whichever
  // tab the user happens to land on first.
  usePushRegistration();
  const pending = approvals?.length ?? 0;

  return (
    <div className="flex min-h-dvh">
      <Sidebar pending={pending} />

      {/* The tab bar is fixed, so the main column reserves its height to keep
          the last line of content reachable above it. */}
      <main className="flex min-h-dvh w-full min-w-0 flex-col pb-[calc(var(--spacing-tabbar)+var(--spacing-safe-b))] md:pb-0">
        {children}
      </main>

      <TabBar pending={pending} />
    </div>
  );
}
