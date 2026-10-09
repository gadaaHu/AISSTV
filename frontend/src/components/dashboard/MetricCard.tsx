import type { Tone } from "../../lib/constants";
import { formatNumber } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Card, Icon, type IconName } from "../ui";

/** Background + glow of the icon tile per tone. */
const ICON_TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  brand:
    "bg-gradient-to-br from-blue-100 to-purple-100 text-blue-600 shadow-[0_0_8px_0_rgba(66,133,244,0.3)] dark:from-blue-950 dark:to-purple-950 dark:text-blue-300",
  success:
    "bg-emerald-50 text-emerald-600 shadow-[0_0_8px_0_rgba(52,168,83,0.25)] dark:bg-emerald-950 dark:text-emerald-300",
  warning:
    "bg-amber-50 text-amber-600 shadow-[0_0_8px_0_rgba(251,188,4,0.25)] dark:bg-amber-950 dark:text-amber-300",
  danger:
    "bg-rose-50 text-rose-600 shadow-[0_0_8px_0_rgba(234,67,53,0.25)] dark:bg-rose-950 dark:text-rose-300",
  info:
    "bg-sky-50 text-sky-600 shadow-[0_0_8px_0_rgba(36,193,224,0.25)] dark:bg-sky-950 dark:text-sky-300",
};

/**
 * One KPI tile.
 *
 * `value` is a `number` so every count goes through `formatNumber` and the
 * thousand separator cannot be forgotten at a call site; a figure that does not
 * exist yet is the caller's job to withhold (the dashboard renders `Skeleton`
 * tiles while the summary is still loading).
 *
 * The icon tile has a soft coloured shadow for a premium glow effect.
 */
export function MetricCard({
  label,
  value,
  icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: number;
  icon: IconName;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <Card className="h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
            {formatNumber(value)}
          </p>
        </div>

        <span
          aria-hidden="true"
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-transform duration-300 hover:scale-110",
            ICON_TONES[tone],
          )}
        >
          <Icon name={icon} className="h-5 w-5" strokeWidth={2} />
        </span>
      </div>

      {hint ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </Card>
  );
}
