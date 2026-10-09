import { cn } from "../../lib/utils";
import { IconButton } from "./IconButton";

/**
 * Offset/limit paging for a server-driven list.
 *
 * Renders nothing at all when a single page holds everything (`total <=
 * limit`), and clamps the reported offset into `0 … max(0, total - limit)` so a
 * stale offset left over from a filter change can never show "Showing 151–175
 * of 12".
 */
export function Pagination({
  total,
  limit,
  offset,
  onOffsetChange,
  disabled = false,
  itemLabel = "items",
  className,
}: {
  total: number;
  limit: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
  disabled?: boolean;
  itemLabel?: string;
  className?: string;
}) {
  if (total <= limit) return null;

  const maxOffset = Math.max(0, total - limit);
  const safeOffset = Math.min(Math.max(offset, 0), maxOffset);
  const first = safeOffset + 1;
  const last = Math.min(safeOffset + limit, total);
  const atStart = safeOffset <= 0;
  const atEnd = safeOffset >= maxOffset;

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 px-1 py-3",
        className,
      )}
    >
      <p
        aria-live="polite"
        className="text-xs text-slate-500 dark:text-slate-400"
      >
        Showing{" "}
        <span className="font-medium text-slate-700 dark:text-slate-200">
          {first}–{last}
        </span>{" "}
        of{" "}
        <span className="font-medium text-slate-700 dark:text-slate-200">
          {total}
        </span>{" "}
        {itemLabel}
      </p>

      <div className="flex items-center gap-1">
        <IconButton
          icon="chevronLeft"
          label="Previous page"
          size="sm"
          disabled={disabled || atStart}
          onClick={() => onOffsetChange(Math.max(0, safeOffset - limit))}
        />
        <IconButton
          icon="chevronRight"
          label="Next page"
          size="sm"
          disabled={disabled || atEnd}
          onClick={() => onOffsetChange(Math.min(maxOffset, safeOffset + limit))}
        />
      </div>
    </nav>
  );
}
