import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Sheet({ title, onClose, children, tall }: { title?: string; onClose: () => void; children: ReactNode; tall?: boolean }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={'sheet' + (tall ? ' sheet-tall' : '')} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {title && <h2 className="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** In-app confirmation (the browser's confirm() is blocked in installed web apps on some phones). */
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
  extra,
}: {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  extra?: ReactNode;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      {body && <p className="dim" style={{ margin: '0 0 16px', lineHeight: 1.45 }}>{body}</p>}
      <div className="stack">
        <button className={'btn btn-block btn-lg ' + (danger ? 'btn-danger-solid' : 'btn-primary')} onClick={onConfirm}>
          {confirmLabel}
        </button>
        {extra}
        <button className="btn btn-block btn-lg" onClick={onClose}>
          Keep going
        </button>
      </div>
    </Sheet>
  );
}
