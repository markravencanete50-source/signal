import { PhasePlaceholder } from "@/components/ui/phase-placeholder";
import { requireTeamView } from "@/lib/auth/view-guard";

export const metadata = { title: "Studio — Signal" };

// Team-only view: clients are redirected here by nowhere, but a typed URL must
// still 403 rather than render. requireTeamView throws ForbiddenError.
export default async function StudioPage() {
  await requireTeamView();
  return (
    <PhasePlaceholder
      title="Studio"
      subtitle="Content that starts from your data — not a blank page"
      phase="Phase 4"
      description="Coherence ring, pillar balance and scored AI suggestions with full reasoning chains arrive in Phase 4, once the sync and AI engines are live."
    />
  );
}
