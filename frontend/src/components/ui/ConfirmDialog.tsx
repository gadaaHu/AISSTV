import type { ReactNode } from "react";

import { Button } from "./Button";
import { Modal } from "./Modal";

/**
 * A yes/no confirmation over `Modal`.
 *
 * `loading` disables both actions (and spins the confirm button), so a
 * destructive request in flight cannot be fired twice or cancelled halfway.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  loading = false,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={onClose}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            size="sm"
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
