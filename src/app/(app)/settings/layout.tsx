import { getAppContext } from "@/lib/workspace-context";

import { SettingsTabs } from "./settings-tabs";

/**
 * Settings shell. The preview shows Connections / Team / Brand as one page;
 * they're split into routes here so each can load its own data independently
 * and deep-link (the OAuth callback redirects straight to /settings/connections).
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { role } = await getAppContext();
  const isAdmin = role === "owner" || role === "admin";

  return (
    <>
      <SettingsTabs isAdmin={isAdmin} />
      {children}
    </>
  );
}
