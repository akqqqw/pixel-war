import type { ReactNode } from 'react';

interface PanelProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  scroll?: boolean;
}

export function Panel({ title, actions, children, className, bodyClassName, scroll }: PanelProps) {
  return (
    <section className={`panel ${className ?? ''}`}>
      {title !== undefined && (
        <header className="panel__head">
          <span>{title}</span>
          {actions}
        </header>
      )}
      <div className={`panel__body ${scroll ? 'side-scroll' : ''} ${bodyClassName ?? ''}`}>{children}</div>
    </section>
  );
}
