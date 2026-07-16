import { PhasePlaceholder } from "@/components/ui/phase-placeholder";
import { requireTeamView } from "@/lib/auth/view-guard";

export const metadata = { title: "SmartLink — Signal" };

// Team-only view: clients are redirected here by nowhere, but a typed URL must
// still 403 rather than render. requireTeamView throws ForbiddenError.
export default async function SmartLinkPage() {
  await requireTeamView();
  return (
    <PhasePlaceholder
      title="SmartLink"
      subtitle="Link-in-bio with post-level click attribution"
      phase="Phase 5"
      description="The public link-in-bio page with drag-to-reorder and post-level click attribution is built in Phase 5."
    />
  );
}
