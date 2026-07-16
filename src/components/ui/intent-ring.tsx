import { cn } from "@/lib/cn";

/**
 * Intent score ring — replicates `.iring` from the preview.
 *
 * A circular progress ring whose stroke colour steps by score band (success
 * ≥75, accent ≥50, warning below) exactly like the preview's `drawRings()`. Pure
 * SVG, no client JS: the stroke-dashoffset is computed at render, so it works in
 * a server component and needs no effect.
 */

export interface IntentRingProps {
  score: number;
  /** Diameter in px. Preview uses 40 (default), 64 (big), 96 (huge). */
  size?: number;
  className?: string;
}

export function IntentRing({ score, size = 40, className }: IntentRingProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const strokeWidth = size >= 96 ? 6 : size >= 64 ? 5 : 3.5;
  const radius = size / 2 - strokeWidth - 1;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  const color =
    clamped >= 75 ? "var(--success)" : clamped >= 50 ? "var(--accent)" : "var(--warning)";
  const fontSize = size >= 96 ? "1.5rem" : size >= 64 ? "1.05rem" : "0.72rem";

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset .8s ease" }}
        />
      </svg>
      <span
        className="font-display absolute inset-0 grid place-items-center font-bold"
        style={{ fontSize }}
      >
        {Math.round(clamped)}
      </span>
    </div>
  );
}
