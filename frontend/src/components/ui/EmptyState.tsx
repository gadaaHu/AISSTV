import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

/** The "nothing here yet" panel: an icon, an explanation and a way forward. */
export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  className,
}: {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900/40",
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <Icon name={icon} className="h-6 w-6" />
      </span>

      <div className="flex max-w-md flex-col gap-1">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </div>
        {description ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>

      {action}
    </div>
  );
}
