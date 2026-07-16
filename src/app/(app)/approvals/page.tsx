import { PhasePlaceholder } from "@/components/ui/phase-placeholder";

export const metadata = { title: "Approvals — Signal" };

export default function ApprovalsPage() {
  return (
    <PhasePlaceholder
      title="Approvals"
      subtitle="Clients approve straight from email — no login needed"
      phase="Phase 5"
      description="One-click email approvals and the approvals queue are built in Phase 5."
    />
  );
}
