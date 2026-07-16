import { PhasePlaceholder } from "@/components/ui/phase-placeholder";
import { requireTeamView } from "@/lib/auth/view-guard";

export const metadata = { title: "New post — Signal" };

// The Composer modal route. In Phase 2 this becomes the full compose experience
// (platform toggles, variants, media picker, best-time chips, predicted score).
export default async function ComposePage() {
  await requireTeamView();
  return (
    <PhasePlaceholder
      title="New post"
      subtitle="Composer"
      phase="Phase 2"
      description="The Composer — platform toggles, per-platform caption variants, media picker, hashtag and best-time chips, and the predicted intent score ring — is built in Phase 2."
    />
  );
}
