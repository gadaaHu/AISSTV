import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../../lib/utils";
import { Icon } from "./Icon";
import { inputBaseClasses, inputInvalidClasses } from "./Input";

export interface SelectProps extends ComponentPropsWithoutRef<"select"> {
  invalid?: boolean;
}

/**
 * A native `<select>` with `appearance-none` plus a decorative chevron, so it
 * lines up with `Input` and `Textarea`. Keeping the native element means the
 * OS picker, keyboard behaviour and mobile UX come for free.
 */
export function Select({
  invalid,
  className,
  children,
  ...rest
}: SelectProps) {
  return (
    <div className="relative">
      <select
        {...rest}
        aria-invalid={invalid ? true : undefined}
        className={cn(
          inputBaseClasses,
          "appearance-none pr-9",
          invalid && inputInvalidClasses,
          className,
        )}
      >
        {children}
      </select>
      <Icon
        name="chevronDown"
        className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
      />
    </div>
  );
}
