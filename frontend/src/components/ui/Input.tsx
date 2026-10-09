import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../../lib/utils";

/**
 * The shared visual language for text controls.
 *
 * `Input`, `Textarea` and `Select` all compose these, so the three cannot drift
 * apart. The focus ring itself comes from the global `:focus-visible` rule in
 * `src/styles.css`; `focus:border-brand-500` only reinforces it.
 */
export const inputBaseClasses =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500";

/** Applied on top of `inputBaseClasses` when the value failed validation. */
export const inputInvalidClasses =
  "border-rose-400 focus:border-rose-500 dark:border-rose-700";

export interface InputProps extends ComponentPropsWithoutRef<"input"> {
  invalid?: boolean;
}

export function Input({ invalid, className, ...rest }: InputProps) {
  return (
    <input
      {...rest}
      aria-invalid={invalid ? true : undefined}
      className={cn(
        inputBaseClasses,
        invalid && inputInvalidClasses,
        className,
      )}
    />
  );
}
