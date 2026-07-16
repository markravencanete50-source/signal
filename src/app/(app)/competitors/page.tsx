import { PhasePlaceholder } from "@/components/ui/phase-placeholder";
import { requireTeamView } from "@/lib/auth/view-guard";

export const metadata = { title: "Competitors — Signal" };

// Team-only view: clients are redirected here by nowhere, but a typed URL must
// still 403 rather than render. requireTeamView throws ForbiddenError.
export default async function CompetitorsPage() {
  await requireTeamView();
  return (
    <PhasePlaceholder
      title="Competitors"
      subtitle="Daily snapshots · public data only"
      phase="Phase 6"
      description="Competitor tracking, daily snapshots and the AI comparison insight are built in Phase 6."
    />
  );
}
