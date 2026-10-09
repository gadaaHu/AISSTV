import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../../lib/utils";
import { inputBaseClasses, inputInvalidClasses } from "./Input";

export interface TextareaProps extends ComponentPropsWithoutRef<"textarea"> {
  invalid?: boolean;
}

export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  return (
    <textarea
      {...rest}
      aria-invalid={invalid ? true : undefined}
      className={cn(
        inputBaseClasses,
        "min-h-20 resize-y",
        invalid && inputInvalidClasses,
        className,
      )}
    />
  );
}
