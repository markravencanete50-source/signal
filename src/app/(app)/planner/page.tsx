import { PhasePlaceholder } from "@/components/ui/phase-placeholder";
import { requireTeamView } from "@/lib/auth/view-guard";

export const metadata = { title: "Planner — Signal" };

// Team-only view: clients are redirected here by nowhere, but a typed URL must
// still 403 rather than render. requireTeamView throws ForbiddenError.
export default async function PlannerPage() {
  await requireTeamView();
  return (
    <PhasePlaceholder
      title="Planner"
      subtitle="Drag to reschedule · click to edit"
      phase="Phase 2"
      description="The month and week calendar, colour-coded by status with drag-to-reschedule, lands in Phase 2 alongside the Composer and publishing engine."
    />
  );
}
