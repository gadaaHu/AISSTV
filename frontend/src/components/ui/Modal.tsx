import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { IconButton } from "./IconButton";

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-3xl",
} as const;

/**
 * A modal built on the native `<dialog>` element.
 *
 * The browser supplies what is hard to get right by hand: modality (the rest of
 * the page becomes inert), focus trapping, focus restoration on close, and the
 * `::backdrop`. React state stays the single source of truth — the effect calls
 * `showModal()`/`close()` to match `open`, and the listeners only report back
 * through `onClose`:
 *
 * - `cancel` (Escape) is intercepted and forwarded to `onClose`, so Escape
 *   cannot desynchronise the element from the `open` prop.
 * - a `close` we triggered ourselves is ignored, so `onClose` is never called
 *   twice for one dismissal.
 * - a click closes the dialog only when it both started and ended on the dialog
 *   element itself (i.e. the backdrop), never when a drag inside the panel
 *   happens to release over it.
 *
 * `title` is required and is used as the dialog's accessible name
 * (`aria-labelledby`).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  // Set while the effect below closes the dialog, so the resulting native
  // `close` event does not bounce back to `onClose` a second time.
  const closingFromProps = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      // Guarded: `showModal()` on an already-open dialog throws.
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      closingFromProps.current = true;
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    let pointerDownOnBackdrop = false;

    const handleClose = () => {
      if (closingFromProps.current) {
        closingFromProps.current = false;
        return;
      }
      onClose();
    };

    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };

    const handlePointerDown = (event: PointerEvent) => {
      pointerDownOnBackdrop = event.target === dialog;
    };

    const handleClick = (event: MouseEvent) => {
      const onBackdrop = pointerDownOnBackdrop && event.target === dialog;
      pointerDownOnBackdrop = false;
      if (onBackdrop) onClose();
    };

    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("pointerdown", handlePointerDown);
    dialog.addEventListener("click", handleClick);

    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("pointerdown", handlePointerDown);
      dialog.removeEventListener("click", handleClick);
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        // `m-auto` centres it; the browser keeps handling show/hide for us, so
        // no `display` is set here.
        "m-auto w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100",
        SIZES[size],
      )}
    >
      <div className="flex flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              {title}
            </h2>
            {description ? (
              <p
                id={descriptionId}
                className="mt-0.5 text-xs text-slate-500 dark:text-slate-400"
              >
                {description}
              </p>
            ) : null}
          </div>
          <IconButton
            icon="close"
            label="Close dialog"
            size="sm"
            onClick={onClose}
          />
        </header>

        {children ? (
          <div className="max-h-[80vh] overflow-y-auto px-4 py-4">{children}</div>
        ) : null}

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
