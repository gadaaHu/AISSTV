import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons or filters aligned to the right on wide screens. */
  actions?: ReactNode;
  className?: string;
}

/** The consistent title block every page starts with. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="gemini-text text-xl font-bold tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
