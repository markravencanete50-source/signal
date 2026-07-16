import { SettingsTabs } from "./settings-tabs";

/**
 * Settings shell. The preview shows Connections / Team / Brand as one page;
 * they're split into routes here so each can load its own data independently
 * and deep-link (the OAuth callback redirects straight to /settings/connections).
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsTabs />
      {children}
    </>
  );
}
