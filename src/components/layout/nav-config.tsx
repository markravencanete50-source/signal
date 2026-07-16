import {
  AnalyticsIcon,
  ApprovalsIcon,
  AutolistsIcon,
  CompetitorsIcon,
  DashboardIcon,
  InboxIcon,
  MediaIcon,
  PlannerIcon,
  PulseIcon,
  ReportsIcon,
  SettingsIcon,
  SmartLinkIcon,
  StudioIcon,
  type IconProps,
} from "@/components/ui/icons";
import type { Role } from "@/types";

/**
 * Navigation model — single source of truth for the sidebar, the mobile More
 * sheet, and role-based visibility. Defined once so the two navs can never
 * drift apart.
 *
 * Section grouping matches the preview exactly: Create / Understand / Engage /
 * Clients / Workspace, with Dashboard ungrouped at the top.
 */

export interface NavItem {
  href: string;
  label: string;
  Icon: (p: IconProps) => React.ReactElement;
  /** Renders the accent "NEW" pill from the preview. */
  isNew?: boolean;
  /** Which roles may see this at all. Omitted = everyone. */
  roles?: readonly Role[];
  /** Key for a live count badge, resolved by the shell. */
  badge?: "inbox" | "approvals";
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/**
 * A `client` sees only what they're here to do: review posts and read reports.
 * Hiding the rest is UX, not security — the DAL and Firestore rules are what
 * actually stop them reaching it. A client who types /planner still gets a 403.
 */
const CLIENT_VISIBLE: readonly Role[] = ["owner", "admin", "editor", "client"];
const TEAM_ONLY: readonly Role[] = ["owner", "admin", "editor"];

export const NAV: NavSection[] = [
  {
    items: [{ href: "/dashboard", label: "Dashboard", Icon: DashboardIcon, roles: CLIENT_VISIBLE }],
  },
  {
    title: "Create",
    items: [
      { href: "/planner", label: "Planner", Icon: PlannerIcon, roles: TEAM_ONLY },
      { href: "/studio", label: "Studio", Icon: StudioIcon, isNew: true, roles: TEAM_ONLY },
      { href: "/media", label: "Media", Icon: MediaIcon, roles: TEAM_ONLY },
      { href: "/autolists", label: "Autolists", Icon: AutolistsIcon, roles: TEAM_ONLY },
    ],
  },
  {
    title: "Understand",
    items: [
      { href: "/analytics", label: "Analytics", Icon: AnalyticsIcon, roles: CLIENT_VISIBLE },
      { href: "/pulse", label: "Pulse", Icon: PulseIcon, isNew: true, roles: TEAM_ONLY },
      { href: "/competitors", label: "Competitors", Icon: CompetitorsIcon, roles: TEAM_ONLY },
    ],
  },
  {
    title: "Engage",
    items: [{ href: "/inbox", label: "Inbox", Icon: InboxIcon, badge: "inbox", roles: TEAM_ONLY }],
  },
  {
    title: "Clients",
    items: [
      { href: "/reports", label: "Reports", Icon: ReportsIcon, roles: CLIENT_VISIBLE },
      {
        href: "/approvals",
        label: "Approvals",
        Icon: ApprovalsIcon,
        badge: "approvals",
        roles: CLIENT_VISIBLE,
      },
      { href: "/smartlink", label: "SmartLink", Icon: SmartLinkIcon, roles: TEAM_ONLY },
    ],
  },
  {
    title: "Workspace",
    items: [{ href: "/settings", label: "Settings", Icon: SettingsIcon, roles: CLIENT_VISIBLE }],
  },
];

/** Filter the nav for a role, dropping sections left empty. */
export function navForRole(role: Role): NavSection[] {
  return NAV.map((section) => ({
    ...section,
    items: section.items.filter((i) => !i.roles || i.roles.includes(role)),
  })).filter((section) => section.items.length > 0);
}

/** Bottom-nav primaries. The rest live in the More sheet — matches the preview. */
export const MOBILE_PRIMARY: NavItem[] = [
  { href: "/dashboard", label: "Home", Icon: DashboardIcon, roles: CLIENT_VISIBLE },
  { href: "/planner", label: "Planner", Icon: PlannerIcon, roles: TEAM_ONLY },
  { href: "/studio", label: "Studio", Icon: StudioIcon, roles: TEAM_ONLY },
];
