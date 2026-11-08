import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const BACKDROP = 0.45;
const OUT_MS = 200;

/**
 * Bottom sheet. Closes on a tap outside, Escape, or a downward swipe (when its content is scrolled to the top).
 */
export function Sheet({ title, onClose, children, tall }: { title?: string; onClose: () => void; children: ReactNode; tall?: boolean }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const leaving = useRef(false);

  /** Slide the sheet off the bottom, then close. */
  const dismiss = () => {
    const el = sheetRef.current;
    const back = backRef.current;
    if (leaving.current) return;
    leaving.current = true;
    if (!el || !back) return closeRef.current();
    el.style.transition = `transform ${OUT_MS}ms ease-in`;
    el.style.transform = 'translateY(100%)';
    back.style.transition = `background-color ${OUT_MS}ms`;
    back.style.backgroundColor = 'rgb(0 0 0 / 0)';
    setTimeout(() => closeRef.current(), OUT_MS);
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Swipe down to close. Touch events (not pointer events) so the sheet can still scroll normally.
  useEffect(() => {
    const el = sheetRef.current;
    const back = backRef.current;
    if (!el || !back) return;
    let x0 = 0;
    let y0 = 0;
    let t0 = 0;
    let dy = 0;
    let atTop = false;
    let mode: 'drag' | 'scroll' | null = null;

    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1 || leaving.current) return;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      t0 = e.timeStamp;
      dy = 0;
      atTop = el.scrollTop <= 0;
      mode = null;
    };
    const move = (e: TouchEvent) => {
      if (mode === 'scroll' || e.touches.length !== 1) return;
      const ddx = e.touches[0].clientX - x0;
      const ddy = e.touches[0].clientY - y0;
      if (mode === null) {
        if (Math.abs(ddx) < 6 && Math.abs(ddy) < 6) return;
        mode = atTop && ddy > 0 && Math.abs(ddy) > Math.abs(ddx) ? 'drag' : 'scroll';
        if (mode === 'scroll') return;
        el.style.transition = 'none';
        back.style.transition = 'none';
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      e.preventDefault();
      dy = Math.max(0, ddy);
      el.style.transform = `translateY(${dy}px)`;
      const p = Math.min(1, dy / el.offsetHeight);
      back.style.backgroundColor = `rgb(0 0 0 / ${BACKDROP * (1 - p)})`;
    };
    const end = (e: TouchEvent) => {
      if (mode !== 'drag') return;
      mode = null;
      const speed = dy / Math.max(1, e.timeStamp - t0); // px per ms
      if (dy > Math.min(120, el.offsetHeight * 0.3) || (speed > 0.5 && dy > 30)) return dismissRef.current();
      el.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)';
      el.style.transform = '';
      back.style.transition = 'background-color 0.25s';
      back.style.backgroundColor = '';
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, []);

  return createPortal(
    <div className="sheet-backdrop" ref={backRef} onClick={() => dismissRef.current()}>
      <div
        ref={sheetRef}
        className={'sheet' + (tall ? ' sheet-tall' : '')}
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
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
