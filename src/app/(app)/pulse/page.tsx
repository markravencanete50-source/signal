import { PhasePlaceholder } from "@/components/ui/phase-placeholder";
import { requireTeamView } from "@/lib/auth/view-guard";

export const metadata = { title: "Pulse — Signal" };

// Team-only view: clients are redirected here by nowhere, but a typed URL must
// still 403 rather than render. requireTeamView throws ForbiddenError.
export default async function PulsePage() {
  await requireTeamView();
  return (
    <PhasePlaceholder
      title="Pulse"
      subtitle="Platform watch — is it you, or is it the algorithm?"
      phase="Phase 3"
      description="The anomaly log with platform-vs-content verdicts, native-format-guard stats and the platform-changes feed arrive in Phase 3."
    />
  );
}
