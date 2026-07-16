import { PhasePlaceholder } from "@/components/ui/phase-placeholder";
import { requireTeamView } from "@/lib/auth/view-guard";

export const metadata = { title: "Inbox — Signal" };

// Team-only view: clients are redirected here by nowhere, but a typed URL must
// still 403 rather than render. requireTeamView throws ForbiddenError.
export default async function InboxPage() {
  await requireTeamView();
  return (
    <PhasePlaceholder
      title="Inbox"
      subtitle="Comments & mentions across FB + IG · sentiment-sorted"
      phase="Phase 6"
      description="The unified inbox with sentiment filters and AI-drafted replies is built in Phase 6."
    />
  );
}
