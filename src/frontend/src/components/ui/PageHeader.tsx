import React from 'react';

interface Props {
  icon?: string;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

/** Consistent page heading used across every VALTHORIS module. */
export default function PageHeader({ icon, title, subtitle, badge, actions }: Props) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        <h1 className="page-header-title">
          {icon && (
            <span aria-hidden="true" className="page-header-icon">
              {icon}
            </span>
          )}
          {title}
        </h1>
        {badge}
      </div>
      {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
