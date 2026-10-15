import { cn } from "@/lib/utils";

/**
 * RouteLine — the signature "trip path" motif.
 * Used as the progress indicator through checkout → active → checkin,
 * and as a header flourish on investor settlement statements.
 * Animation respects prefers-reduced-motion (handled in index.css).
 */
export function RouteLine({
  className,
  variant = "horizontal",
  animated = false,
  width = 2,
}: {
  className?: string;
  variant?: "horizontal" | "progress";
  animated?: boolean;
  width?: number;
}) {
  if (variant === "progress") {
    return (
      <svg
        viewBox="0 0 600 24"
        preserveAspectRatio="none"
        className={cn("h-3 w-full", animated && "route-draw", className)}
        aria-hidden
      >
        <path
          d="M4 12 C 80 12, 80 4, 160 4 S 240 20, 320 12 S 400 4, 480 12 S 560 20, 596 12"
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={width}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 120 12"
      preserveAspectRatio="none"
      className={cn("h-3 w-full", animated && "route-draw", className)}
      aria-hidden
    >
      <path
        d="M2 6 C 20 6, 20 2, 40 2 S 60 10, 80 6 S 100 2, 118 6"
        fill="none"
        stroke="currentColor"
        strokeWidth={width}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Progress variant with a filled portion up to `value` (0..1). */
export function RouteProgress({
  value,
  className,
  stops = 3,
}: {
  value: number;
  className?: string;
  stops?: number;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox="0 0 600 24"
        preserveAspectRatio="none"
        className="h-4 w-full"
        aria-hidden
      >
        <path
          d="M4 12 C 80 12, 80 4, 160 4 S 240 20, 320 12 S 400 4, 480 12 S 560 20, 596 12"
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M4 12 C 80 12, 80 4, 160 4 S 240 20, 320 12 S 400 4, 480 12 S 560 20, 596 12"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="600"
          strokeDashoffset={600 - clamped * 600}
          style={{ transition: "stroke-dashoffset 0.5s ease-out" }}
        />
      </svg>
      {Array.from({ length: stops }).map((_, i) => {
        const positions = [4, 300, 596];
        const reached = clamped >= (i + 1) / stops - 0.02;
        return (
          <span
            key={i}
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
            style={{
              left: `${(positions[i] / 600) * 100}%`,
              background: reached
                ? "hsl(var(--primary))"
                : "hsl(var(--border))",
            }}
          />
        );
      })}
    </div>
  );
}
