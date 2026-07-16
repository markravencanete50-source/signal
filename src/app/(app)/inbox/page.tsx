import { Card } from "@/components/ui/card";
import { requireTeamView } from "@/lib/auth/view-guard";
import { listInbox } from "@/lib/db/inbox";
import { getAppContext } from "@/lib/workspace-context";

import { InboxList } from "./inbox-list";

export const metadata = { title: "Inbox — Signal" };

/**
 * Inbox — comments and mentions across FB + IG, sentiment-sorted. Team-only
 * (a read-only client doesn't reply as the brand). Items are ingested by the
 * sync engine with a Claude sentiment label; this view surfaces and acts on them.
 */
export default async function InboxPage() {
  await requireTeamView();
  const { activeBrand } = await getAppContext();

  if (!activeBrand) {
    return (
      <>
        <Header />
        <Card className="text-center">
          <p className="text-[0.95rem] font-semibold">No brand selected</p>
          <p className="text-text-2 mx-auto mt-1 max-w-[380px] text-[0.85rem]">
            Connect a brand&rsquo;s accounts and the sync will start pulling comments and mentions
            here.
          </p>
        </Card>
      </>
    );
  }

  const items = await listInbox(activeBrand.id);

  return (
    <>
      <Header />
      {items.length === 0 ? (
        <Card className="text-center">
          <p className="text-[0.95rem] font-semibold">Inbox is empty</p>
          <p className="text-text-2 mx-auto mt-1 max-w-[380px] text-[0.85rem]">
            New comments and mentions land here after the next sync, tagged by sentiment.
          </p>
        </Card>
      ) : (
        <InboxList items={items} />
      )}
    </>
  );
}

function Header() {
  return (
    <div className="mb-[22px]">
      <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">Inbox</h1>
      <p className="text-text-2 mt-[3px] text-[0.88rem]">
        Comments &amp; mentions across FB + IG · sentiment-sorted
      </p>
    </div>
  );
}
