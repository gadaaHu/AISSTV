import { cn } from "../../lib/utils";

const SIZES = {
  sm: "h-3.5 w-3.5 border-2",
  md: "h-4 w-4 border-2",
  lg: "h-6 w-6 border-[3px]",
} as const;

/**
 * A CSS-only busy indicator.
 *
 * `role="status"` makes it announce itself; pass `label` for the words to
 * announce (it is rendered `sr-only`). The ring itself is `aria-hidden`, so a
 * spinner with no label adds nothing to the accessibility tree.
 */
export function Spinner({
  size = "md",
  className,
  label,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      className={cn("inline-flex items-center justify-center", className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "animate-spin rounded-full border-current border-t-transparent",
          SIZES[size],
        )}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
