import { initialsFrom } from "../../lib/format";
import { cn } from "../../lib/utils";

const SIZES = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
} as const;

/**
 * Initials in a tinted circle — the fallback wherever the API has no photo.
 *
 * The initials are decorative; the full name is exposed to assistive tech as
 * `sr-only` text so a row reads as "Amara Okafor", not "A O".
 */
export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 ring-1 ring-brand-200 select-none dark:bg-brand-950 dark:text-brand-300 dark:ring-brand-900",
        SIZES[size],
        className,
      )}
    >
      <span aria-hidden="true">{initialsFrom(name)}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}
