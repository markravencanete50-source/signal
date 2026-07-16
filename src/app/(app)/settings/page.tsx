import { redirect } from "next/navigation";

/** /settings has no content of its own — land on the first tab. */
export default function SettingsIndex() {
  redirect("/settings/connections");
}
