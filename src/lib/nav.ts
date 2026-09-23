import {
  History,
  LayoutGrid,
  MessagesSquare,
  Settings2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
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
    icon: MessagesSquare,
    description: "Ask app8n to do things",
  },
  {
    href: "/approvals",
    label: "Approvals",
    icon: ShieldCheck,
    description: "Actions waiting on you",
  },
  {
    href: "/workflows",
    label: "Blueprints",
    icon: LayoutGrid,
    description: "Saved and scheduled automations",
  },
  {
    href: "/runs",
    label: "Activity",
    icon: History,
    description: "What every run actually did",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings2,
    description: "Accounts, keys and the vault",
  },
];

/** Which tab owns a pathname. Nested routes highlight their parent tab. */
export function isActivePath(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
