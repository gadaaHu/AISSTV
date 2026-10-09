import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

/**
 * The surface every panel sits on.
 *
 * A header row (with a bottom border) is rendered as soon as there is a
 * `title`, `description` or `actions`, so the three stay aligned with each
 * other; without them the card is just the padded body.
 *
 * Hovering reveals an animated Gemini-colours conic-gradient border via the
 * `gemini-border-card` CSS utility defined in `styles.css`.
 */
export function Card({
  title,
  description,
  actions,
  padded = true,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const hasHeader = Boolean(title ?? description ?? actions);

  return (
    <div
      className={cn(
        // Structural + colour
        "gemini-border-card rounded-xl border border-slate-200 bg-white",
        "dark:border-slate-800 dark:bg-slate-900",
        // Smooth elevation on hover
        "transition-shadow duration-300 hover:shadow-lg",
        className,
      )}
    >
      {hasHeader ? (
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            {title ? (
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {title}
              </h3>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      <div className={cn(padded && "p-4")}>{children}</div>
    </div>
  );
}
