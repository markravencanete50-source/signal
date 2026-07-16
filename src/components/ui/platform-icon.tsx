import { cn } from "@/lib/cn";
import type { Platform } from "@/types";

/**
 * Platform badge — replicates `.plat`, `.plat-fb`, `.plat-ig` from the preview.
 *
 * These two brand colours are the one sanctioned exception to the no-raw-hex
 * rule: Facebook blue and the Instagram gradient are external brand assets, not
 * Signal's palette. They must NOT flip with the theme — a recoloured Instagram
 * logo is both wrong and a trademark problem — so they can't be tokens.
 */

const FB_BLUE = "#1877F2";
const IG_GRADIENT = "linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)";

export interface PlatformIconProps {
  platform: Platform;
  /** Badge size in px. Preview uses 22 inline, 38 on cards. */
  size?: number;
  className?: string;
}

export function PlatformIcon({ platform, size = 22, className }: PlatformIconProps) {
  const isFb = platform === "fb";
  const glyph = Math.round(size * 0.55);

  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-[7px] text-white", className)}
      style={{
        width: size,
        height: size,
        background: isFb ? FB_BLUE : IG_GRADIENT,
        borderRadius: size >= 32 ? 11 : 7,
      }}
      aria-hidden="true"
    >
      {isFb ? <FacebookGlyph size={glyph} /> : <InstagramGlyph size={glyph} />}
    </span>
  );
}

function FacebookGlyph({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: size, height: size }}>
      <path d="M15 3h3V0h-3a5 5 0 00-5 5v3H7v3h3v10h3V11h3l1-3h-4V5c0-1.1.9-2 2-2z" />
    </svg>
  );
}

function InstagramGlyph({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      style={{ width: size, height: size }}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}
