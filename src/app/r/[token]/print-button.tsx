"use client";

/**
 * "Save as PDF" — triggers the browser's print dialog. The public report page
 * carries print CSS (`print:hidden` on chrome, page-break rules), so printing to
 * PDF yields a clean, branded document without a separate render path.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="border-border text-text-1 hover:bg-surface-2 rounded-[10px] border px-4 py-2 text-[0.85rem] font-semibold print:hidden"
    >
      Save as PDF
    </button>
  );
}
