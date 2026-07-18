/**
 * Route transition wrapper for every authed page. Unlike layout.tsx, a
 * template re-mounts on each navigation, so the entrance animation replays as
 * you move between features — a subtle fade-up that makes switching feel
 * intentional rather than abrupt. `motion-safe:` keeps it off for users with
 * prefers-reduced-motion.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="motion-safe:animate-[fadeSlideIn_.3s_ease]">{children}</div>;
}
