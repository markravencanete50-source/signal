import { PhasePlaceholder } from "@/components/ui/phase-placeholder";
import { requireTeamView } from "@/lib/auth/view-guard";

export const metadata = { title: "Autolists — Signal" };

// Team-only view: clients are redirected here by nowhere, but a typed URL must
// still 403 rather than render. requireTeamView throws ForbiddenError.
export default async function AutolistsPage() {
  await requireTeamView();
  return (
    <PhasePlaceholder
      title="Autolists"
      subtitle="Evergreen queues that keep publishing — with a performance filter"
      phase="Phase 6"
      description="Evergreen queues, RSS-to-social and the auto-retire-underperformers filter are built in Phase 6."
    />
  );
}
