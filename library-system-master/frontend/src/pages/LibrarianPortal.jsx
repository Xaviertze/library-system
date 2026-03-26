/**
 * Librarian Portal
 * Review, approve, reject book submissions with filtering and bulk actions
 */
import { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../utils/api';

const NAV_ITEMS = [
  { id: 'pending', label: 'Pending Submissions', icon: '⏳' },
  { id: 'all', label: 'All Submissions', icon: '📋' },
];

export default function LibrarianPortal() {
  const [activeTab, setActiveTab] = useState('pending');
  const [books, setBooks] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [filters, setFilters] = useState({ title: '', author: '', genre: '', status: '', date_from: '', date_to: '' });

  useEffect(() => { loadBooks(); }, [activeTab, filters]);

  const loadBooks = async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
      if (activeTab === 'pending') params.set('status', 'pending');
      const { data } = await api.get(`/books/pending?${params}`);
      setBooks(data);
    } finally {
      setLoading(false);
    }
  };

  const setFilter = (key) => (e) => setFilters(f => ({ ...f, [key]: e.target.value }));

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pendingIds = books.filter(b => b.status === 'pending').map(b => b.id);
    if (selected.size === pendingIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingIds));
    }
  };

  const openConfirm = (action, ids) => {
    setConfirmDialog({ action, ids: ids || [...selected] });
  };

  const executeAction = async () => {
    if (!confirmDialog) return;
    setActionLoading(true);
    try {
      const { action, ids } = confirmDialog;
      if (ids.length === 1) {
        await api.patch(`/books/${ids[0]}/${action}`);
      } else {
        await api.post('/books/bulk-action', { book_ids: ids, action });
      }
      setFeedback(`✓ ${ids.length} book(s) ${action}d successfully`);
      setTimeout(() => setFeedback(''), 4000);
      setConfirmDialog(null);
      loadBooks();
    } catch (err) {
      setFeedback('⚠ Action failed: ' + (err.response?.data?.error || 'Unknown error'));
    } finally {
      setActionLoading(false);
    }
  };

  const pendingIds = books.filter(b => b.status === 'pending').map(b => b.id);
  const allPendingSelected = pendingIds.length > 0 && selected.size === pendingIds.length;

  const statusBadge = (status) => {
    const map = {
      pending: <span className="badge badge-pending">⏳ Pending</span>,
      approved: <span className="badge badge-available">✓ Approved</span>,
      rejected: <span className="badge badge-unavailable">✕ Rejected</span>,
    };
    return map[status] || <span className="badge badge-genre">{status}</span>;
  };

  return (
    <div className="app-layout">
      <Sidebar navItems={NAV_ITEMS} activeTab={activeTab} onTabChange={t => { setActiveTab(t); setFilters({ title: '', author: '', genre: '', status: '', date_from: '', date_to: '' }); }} />

      <main className="main-content">
        <div className="page-header">
          <h2 className="page-title">
            {activeTab === 'pending' ? 'Pending Submissions' : 'All Submissions'}
          </h2>
          <p className="page-subtitle">
            {activeTab === 'pending'
              ? `${books.length} book${books.length !== 1 ? 's' : ''} awaiting review`
              : 'Complete submission history'}
          </p>
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`alert ${feedback.startsWith('✓') ? 'alert-success' : 'alert-error'} mb-4`}>
            {feedback}
          </div>
        )}

        {/* Stats (pending tab) */}
        {activeTab === 'pending' && (
          <div className="stats-row" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-value">{books.filter(b => b.status === 'pending').length}</div>
              <div className="stat-label">Awaiting Review</div>
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="filter-bar">
          <input className="form-input" placeholder="🔍 Search title…" value={filters.title} onChange={setFilter('title')} />
          <input className="form-input" placeholder="👤 Author…" value={filters.author} onChange={setFilter('author')} />
          <input className="form-input" placeholder="🏷️ Genre…" value={filters.genre} onChange={setFilter('genre')} />
          {activeTab === 'all' && (
            <select className="form-select" value={filters.status} onChange={setFilter('status')} style={{ flex: '0 0 140px' }}>
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          )}
          <input className="form-input" type="date" value={filters.date_from} onChange={setFilter('date_from')} style={{ flex: '0 0 150px' }} title="From date" />
          <input className="form-input" type="date" value={filters.date_to} onChange={setFilter('date_to')} style={{ flex: '0 0 150px' }} title="To date" />
          <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ title: '', author: '', genre: '', status: '', date_from: '', date_to: '' })}>
            Reset
          </button>
        </div>

        {/* Bulk Actions Bar */}
        {selected.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px',
            background: 'var(--gold-dim)',
            border: '1px solid var(--gold-border)',
            borderRadius: 'var(--radius)',
            marginBottom: 16
          }}>
            <span style={{ color: 'var(--gold-light)', fontSize: '0.9rem', fontWeight: 500 }}>
              {selected.size} book{selected.size !== 1 ? 's' : ''} selected
            </span>
            <button className="btn btn-success btn-sm" onClick={() => openConfirm('approve')}>
              ✓ Approve Selected
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => openConfirm('reject')}>
              ✕ Reject Selected
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
              Cancel
            </button>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="empty-state"><div className="spinner" /></div>
        ) : books.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3>No submissions found</h3>
            <p>Adjust your filters or check back later</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={allPendingSelected}
                      onChange={toggleSelectAll}
                      title="Select all pending"
                    />
                  </th>
                  <th>Title</th>
                  <th>Author</th>
                  <th>Genre</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {books.map(book => (
                  <tr key={book.id}>
                    <td>
                      {book.status === 'pending' && (
                        <input
                          type="checkbox"
                          checked={selected.has(book.id)}
                          onChange={() => toggleSelect(book.id)}
                        />
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--parchment)' }}>{book.title}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--slate)', marginTop: 2 }}>
                        {book.description?.substring(0, 60)}…
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{book.author_name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--slate)' }}>@{book.author_username}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {book.genre?.split(',').slice(0, 2).map(g => (
                          <span key={g} className="badge badge-genre">{g.trim()}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--slate)' }}>
                      {new Date(book.submitted_date).toLocaleDateString()}
                    </td>
                    <td>{statusBadge(book.status)}</td>
                    <td>
                      {book.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => openConfirm('approve', [book.id])}
                          >
                            ✓ Approve
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => openConfirm('reject', [book.id])}
                          >
                            ✕ Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--slate)', fontSize: '0.82rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDialog(null)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
                Confirm {confirmDialog.action === 'approve' ? 'Approval' : 'Rejection'}
              </h3>
              <button className="modal-close" onClick={() => setConfirmDialog(null)}>✕</button>
            </div>

            <div className={`alert ${confirmDialog.action === 'approve' ? 'alert-success' : 'alert-error'} mb-4`}>
              {confirmDialog.action === 'approve'
                ? `✓ You are about to approve ${confirmDialog.ids.length} book submission${confirmDialog.ids.length !== 1 ? 's' : ''}. They will be published and made available to all users.`
                : `⚠ You are about to reject ${confirmDialog.ids.length} book submission${confirmDialog.ids.length !== 1 ? 's' : ''}. This cannot be undone.`}
            </div>

            {/* List affected books */}
            <div style={{ background: 'var(--ink-3)', borderRadius: 8, padding: 12, marginBottom: 20, maxHeight: 150, overflowY: 'auto' }}>
              {books.filter(b => confirmDialog.ids.includes(b.id)).map(b => (
                <div key={b.id} style={{ padding: '4px 0', fontSize: '0.88rem', color: 'var(--parchment)', borderBottom: '1px solid var(--parchment-border)', marginBottom: 4 }}>
                  <strong>{b.title}</strong> <span style={{ color: 'var(--slate)' }}>by {b.author_name}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button className="btn btn-ghost" onClick={() => setConfirmDialog(null)} disabled={actionLoading}>
                Cancel
              </button>
              <button
                className={`btn ${confirmDialog.action === 'approve' ? 'btn-success' : 'btn-danger'}`}
                style={{ flex: 1 }}
                onClick={executeAction}
                disabled={actionLoading}
              >
                {actionLoading
                  ? 'Processing…'
                  : confirmDialog.action === 'approve'
                  ? '✓ Confirm Approval'
                  : '✕ Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
