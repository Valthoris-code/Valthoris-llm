import React from 'react';

interface Props {
  icon?: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}

/** Neutral placeholder shown when a list or module has no data yet. */
export default function EmptyState({ icon = '📭', title, body, action }: Props) {
  return (
    <div className="empty-state" role="status">
      <div aria-hidden="true" className="empty-state-icon">
        {icon}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {body && <p className="empty-state-body">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
