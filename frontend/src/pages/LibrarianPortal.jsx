/**
 * Librarian Portal
 * Review, approve, reject book submissions with filtering and bulk actions
 * Extended: user management, borrow records, profile, notifications, rejection reasons, preview
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import NotificationBoard from '../components/NotificationBoard';
import ProfileEditor from '../components/ProfileEditor';
import { useCrashRecovery, CrashTestButton } from '../components/CrashRecovery';
import { useRecovery } from '../App';
import api from '../utils/api';

const NAV_ITEMS = [
  { id: 'pending', label: 'Pending Submissions', icon: '⏳' },
  { id: 'all', label: 'All Submissions', icon: '📋' },
  { id: 'users', label: 'Manage Users', icon: '👥' },
  { id: 'borrow-records', label: 'Borrow Records', icon: '📚' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'profile', label: 'My Profile', icon: '👤' },
];

/**
 * Book Preview Modal — fetches file with auth token then displays via blob URL
 */
function BookPreviewModal({ book, onClose }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let url;
    (async () => {
      try {
        const response = await api.get(`/books/preview/${book.id}`, { responseType: 'blob' });
        url = URL.createObjectURL(response.data);
        setBlobUrl(url);
      } catch {}
      setLoading(false);
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [book.id]);

  const isPdf = book.file_name?.toLowerCase().endsWith('.pdf');

  const handleDownload = async () => {
    try {
      const response = await api.get(`/books/download/${book.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = book.file_name || 'book';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {}
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 900, width: '90vw', height: '80vh', padding: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--parchment-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', margin: 0 }}>
              Preview: {book.title}
            </h3>
            <span style={{ fontSize: '0.82rem', color: 'var(--slate)' }}>by {book.author_name}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={handleDownload}>Download</button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div className="spinner" />
            </div>
          ) : blobUrl && isPdf ? (
            <iframe src={blobUrl}
              style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
              title="Book preview" />
          ) : (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ color: 'var(--slate)' }}>
                {blobUrl ? 'This file format cannot be previewed in-browser.' : 'Failed to load the file.'}
              </p>
              {blobUrl && (
                <a href={blobUrl} download={book.file_name} className="btn btn-primary">
                  Download File
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LibrarianPortal() {
  const { recoveryState, clearRecoveryState } = useRecovery();
  const [activeTab, setActiveTab] = useState(() => recoveryState?.screen || 'pending');
  const [books, setBooks] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [filters, setFilters] = useState({ title: '', author: '', genre: '', status: '', date_from: '', date_to: '' });
  const [unreadCount, setUnreadCount] = useState(0);

  // Rejection reason
  const [rejectionReason, setRejectionReason] = useState('');

  // Preview
  const [previewingBook, setPreviewingBook] = useState(null);

  // User management state
  const [users, setUsers] = useState([]);
  const [userFilter, setUserFilter] = useState({ role: '', search: '' });
  const [userDialog, setUserDialog] = useState(null); // 'add' | 'edit' | null
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ username: '', full_name: '', password: '', role: 'student', bio: '', employee_id: '' });
  const [userErrors, setUserErrors] = useState({});
  const [userLoading, setUserLoading] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);

  // Borrow records state
  const [borrowRecords, setBorrowRecords] = useState([]);
  const [borrowFilters, setBorrowFilters] = useState({ search: '', status: '', date_from: '', date_to: '' });
  const [borrowLoading, setBorrowLoading] = useState(false);

  // Clear recovery state after it has been consumed
  useEffect(() => {
    if (recoveryState) clearRecoveryState();
  }, []);

  // Crash recovery
  useCrashRecovery('librarian', activeTab);

  useEffect(() => {
    if (['pending', 'all'].includes(activeTab)) loadBooks();
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'borrow-records') loadBorrowRecords();
    loadUnreadCount();
  }, [activeTab, filters, userFilter, borrowFilters]);

  const loadUnreadCount = async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      setUnreadCount(data.count);
    } catch {}
  };

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

  const loadUsers = async () => {
    setUserLoading(true);
    try {
      const params = new URLSearchParams();
      if (userFilter.role) params.set('role', userFilter.role);
      if (userFilter.search) params.set('search', userFilter.search);
      const { data } = await api.get(`/users?${params}`);
      setUsers(data);
    } finally {
      setUserLoading(false);
    }
  };

  const loadBorrowRecords = async () => {
    setBorrowLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(borrowFilters).forEach(([k, v]) => { if (v) params.append(k, v); });
      const { data } = await api.get(`/books/borrow-records?${params}`);
      setBorrowRecords(data);
    } finally {
      setBorrowLoading(false);
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
    setRejectionReason('');
  };

  const executeAction = async () => {
    if (!confirmDialog) return;
    setActionLoading(true);
    try {
      const { action, ids } = confirmDialog;
      if (ids.length === 1) {
        if (action === 'reject') {
          await api.patch(`/books/${ids[0]}/reject`, { reason: rejectionReason || undefined });
        } else {
          await api.patch(`/books/${ids[0]}/approve`);
        }
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

  // User management handlers
  const openAddUser = () => {
    setUserForm({ username: '', full_name: '', password: '', role: 'student', bio: '', employee_id: '' });
    setUserErrors({});
    setUserDialog('add');
    setEditingUser(null);
  };

  const openEditUser = (u) => {
    setEditingUser(u);
    setUserForm({ username: u.username, full_name: u.full_name, password: '', role: u.role, bio: u.bio || '', employee_id: u.employee_id || '' });
    setUserErrors({});
    setUserDialog('edit');
  };

  const handleSaveUser = async () => {
    setUserErrors({});
    setActionLoading(true);
    try {
      if (userDialog === 'add') {
        await api.post('/users', userForm);
        setFeedback('✓ User created successfully');
      } else {
        await api.put(`/users/${editingUser.id}`, {
          full_name: userForm.full_name,
          role: userForm.role,
          bio: userForm.bio,
          employee_id: userForm.employee_id
        });
        setFeedback('✓ User updated successfully');
      }
      setUserDialog(null);
      loadUsers();
      setTimeout(() => setFeedback(''), 3000);
    } catch (err) {
      if (err.response?.data?.errors) {
        setUserErrors(err.response.data.errors);
      } else {
        setFeedback('⚠ ' + (err.response?.data?.error || 'Operation failed'));
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeactivateUser = async (userId) => {
    try {
      const { data } = await api.patch(`/users/${userId}/deactivate`);
      setFeedback(`✓ ${data.message}`);
      setConfirmDeactivate(null);
      loadUsers();
      setTimeout(() => setFeedback(''), 3000);
    } catch (err) {
      setFeedback('⚠ ' + (err.response?.data?.error || 'Failed'));
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await api.get('/books/borrow-records/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'borrow_records.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setFeedback('⚠ Export failed');
    }
  };

  const pendingIds = books.filter(b => b.status === 'pending').map(b => b.id);
  const allPendingSelected = pendingIds.length > 0 && selected.size === pendingIds.length;

  const handleApproveDelete = async (bookId) => {
    setActionLoading(true);
    try {
      await api.patch(`/books/${bookId}/approve-delete`);
      setFeedback('✓ Book deletion approved');
      loadBooks();
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      setFeedback('⚠ ' + (err.response?.data?.error || 'Failed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectDelete = async (bookId) => {
    setActionLoading(true);
    try {
      await api.patch(`/books/${bookId}/reject-delete`);
      setFeedback('✓ Deletion request rejected, book restored');
      loadBooks();
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      setFeedback('⚠ ' + (err.response?.data?.error || 'Failed'));
    } finally {
      setActionLoading(false);
    }
  };

  const statusBadge = (status) => {
    const map = {
      pending: <span className="badge badge-pending">⏳ Pending</span>,
      approved: <span className="badge badge-available">✓ Approved</span>,
      rejected: <span className="badge badge-unavailable">✕ Rejected</span>,
      pending_deletion: <span className="badge badge-unavailable">🗑 Pending Deletion</span>,
    };
    return map[status] || <span className="badge badge-genre">{status}</span>;
  };

  const crashSave = useCallback(async () => {
    try {
      await api.post('/recovery/save', { screen: activeTab, portal: 'librarian', state_data: {} });
    } catch {}
  }, [activeTab]);

  const navItemsWithBadge = NAV_ITEMS.map(item => {
    if (item.id === 'notifications' && unreadCount > 0) {
      return { ...item, label: `Notifications (${unreadCount})` };
    }
    return item;
  });

  return (
    <div className="app-layout">
      <Sidebar navItems={navItemsWithBadge} activeTab={activeTab} onTabChange={t => { setActiveTab(t); if (['pending','all'].includes(t)) setFilters({ title: '', author: '', genre: '', status: '', date_from: '', date_to: '' }); }} />

      <main className="main-content">
        {/* Crash Test */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <CrashTestButton onBeforeCrash={crashSave} />
        </div>

        {/* ========== SUBMISSIONS TABS ========== */}
        {['pending', 'all'].includes(activeTab) && (
          <>
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

            {feedback && (
              <div className={`alert ${feedback.startsWith('✓') ? 'alert-success' : 'alert-error'} mb-4`}>
                {feedback}
              </div>
            )}

            {activeTab === 'pending' && (
              <div className="stats-row" style={{ marginBottom: 24 }}>
                <div className="stat-card">
                  <div className="stat-value">{books.filter(b => b.status === 'pending').length}</div>
                  <div className="stat-label">Awaiting Review</div>
                </div>
              </div>
            )}

            <div className="filter-bar">
              <input className="form-input" placeholder="Search title…" value={filters.title} onChange={setFilter('title')} />
              <input className="form-input" placeholder="Author…" value={filters.author} onChange={setFilter('author')} />
              <input className="form-input" placeholder="Genre…" value={filters.genre} onChange={setFilter('genre')} />
              {activeTab === 'all' && (
                <select className="form-select" value={filters.status} onChange={setFilter('status')} style={{ flex: '0 0 140px' }}>
                  <option value="">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="pending_deletion">Pending Deletion</option>
                </select>
              )}
              <input className="form-input" type="date" value={filters.date_from} onChange={setFilter('date_from')} style={{ flex: '0 0 150px' }} title="From date" />
              <input className="form-input" type="date" value={filters.date_to} onChange={setFilter('date_to')} style={{ flex: '0 0 150px' }} title="To date" />
              <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ title: '', author: '', genre: '', status: '', date_from: '', date_to: '' })}>
                Reset
              </button>
            </div>

            {selected.size > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', background: 'var(--gold-dim)',
                border: '1px solid var(--gold-border)', borderRadius: 'var(--radius)', marginBottom: 16
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
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '4px' }}>
                          <input type="checkbox" checked={allPendingSelected} onChange={toggleSelectAll} title="Select all pending" style={{ width: 18, height: 18 }} />
                        </label>
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
                        <td onClick={() => book.status === 'pending' && toggleSelect(book.id)} style={{ cursor: book.status === 'pending' ? 'pointer' : 'default' }}>
                          {book.status === 'pending' && (
                            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '4px' }}>
                              <input type="checkbox" checked={selected.has(book.id)} onChange={() => toggleSelect(book.id)} style={{ width: 18, height: 18 }} />
                            </label>
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
                          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                            {book.file_name && (
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => setPreviewingBook(book)}>
                                Preview
                              </button>
                            )}
                            {book.status === 'pending' && (
                              <>
                                <button className="btn btn-success btn-sm" onClick={() => openConfirm('approve', [book.id])}>
                                  ✓ Approve
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={() => openConfirm('reject', [book.id])}>
                                  ✕ Reject
                                </button>
                              </>
                            )}
                            {book.status === 'pending_deletion' && (
                              <>
                                <button className="btn btn-danger btn-sm" onClick={() => handleApproveDelete(book.id)}
                                  disabled={actionLoading}>
                                  ✓ Approve Delete
                                </button>
                                <button className="btn btn-ghost btn-sm" onClick={() => handleRejectDelete(book.id)}
                                  disabled={actionLoading}>
                                  ✕ Keep Book
                                </button>
                              </>
                            )}
                            {!['pending', 'pending_deletion'].includes(book.status) && !book.file_name && (
                              <span style={{ color: 'var(--slate)', fontSize: '0.82rem' }}>—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ========== USER MANAGEMENT ========== */}
        {activeTab === 'users' && (
          <>
            <div className="page-header">
              <h2 className="page-title">Manage Users</h2>
              <p className="page-subtitle">{users.length} user{users.length !== 1 ? 's' : ''} in the system</p>
            </div>

            {feedback && (
              <div className={`alert ${feedback.startsWith('✓') ? 'alert-success' : 'alert-error'} mb-4`}>{feedback}</div>
            )}

            <div className="filter-bar">
              <input className="form-input" placeholder="Search by name or username…"
                value={userFilter.search} onChange={e => setUserFilter(f => ({ ...f, search: e.target.value }))} />
              <select className="form-select" value={userFilter.role}
                onChange={e => setUserFilter(f => ({ ...f, role: e.target.value }))} style={{ flex: '0 0 150px' }}>
                <option value="">All Roles</option>
                <option value="student">Student</option>
                <option value="staff">Staff</option>
                <option value="author">Author</option>
                <option value="librarian">Librarian</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={openAddUser}>+ Add User</button>
            </div>

            {userLoading ? (
              <div className="empty-state"><div className="spinner" /></div>
            ) : users.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">👥</div>
                <h3>No users found</h3>
                <p>Adjust filters or add a new user</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Full Name</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Joined</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} style={{ opacity: u.active === 0 ? 0.5 : 1 }}>
                        <td style={{ fontWeight: 500, color: 'var(--parchment)' }}>@{u.username}</td>
                        <td>{u.full_name}</td>
                        <td><span className="badge badge-genre" style={{ textTransform: 'capitalize' }}>{u.role}</span></td>
                        <td>
                          <span className={`badge ${u.active !== 0 ? 'badge-available' : 'badge-unavailable'}`}>
                            {u.active !== 0 ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--slate)' }}>
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td>
                          <div className="flex gap-2">
                            <button className="btn btn-ghost btn-sm" onClick={() => openEditUser(u)}>Edit</button>
                            <button className="btn btn-ghost btn-sm"
                              style={{ color: u.active !== 0 ? 'var(--ruby-light)' : 'var(--emerald-light)' }}
                              onClick={() => setConfirmDeactivate(u)}>
                              {u.active !== 0 ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ========== BORROW RECORDS ========== */}
        {activeTab === 'borrow-records' && (
          <>
            <div className="page-header">
              <h2 className="page-title">Borrowed Books Record</h2>
              <p className="page-subtitle">{borrowRecords.length} record{borrowRecords.length !== 1 ? 's' : ''}</p>
            </div>

            <div className="filter-bar">
              <input className="form-input" placeholder="Search book or borrower…"
                value={borrowFilters.search} onChange={e => setBorrowFilters(f => ({ ...f, search: e.target.value }))} />
              <select className="form-select" value={borrowFilters.status}
                onChange={e => setBorrowFilters(f => ({ ...f, status: e.target.value }))} style={{ flex: '0 0 150px' }}>
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="returned">Returned</option>
                <option value="overdue">Overdue</option>
              </select>
              <input className="form-input" type="date" value={borrowFilters.date_from}
                onChange={e => setBorrowFilters(f => ({ ...f, date_from: e.target.value }))} style={{ flex: '0 0 150px' }} title="From" />
              <input className="form-input" type="date" value={borrowFilters.date_to}
                onChange={e => setBorrowFilters(f => ({ ...f, date_to: e.target.value }))} style={{ flex: '0 0 150px' }} title="To" />
              <button className="btn btn-ghost btn-sm"
                onClick={() => setBorrowFilters({ search: '', status: '', date_from: '', date_to: '' })}>Reset</button>
              <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>Export CSV</button>
            </div>

            {borrowLoading ? (
              <div className="empty-state"><div className="spinner" /></div>
            ) : borrowRecords.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📚</div>
                <h3>No borrow records found</h3>
                <p>Adjust your filters</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Book Title</th>
                      <th>Borrower</th>
                      <th>Borrow Date</th>
                      <th>Due Date</th>
                      <th>Return Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {borrowRecords.map(r => {
                      const isOverdue = r.status === 'active' && new Date(r.due_date) < new Date();
                      return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 500, color: 'var(--parchment)' }}>{r.title}</td>
                          <td>
                            <div>{r.borrower_name}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--slate)' }}>@{r.borrower_username}</div>
                          </td>
                          <td style={{ fontSize: '0.85rem' }}>{new Date(r.borrow_date).toLocaleDateString()}</td>
                          <td style={{ fontSize: '0.85rem', color: isOverdue ? 'var(--ruby-light)' : 'inherit' }}>
                            {new Date(r.due_date).toLocaleDateString()}{isOverdue && ' ⚠'}
                          </td>
                          <td style={{ fontSize: '0.85rem' }}>{r.return_date ? new Date(r.return_date).toLocaleDateString() : '—'}</td>
                          <td>
                            <span className={`badge ${
                              r.status === 'returned' ? 'badge-genre' : isOverdue ? 'badge-unavailable' : 'badge-available'
                            }`}>
                              {r.status === 'returned' ? 'Returned' : isOverdue ? 'Overdue' : 'Active'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ========== NOTIFICATIONS ========== */}
        {activeTab === 'notifications' && (
          <NotificationBoard categories={['submissions', 'users', 'general', 'announcement']} />
        )}

        {/* ========== PROFILE ========== */}
        {activeTab === 'profile' && (
          <ProfileEditor showFields={['full_name', 'password', 'employee_id', 'profile_picture']} />
        )}
      </main>

      {/* ===== CONFIRM APPROVE/REJECT DIALOG ===== */}
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

            <div style={{ background: 'var(--ink-3)', borderRadius: 8, padding: 12, marginBottom: 20, maxHeight: 150, overflowY: 'auto' }}>
              {books.filter(b => confirmDialog.ids.includes(b.id)).map(b => (
                <div key={b.id} style={{ padding: '4px 0', fontSize: '0.88rem', color: 'var(--parchment)', borderBottom: '1px solid var(--parchment-border)', marginBottom: 4 }}>
                  <strong>{b.title}</strong> <span style={{ color: 'var(--slate)' }}>by {b.author_name}</span>
                </div>
              ))}
            </div>

            {/* Rejection reason input */}
            {confirmDialog.action === 'reject' && confirmDialog.ids.length === 1 && (
              <div className="form-group mb-4">
                <label className="form-label">Rejection Reason (optional)</label>
                <textarea className="form-textarea" rows={3} placeholder="Provide feedback to the author…"
                  value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} />
              </div>
            )}

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

      {/* ===== USER ADD/EDIT DIALOG ===== */}
      {userDialog && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setUserDialog(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
                {userDialog === 'add' ? 'Add New User' : 'Edit User'}
              </h3>
              <button className="modal-close" onClick={() => setUserDialog(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {userDialog === 'add' && (
                <div className="form-group">
                  <label className="form-label">Username *</label>
                  <input className="form-input" value={userForm.username}
                    onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))} />
                  {userErrors.username && <span className="form-error">⚠ {userErrors.username}</span>}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input className="form-input" value={userForm.full_name}
                  onChange={e => setUserForm(f => ({ ...f, full_name: e.target.value }))} />
                {userErrors.full_name && <span className="form-error">⚠ {userErrors.full_name}</span>}
              </div>
              {userDialog === 'add' && (
                <div className="form-group">
                  <label className="form-label">Password *</label>
                  <input className="form-input" type="password" value={userForm.password}
                    onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} />
                  {userErrors.password && <span className="form-error">⚠ {userErrors.password}</span>}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-select" value={userForm.role}
                  onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="student">Student</option>
                  <option value="staff">Staff</option>
                  <option value="author">Author</option>
                  <option value="librarian">Librarian</option>
                </select>
                {userErrors.role && <span className="form-error">⚠ {userErrors.role}</span>}
              </div>
              {userForm.role === 'author' && (
                <div className="form-group">
                  <label className="form-label">Bio</label>
                  <textarea className="form-textarea" rows={3} value={userForm.bio}
                    onChange={e => setUserForm(f => ({ ...f, bio: e.target.value }))} />
                </div>
              )}
              {userForm.role === 'librarian' && (
                <div className="form-group">
                  <label className="form-label">Employee ID</label>
                  <input className="form-input" value={userForm.employee_id}
                    onChange={e => setUserForm(f => ({ ...f, employee_id: e.target.value }))} />
                </div>
              )}
              <div className="flex gap-3">
                <button className="btn btn-ghost" onClick={() => setUserDialog(null)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveUser} disabled={actionLoading}>
                  {actionLoading ? 'Saving…' : userDialog === 'add' ? 'Create User' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== DEACTIVATE CONFIRM ===== */}
      {confirmDeactivate && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDeactivate(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
                {confirmDeactivate.active !== 0 ? 'Deactivate' : 'Activate'} User
              </h3>
              <button className="modal-close" onClick={() => setConfirmDeactivate(null)}>✕</button>
            </div>
            <div className={`alert ${confirmDeactivate.active !== 0 ? 'alert-error' : 'alert-success'} mb-4`}>
              {confirmDeactivate.active !== 0
                ? `Are you sure you want to deactivate "${confirmDeactivate.full_name}"? They will no longer be able to log in.`
                : `Re-activate "${confirmDeactivate.full_name}"?`}
            </div>
            <div className="flex gap-3">
              <button className="btn btn-ghost" onClick={() => setConfirmDeactivate(null)}>Cancel</button>
              <button className={`btn ${confirmDeactivate.active !== 0 ? 'btn-danger' : 'btn-success'}`} style={{ flex: 1 }}
                onClick={() => handleDeactivateUser(confirmDeactivate.id)}>
                {confirmDeactivate.active !== 0 ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== BOOK PREVIEW MODAL ===== */}
      {previewingBook && (
        <BookPreviewModal book={previewingBook} onClose={() => setPreviewingBook(null)} />
      )}
    </div>
  );
}
