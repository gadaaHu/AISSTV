import type { StatusStyle } from "../../lib/constants";
import { cn } from "../../lib/utils";
import { toneClasses } from "./Badge";

/**
 * A `StatusStyle` (`{label, tone}` from `src/lib/constants.ts`) rendered as a
 * pill with a leading dot, so the state reads at a glance even in a dense
 * table.
 */
export function StatusBadge({
  style,
  dot = true,
  className,
}: {
  style: StatusStyle;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[style.tone],
        className,
      )}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
        />
      ) : null}
      {style.label}
    </span>
  );
}
