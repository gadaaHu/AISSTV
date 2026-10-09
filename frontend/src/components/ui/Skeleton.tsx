import { cn } from "../../lib/utils";

/** A pulsing grey block standing in for content that is still loading. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "block animate-pulse rounded-md bg-slate-200 dark:bg-slate-800",
        className,
      )}
    />
  );
}

/**
 * `lines` stacked skeleton lines; the last one is short so the block reads as
 * a paragraph rather than a solid slab.
 */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  const count = Math.max(1, Math.trunc(lines));

  return (
    <div aria-hidden="true" className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3", index === count - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}
