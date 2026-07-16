import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { Brand, Notification, Role, User } from "@/types";

import { BrandSwitcher } from "./brand-switcher";
import { GlobalSearch } from "./global-search";
import { NotificationsBell } from "./notifications-bell";
import { UserMenu } from "./user-menu";

/**
 * Topbar — replicates `.topbar` from the preview.
 *
 *   60px tall, sticky, surface background, bottom border.
 *   brand switcher · search · sync status · notifications · theme · avatar
 *
 * Search and sync hide below 768px, exactly as the preview does.
 */

export interface TopbarProps {
  brands: Brand[];
  activeBrandId: string;
  user: User;
  role: Role;
  lastSyncAt: string | null;
  notifications: Notification[];
}

export function Topbar({
  brands,
  activeBrandId,
  user,
  role,
  lastSyncAt,
  notifications,
}: TopbarProps) {
  return (
    <header className="border-border bg-surface sticky top-0 z-40 flex h-[60px] items-center gap-3 border-b px-4 md:px-6">
      {brands.length > 0 && (
        <BrandSwitcher
          brands={brands}
          activeBrandId={activeBrandId}
          canAddBrand={role === "owner" || role === "admin"}
        />
      )}

      <GlobalSearch />

      <SyncStatus lastSyncAt={lastSyncAt} />

      <NotificationsBell notifications={notifications} />

      <ThemeToggle />
      <UserMenu user={user} role={role} />
    </header>
  );
}

/**
 * `.sync` — the pulsing dot and relative timestamp.
 *
 * `ml-auto` here is what pushes everything after it to the right, so it stays
 * mounted on mobile (hidden, not removed) to preserve the layout.
 */
function SyncStatus({ lastSyncAt }: { lastSyncAt: string | null }) {
  return (
    <div className="text-text-2 ml-auto hidden items-center gap-[7px] text-[0.78rem] md:flex">
      <span
        className="bg-success size-2 rounded-full motion-safe:animate-[pulse_2.4s_infinite]"
        aria-hidden="true"
      />
      {lastSyncAt ? `Synced ${relativeTime(lastSyncAt)}` : "Not synced yet"}
    </div>
  );
}

/**
 * Compact relative time ("12 min ago").
 *
 * Rendered on the server, so it's the time at render — acceptable for a sync
 * indicator, and it avoids a hydration mismatch from clock skew between server
 * and client.
 */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;

  return `${Math.floor(hours / 24)} d ago`;
}
