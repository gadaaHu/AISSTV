import { useTheme } from "../../hooks/useTheme";
import type { ThemePreference } from "../../hooks/useTheme";
import { cn } from "../../lib/utils";
import { IconButton } from "./IconButton";
import type { IconName } from "./Icon";

const OPTIONS: {
  value: ThemePreference;
  icon: IconName;
  label: string;
}[] = [
  { value: "light", icon: "sun", label: "Light theme" },
  { value: "dark", icon: "moon", label: "Dark theme" },
  { value: "system", icon: "monitor", label: "Match system theme" },
];

/**
 * Three-way light/dark/system switch over `useTheme()`.
 *
 * A group of `aria-pressed` toggles rather than a radiogroup: a radiogroup
 * would owe the user arrow-key navigation, and these are three independent
 * one-tap commands. The pressed button is the current preference — `system`
 * stays pressed even though it resolves to light or dark, because that is the
 * choice the user made.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const active = preference === option.value;
        return (
          <IconButton
            key={option.value}
            icon={option.icon}
            label={option.label}
            size="sm"
            aria-pressed={active}
            onClick={() => setPreference(option.value)}
            className={cn(
              "h-7 w-7",
              active
                ? "bg-white text-brand-600 shadow-sm dark:bg-slate-700 dark:text-brand-300"
                : "text-slate-500 dark:text-slate-400",
            )}
          />
        );
      })}
    </div>
  );
}
