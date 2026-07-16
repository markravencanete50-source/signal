import { PhasePlaceholder } from "@/components/ui/phase-placeholder";
import { requireTeamView } from "@/lib/auth/view-guard";

export const metadata = { title: "Media library — Signal" };

// Team-only view: clients are redirected here by nowhere, but a typed URL must
// still 403 rather than render. requireTeamView throws ForbiddenError.
export default async function MediaPage() {
  await requireTeamView();
  return (
    <PhasePlaceholder
      title="Media library"
      subtitle="Cloudinary-backed assets with per-platform transforms"
      phase="Phase 2"
      description="The media library — signed uploads, tags, usage tracking and the native-format guard — is built in Phase 2."
    />
  );
}
