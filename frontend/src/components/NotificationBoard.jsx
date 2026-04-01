/**
 * Notification Board Component
 * Shared notification UI for all portals
 */
import { useState, useEffect } from 'react';
import api from '../utils/api';

const PRIORITY_STYLES = {
  urgent: { background: 'var(--ruby-dim)', border: '1px solid rgba(179,73,73,0.3)', color: 'var(--ruby-light)' },
  normal: { background: 'var(--parchment-dim)', border: '1px solid var(--parchment-border)', color: 'var(--parchment)' },
};

const TYPE_ICONS = {
  due_reminder: '⏰',
  auto_return: '↩️',
  book_deleted: '🗑️',
  announcement: '📢',
  approval: '✓',
  rejection: '✕',
  new_submission: '📥',
  user_update: '👤',
};

export default function NotificationBoard({ categories, filter, onFilterChange, showArchived, onShowArchivedChange }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadNotifications(); }, [filter, showArchived]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.category) params.set('category', filter.category);
      if (filter.priority) params.set('priority', filter.priority);
      if (filter.search) params.set('search', filter.search);
      if (showArchived) params.set('is_archived', '1');
      const { data } = await api.get(`/notifications?${params}`);
      setNotifications(data);
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id) => {
    await api.patch(`/notifications/${id}/read`);
    loadNotifications();
  };

  const markAllRead = async () => {
    await api.patch('/notifications/read-all');
    loadNotifications();
  };

  const archiveNotification = async (id) => {
    await api.patch(`/notifications/${id}/archive`);
    loadNotifications();
  };

  const deleteNotification = async (id) => {
    await api.delete(`/notifications/${id}`);
    loadNotifications();
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Notifications</h2>
        <p className="page-subtitle">
          {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up'}
        </p>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <input className="form-input" placeholder="Search notifications…"
          value={filter.search} onChange={e => onFilterChange(f => ({ ...f, search: e.target.value }))} />
        {categories && (
          <select className="form-select" value={filter.category}
            onChange={e => onFilterChange(f => ({ ...f, category: e.target.value }))} style={{ flex: '0 0 160px' }}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        )}
        <select className="form-select" value={filter.priority}
          onChange={e => onFilterChange(f => ({ ...f, priority: e.target.value }))} style={{ flex: '0 0 140px' }}>
          <option value="">All Priority</option>
          <option value="urgent">Urgent</option>
          <option value="normal">Normal</option>
        </select>
        <button className={`btn btn-sm ${showArchived ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => onShowArchivedChange(!showArchived)}>
          {showArchived ? 'Showing Archived' : 'Show Archived'}
        </button>
        {unreadCount > 0 && (
          <button className="btn btn-sm btn-secondary" onClick={markAllRead}>
            Mark All Read
          </button>
        )}
      </div>

      {/* Notifications List */}
      {loading ? (
        <div className="empty-state"><div className="spinner" /></div>
      ) : notifications.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔔</div>
          <h3>No notifications</h3>
          <p>{showArchived ? 'No archived notifications' : 'You\'re all caught up!'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notifications.map(n => {
            const priorityStyle = PRIORITY_STYLES[n.priority] || PRIORITY_STYLES.normal;
            return (
              <div key={n.id} style={{
                ...priorityStyle,
                padding: '14px 18px',
                borderRadius: 'var(--radius-lg)',
                opacity: n.is_read ? 0.7 : 1,
                display: 'flex', gap: 14, alignItems: 'flex-start',
                position: 'relative'
              }}>
                <div style={{ fontSize: '1.3rem', flexShrink: 0, marginTop: 2 }}>
                  {TYPE_ICONS[n.type] || '🔔'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                      {n.title}
                      {!n.is_read && <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: 'var(--gold)', marginLeft: 8, verticalAlign: 'middle'
                      }} />}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--slate)', whiteSpace: 'nowrap', marginLeft: 12 }}>
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.88rem', margin: 0, lineHeight: 1.5 }}>{n.message}</p>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    {n.priority === 'urgent' && (
                      <span className="badge badge-unavailable" style={{ fontSize: '0.68rem' }}>URGENT</span>
                    )}
                    <span className="badge badge-genre" style={{ fontSize: '0.68rem' }}>{n.category}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                  {!n.is_read && (
                    <button className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                      onClick={() => markRead(n.id)}>Read</button>
                  )}
                  {!n.is_archived && (
                    <button className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                      onClick={() => archiveNotification(n.id)}>Archive</button>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', fontSize: '0.72rem', color: 'var(--ruby-light)' }}
                    onClick={() => deleteNotification(n.id)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
