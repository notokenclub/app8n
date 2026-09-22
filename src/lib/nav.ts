import type { IconName } from "@/ds";

export interface NavItem {
  href: string;
  label: string;
  /** A glyph from the design system's curated 16px utility set. */
  icon: IconName;
  /** Longer label for the desktop sidebar, where there is room for it. */
  description: string;
}

/**
 * Tab order is deliberate: chat is the home screen, and approvals sit second
 * because a pending gate is the one thing that blocks work and needs to be
 * reachable in one tap from anywhere.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Chat",
    icon: "ChatWidget",
    description: "Ask app8n to do things",
  },
  {
    href: "/approvals",
    label: "Approvals",
    icon: "LockLocked",
    description: "Actions waiting on you",
  },
  {
    href: "/workflows",
    label: "Blueprints",
    icon: "DataFlow",
    description: "Saved and scheduled automations",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: "Component",
    description: "Accounts, keys and the vault",
  },
];

/** Which tab owns a pathname. Nested routes highlight their parent tab. */
export function isActivePath(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
