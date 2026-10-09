import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../../lib/utils";
import { Button } from "./Button";
import type { ButtonProps } from "./Button";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

const BOX_SIZES = {
  sm: "h-8 w-8 p-0",
  md: "h-9 w-9 p-0",
  lg: "h-11 w-11 p-0",
} as const;

const ICON_SIZES = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-5 w-5",
} as const;

export interface IconButtonProps
  extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
  icon: IconName;
  label: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  loading?: boolean;
}

/**
 * A square, icon-only `Button`.
 *
 * `label` is required and becomes both the accessible name (`aria-label`) and
 * the tooltip (`title`), which is what keeps an icon-only control usable
 * without a visible caption. The default variant is `ghost`, not `primary`:
 * these are affordances (close, refresh, prev/next), not primary actions.
 */
export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  loading = false,
  className,
  disabled,
  ...rest
}: IconButtonProps) {
  return (
    <Button
      {...rest}
      variant={variant}
      size={size}
      loading={loading}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(BOX_SIZES[size], className)}
    >
      <Icon name={icon} className={ICON_SIZES[size]} />
    </Button>
  );
}
