import type { ReactNode } from 'react';

interface ModalProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  size?: 'small' | 'medium';
}

export function Modal({ title, children, footer, onClose, size = 'medium' }: ModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__head">
          <h2>{title}</h2>
          {onClose && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Закрыть">
              ✕
            </button>
          )}
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}
