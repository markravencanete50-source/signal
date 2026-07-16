import { LogoMark } from "@/components/ui/icons";
import { getDeletionRequest } from "@/lib/db/deletion-requests";

export const metadata = { title: "Data deletion — Signal" };
export const dynamic = "force-dynamic";

/**
 * Public status page for a Meta data-deletion request (`/data-deletion/{code}`).
 * No auth — the code from the callback is the reference. Meta requires the
 * deletion callback to return a URL the user can visit to confirm the outcome;
 * this is it.
 */
export default async function DataDeletionStatusPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const req = await getDeletionRequest(code);

  return (
    <div className="bg-bg min-h-screen">
      <div className="mx-auto w-full max-w-[520px] px-5 py-16">
        <div className="mb-6 flex items-center gap-[10px]">
          <span className="bg-accent text-accent-fg grid size-[30px] place-items-center rounded-[9px]">
            <LogoMark />
          </span>
          <span className="font-display text-[1.15rem] font-bold tracking-[-0.02em]">Signal</span>
        </div>

        <h1 className="text-[1.4rem] font-bold tracking-[-0.02em]">Data deletion request</h1>

        {!req ? (
          <p className="text-text-2 mt-3 text-[0.9rem] leading-relaxed">
            We couldn&rsquo;t find a request with this reference. If you just submitted it, check
            the confirmation code from Meta and try again.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-text-2 text-[0.9rem] leading-relaxed">
              Your request has been processed. We removed the Meta connection(s) associated with
              your account — the access token you granted has been deleted from Signal.
            </p>
            <dl className="border-border bg-surface divide-border divide-y rounded-2xl border text-[0.86rem]">
              <Row label="Status" value={req.status === "completed" ? "Completed" : "Received"} />
              <Row label="Confirmation code" value={req.code} mono />
              <Row label="Connections removed" value={String(req.connectionsRemoved)} />
              <Row label="Processed" value={new Date(req.requestedAt).toLocaleString("en-GB")} />
            </dl>
            <p className="text-text-2 text-[0.8rem] leading-relaxed">
              Aggregated analytics stored against a brand aren&rsquo;t personal to you and remain
              with the agency that owns the brand. Questions? Contact the agency that invited you,
              or Signal support.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-text-2">{label}</dt>
      <dd className={`font-semibold ${mono ? "font-mono text-[0.78rem] break-all" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
