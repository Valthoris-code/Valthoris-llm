import React, { useState } from 'react';

interface Notification {
  id: string;
  type: 'threat' | 'info' | 'success' | 'warning';
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  { id: '1', type: 'threat',  title: 'New Threat Detected',     body: 'A new phishing campaign targeting banking users has been detected in your region.', time: '2 min ago', read: false },
  { id: '2', type: 'warning', title: 'Community Report Update',  body: 'A report you voted on has been confirmed as a threat. +10 reputation points.', time: '1 hr ago',  read: false },
  { id: '3', type: 'info',    title: 'Scanner Result Ready',     body: 'Your scheduled scan of domain "example.com" is complete. View results.', time: '3 hr ago',  read: true  },
  { id: '4', type: 'success', title: 'Profile Updated',          body: 'Your security profile has been updated successfully on the Internet Computer.', time: '1 day ago', read: true  },
];

const TYPE_ICON: Record<Notification['type'], string> = {
  threat: '🚨', info: 'ℹ️', success: '✅', warning: '⚠',
};
const TYPE_COLOR: Record<Notification['type'], string> = {
  threat: 'var(--accent-red)', info: 'var(--accent-cyan)', success: 'var(--accent-green)', warning: 'var(--accent-amber)',
};

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const markAllRead = () => setNotifications(n => n.map(x => ({ ...x, read: true })));
  const markRead = (id: string) => setNotifications(n => n.map(x => x.id === id ? { ...x, read: true } : x));

  const filtered = filter === 'unread' ? notifications.filter(n => !n.read) : notifications;
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>🔔 Notifications</h1>
        {unreadCount > 0 && (
          <span className="badge badge-red">{unreadCount} new</span>
        )}
        <span className="badge-beta" style={{ marginLeft: 'auto' }}>BETA</span>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1.25rem' }}>
        {(['all', 'unread'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? 'rgba(0,212,255,0.12)' : 'none',
              border: `1px solid ${filter === f ? 'var(--accent-cyan)' : 'var(--border)'}`,
              color: filter === f ? 'var(--accent-cyan)' : 'var(--text-muted)',
              borderRadius: 6, padding: '0.3rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            {f === 'all' ? 'All' : `Unread (${unreadCount})`}
          </button>
        ))}
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="btn-secondary" style={{ marginLeft: 'auto', fontSize: '0.82rem', padding: '0.3rem 0.8rem' }}>
            Mark all read
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: 700 }}>
        {filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            No notifications
          </div>
        ) : (
          filtered.map(n => (
            <div
              key={n.id}
              className="card animate-fade-in"
              onClick={() => markRead(n.id)}
              style={{
                display: 'flex',
                gap: '0.75rem',
                cursor: 'pointer',
                opacity: n.read ? 0.65 : 1,
                borderLeft: n.read ? '3px solid var(--border)' : `3px solid ${TYPE_COLOR[n.type]}`,
              }}
            >
              <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{TYPE_ICON[n.type]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: n.read ? 400 : 700, fontSize: '0.92rem', marginBottom: 2 }}>{n.title}</div>
                <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>{n.body}</div>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>{n.time}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
