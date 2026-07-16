/**
 * Tiny inline sparkline — pure SVG polyline, matches the preview's `.spark`.
 *
 * Server-renderable (no recharts, no client JS) since the dashboard metric cards
 * are server components. Colour is a chart token so it flips with the theme.
 */
export function Sparkline({
  points,
  color = "var(--chart-1)",
  className,
}: {
  points: number[];
  color?: string;
  className?: string;
}) {
  if (points.length < 2) {
    return <svg className={className} viewBox="0 0 100 34" aria-hidden="true" />;
  }

  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;

  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      // Invert y (SVG origin top-left); pad 4px top/bottom.
      const y = 30 - ((p - min) / range) * 26 + 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className={className} viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
