import { Card } from "@/components/ui/card";
import { requireTeamView } from "@/lib/auth/view-guard";
import { getOrCreateSmartLink } from "@/lib/db/smartlinks";
import { env } from "@/lib/env";
import { getAppContext } from "@/lib/workspace-context";
import type { Brand } from "@/types";

import { SmartLinkEditor } from "./smartlink-editor";

export const metadata = { title: "SmartLink — Signal" };

/**
 * SmartLink admin — the link-in-bio editor for the active brand. Team-only
 * (clients can't manage links). The brand's SmartLink is created with defaults
 * on first visit so there's always something to edit.
 */
export default async function SmartLinkPage() {
  await requireTeamView();
  const { activeBrand } = await getAppContext();

  return (
    <>
      <div className="mb-[22px]">
        <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">SmartLink</h1>
        <p className="text-text-2 mt-[3px] text-[0.88rem]">
          Link-in-bio with post-level click attribution
        </p>
      </div>

      {!activeBrand ? (
        <Card className="text-center">
          <p className="text-[0.95rem] font-semibold">No brand selected</p>
          <p className="text-text-2 mx-auto mt-1 max-w-[380px] text-[0.85rem]">
            Add a brand first — each brand gets its own SmartLink page.
          </p>
        </Card>
      ) : (
        <Editor brand={activeBrand} />
      )}
    </>
  );
}

async function Editor({ brand }: { brand: Brand }) {
  const smartlink = await getOrCreateSmartLink(brand);
  const publicUrl = `${env().APP_URL}/s/${smartlink.slug}`;

  return <SmartLinkEditor initial={smartlink} publicUrl={publicUrl} />;
}
