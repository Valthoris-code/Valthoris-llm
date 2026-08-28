import React, { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  title: string;
  /** When false the dialog cannot be dismissed (used by the consent gate). */
  dismissible?: boolean;
  onClose?: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /**
   * Preferred panel width in px. It is published as the `--modal-width` custom
   * property and clamped against the viewport in CSS: a fixed px width is
   * unsafe in an installed PWA, where it could exceed the standalone viewport.
   */
  width?: number;
}

/** Accessible dialog: focus trap, Escape handling and scroll lock. */
export default function Modal({
  open,
  title,
  dismissible = true,
  onClose,
  footer,
  children,
  width = 560,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation">
      <div
        ref={panelRef}
        className="modal-panel glass"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ ['--modal-width' as string]: `${width}px` } as React.CSSProperties}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          {dismissible && (
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">
              ✕
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
