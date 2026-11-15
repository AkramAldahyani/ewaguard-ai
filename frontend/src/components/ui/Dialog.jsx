import { useEffect, useId, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button, IconButton } from './index.jsx';

export function Modal({ open, onClose, title, description, children, footer }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className="ui-dialog"
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-slate-950">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1 text-sm leading-6 text-slate-500">
              {description}
            </p>
          )}
        </div>
        <IconButton label="Close dialog" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>
      <div className="px-6 py-5">{children}</div>
      {footer && (
        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">{footer}</div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirm action',
  description,
  confirmLabel = 'Confirm',
  danger = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4 rounded-xl bg-warning-50 p-4 text-warning-900">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p className="text-sm leading-6">
          Review the impact before continuing. Confirmation controls are ready for future workflows.
        </p>
      </div>
    </Modal>
  );
}
