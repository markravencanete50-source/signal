"use client";

import { useTheme } from "next-themes";

/**
 * Topbar light/dark toggle. Replicates `.icon-btn` from the preview.
 *
 * Both icons are always rendered and CSS picks one off the `.dark` class, rather
 * than branching in JS on `resolvedTheme`. The server cannot know the resolved
 * theme, so a JS branch would either mismatch on hydration or need a
 * mounted-flag effect — and `setState` in an effect is both a lint error here
 * and a cascading render. CSS has the answer before React does.
 *
 * This is the sanctioned use of `dark:` — visibility, not colour. Colour flips
 * on its own via the token layer.
 *
 * Fixed chrome sizes use arbitrary px values: the preview specifies 36px/18px
 * literally, and with a 15px root the nearest scale step (size-9 = 33.75px)
 * would quietly drift off-design.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      // Read at click time, on the client, where the value is always known.
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="text-text-2 hover:bg-surface-2 hover:text-text-1 grid size-[36px] place-items-center rounded-[10px] transition-colors"
      aria-label="Toggle dark mode"
    >
      <MoonIcon className="size-[18px] dark:hidden" />
      <SunIcon className="hidden size-[18px] dark:block" />
    </button>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </svg>
  );
}
