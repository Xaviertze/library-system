/**
 * Student / Staff Portal
 * Browse books, borrow books, view history, see recommendations
 * Extended: PDF reader, bookmarks, highlights, profile, notifications, multi-borrow, borrow limit
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import BookModal from '../components/BookModal';
import PDFReader from '../components/PDFReader';
import NotificationBoard from '../components/NotificationBoard';
import ProfileEditor from '../components/ProfileEditor';
import { useCrashRecovery } from '../components/CrashRecovery';
import api from '../utils/api';

const NAV_ITEMS = [
  { id: 'browse', label: 'Browse Books', icon: '🔍' },
  { id: 'recommendations', label: 'Recommended', icon: '⭐' },
  { id: 'my-books', label: 'My Borrows', icon: '📖' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'profile', label: 'My Profile', icon: '👤' },
];

export default function StudentPortal() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('browse');
  const [books, setBooks] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [borrows, setBorrows] = useState([]);
  const [borrowInfo, setBorrowInfo] = useState({ active_count: 0, borrow_limit: 5 });
  const [selectedBook, setSelectedBook] = useState(null);
  const [readingBook, setReadingBook] = useState(null); // for PDF reader
  const [search, setSearch] = useState('');
  const [filterGenre, setFilterGenre] = useState('');
  const [filterAvail, setFilterAvail] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmReturn, setConfirmReturn] = useState(null);
  const [returnMsg, setReturnMsg] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  // Multi-borrow state
  const [multiBorrowMode, setMultiBorrowMode] = useState(false);
  const [selectedForBorrow, setSelectedForBorrow] = useState(new Set());
  const [multiBorrowDuration, setMultiBorrowDuration] = useState(7);
  const [multiBorrowLoading, setMultiBorrowLoading] = useState(false);

  // Crash recovery
  useCrashRecovery('student', activeTab, { search, filterGenre, filterAvail });

  useEffect(() => { loadData(); }, [activeTab]);
  useEffect(() => { loadUnreadCount(); }, [activeTab]);

  const loadUnreadCount = async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      setUnreadCount(data.count);
    } catch {}
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'browse') {
        const { data } = await api.get('/books');
        setBooks(data);
      } else if (activeTab === 'recommendations') {
        const { data } = await api.get('/books/recommendations');
        setRecommendations(data);
      } else if (activeTab === 'my-books') {
        const { data } = await api.get('/books/my-borrows');
        setBorrows(data.borrows || data);
        setBorrowInfo({ active_count: data.active_count || 0, borrow_limit: data.borrow_limit || 5 });
      }
    } finally {
      setLoading(false);
    }
  };

  // Derive available genres for filter
  const genres = [...new Set(books.flatMap(b => b.genre?.split(',').map(g => g.trim()) || []))];

  const handleReturn = async (bookId) => {
    try {
      await api.post(`/books/${bookId}/return`);
      setReturnMsg('Book returned successfully!');
      setConfirmReturn(null);
      loadData();
      setTimeout(() => setReturnMsg(''), 3000);
    } catch (err) {
      setReturnMsg(err.response?.data?.error || 'Failed to return book.');
      setTimeout(() => setReturnMsg(''), 3000);
    }
  };

  const handleMultiBorrow = async () => {
    if (selectedForBorrow.size === 0) return;
    setMultiBorrowLoading(true);
    try {
      const { data } = await api.post('/books/bulk-borrow', {
        book_ids: [...selectedForBorrow],
        duration_days: multiBorrowDuration
      });
      setReturnMsg(data.message + (data.errors?.length ? ` Errors: ${data.errors.join('; ')}` : ''));
      setSelectedForBorrow(new Set());
      setMultiBorrowMode(false);
      loadData();
      setTimeout(() => setReturnMsg(''), 5000);
    } catch (err) {
      setReturnMsg(err.response?.data?.error || 'Bulk borrow failed');
      setTimeout(() => setReturnMsg(''), 5000);
    } finally {
      setMultiBorrowLoading(false);
    }
  };

  const toggleBorrowSelect = (bookId) => {
    setSelectedForBorrow(prev => {
      const next = new Set(prev);
      next.has(bookId) ? next.delete(bookId) : next.add(bookId);
      return next;
    });
  };

  // Filtered books
  const filtered = books.filter(b => {
    const matchSearch = !search ||
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.author_name.toLowerCase().includes(search.toLowerCase());
    const matchGenre = !filterGenre || b.genre?.includes(filterGenre);
    const matchAvail = !filterAvail || b.availability === filterAvail;
    const matchDate = !filterDate || (b.publish_date && b.publish_date.startsWith(filterDate));
    return matchSearch && matchGenre && matchAvail && matchDate;
  });

  // Nav items with unread badge
  const navItemsWithBadge = NAV_ITEMS.map(item => {
    if (item.id === 'notifications' && unreadCount > 0) {
      return { ...item, label: `Notifications (${unreadCount})` };
    }
    return item;
  });

  return (
    <div className="app-layout">
      <Sidebar navItems={navItemsWithBadge} activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="main-content">

        {/* Page Header */}
        <div className="page-header">
          <h2 className="page-title">
            {activeTab === 'browse' && `Welcome back, ${user.full_name.split(' ')[0]}`}
            {activeTab === 'recommendations' && 'Recommended for You'}
            {activeTab === 'my-books' && 'My Borrowed Books'}
            {activeTab === 'notifications' && ''}
            {activeTab === 'profile' && ''}
          </h2>
          <p className="page-subtitle">
            {activeTab === 'browse' && 'Discover and borrow from our collection'}
            {activeTab === 'recommendations' && 'Top 3 most borrowed books in our collection'}
            {activeTab === 'my-books' && `Track your current and past borrowings (${borrowInfo.active_count}/${borrowInfo.borrow_limit} active)`}
          </p>
        </div>

        {/* Feedback message */}
        {returnMsg && ['browse', 'my-books'].includes(activeTab) && (
          <div style={{
            padding: '10px 16px', marginBottom: 16, borderRadius: 6,
            background: returnMsg.includes('success') ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)',
            color: returnMsg.includes('success') ? 'var(--emerald-light)' : 'var(--ruby-light)',
            border: `1px solid ${returnMsg.includes('success') ? 'var(--emerald-light)' : 'var(--ruby-light)'}`,
            fontSize: '0.9rem'
          }}>
            {returnMsg.includes('success') ? '✓ ' : '⚠ '}{returnMsg}
          </div>
        )}

        {/* Browse Tab */}
        {activeTab === 'browse' && (
          <div>
            {/* Stats */}
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-value">{books.length}</div>
                <div className="stat-label">Total Books</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{books.filter(b => b.availability === 'available').length}</div>
                <div className="stat-label">Available</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{genres.length}</div>
                <div className="stat-label">Genres</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{borrowInfo.active_count}/{borrowInfo.borrow_limit}</div>
                <div className="stat-label">My Borrows</div>
              </div>
            </div>

            {/* Filters */}
            <div className="filter-bar">
              <input
                className="form-input"
                placeholder="Search by title or author…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <select className="form-select" value={filterGenre} onChange={e => setFilterGenre(e.target.value)} style={{ flex: '0 0 160px' }}>
                <option value="">All Genres</option>
                {genres.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <select className="form-select" value={filterAvail} onChange={e => setFilterAvail(e.target.value)} style={{ flex: '0 0 150px' }}>
                <option value="">All Status</option>
                <option value="available">Available</option>
                <option value="borrowed">Borrowed</option>
              </select>
              <input className="form-input" type="month" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                style={{ flex: '0 0 160px' }} title="Filter by publish date" />
              <button className={`btn btn-sm ${multiBorrowMode ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setMultiBorrowMode(!multiBorrowMode); setSelectedForBorrow(new Set()); }}>
                {multiBorrowMode ? 'Cancel Multi-Borrow' : 'Multi-Borrow'}
              </button>
            </div>

            {/* Multi-borrow bar */}
            {multiBorrowMode && selectedForBorrow.size > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                background: 'var(--gold-dim)', border: '1px solid var(--gold-border)',
                borderRadius: 'var(--radius)', marginBottom: 16, flexWrap: 'wrap'
              }}>
                <span style={{ color: 'var(--gold-light)', fontSize: '0.9rem', fontWeight: 500 }}>
                  {selectedForBorrow.size} book{selectedForBorrow.size !== 1 ? 's' : ''} selected
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--slate)' }}>Duration:</span>
                  <input type="range" min={1} max={14} value={multiBorrowDuration}
                    onChange={e => setMultiBorrowDuration(Number(e.target.value))}
                    style={{ width: 100, accentColor: 'var(--gold)' }} />
                  <span style={{ color: 'var(--gold)', fontWeight: 600, minWidth: 30 }}>{multiBorrowDuration}d</span>
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleMultiBorrow} disabled={multiBorrowLoading}>
                  {multiBorrowLoading ? 'Borrowing…' : `Borrow ${selectedForBorrow.size} Book(s)`}
                </button>
              </div>
            )}

            {loading ? (
              <div className="empty-state"><div className="spinner" /></div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <h3>No books found</h3>
                <p>Try adjusting your search filters</p>
              </div>
            ) : (
              <div className="card-grid">
                {filtered.map(book => (
                  <div key={book.id} className="book-card"
                    onClick={() => !multiBorrowMode && setSelectedBook(book)}
                    style={multiBorrowMode && selectedForBorrow.has(book.id) ? { borderColor: 'var(--gold)', boxShadow: '0 0 0 2px var(--gold-dim)' } : {}}
                  >
                    {multiBorrowMode && book.availability === 'available' && (
                      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1 }}
                        onClick={e => { e.stopPropagation(); toggleBorrowSelect(book.id); }}>
                        <input type="checkbox" checked={selectedForBorrow.has(book.id)}
                          onChange={() => toggleBorrowSelect(book.id)} />
                      </div>
                    )}
                    {book.cover_image ? (
                      <div style={{ marginBottom: 10, borderRadius: 6, overflow: 'hidden', maxHeight: 160 }}>
                        <img src={`/uploads/${book.cover_image.replace(/^uploads\//, '')}`} alt={book.title}
                          style={{ width: '100%', objectFit: 'cover', maxHeight: 160 }}
                          onError={e => { e.target.style.display = 'none'; e.target.parentNode.style.display = 'none'; }} />
                      </div>
                    ) : (
                      <div style={{ marginBottom: 10, borderRadius: 6, height: 120, background: 'var(--ink-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', color: 'var(--parchment-border)' }}>
                        📖
                      </div>
                    )}
                    <div className="book-title">{book.title}</div>
                    <div className="book-author">by {book.author_name}</div>
                    <div className="book-meta">
                      {book.genre?.split(',').slice(0, 2).map(g => (
                        <span key={g} className="badge badge-genre">{g.trim()}</span>
                      ))}
                      <span className={`badge ${book.availability === 'available' ? 'badge-available' : 'badge-unavailable'}`}>
                        {book.availability === 'available' ? '● Available' : '● Borrowed'}
                      </span>
                    </div>
                    <p className="book-description">{book.description}</p>
                    {book.publish_date && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--slate)', marginTop: 2 }}>
                        Published: {new Date(book.publish_date).toLocaleDateString()}
                      </div>
                    )}
                    <div style={{ fontSize: '0.75rem', color: 'var(--slate)', marginTop: 4 }}>
                      {multiBorrowMode ? 'Click checkbox to select' : 'Click to read more & borrow →'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recommendations Tab */}
        {activeTab === 'recommendations' && (
          <div>
            {loading ? (
              <div className="empty-state"><div className="spinner" /></div>
            ) : recommendations.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🌟</div>
                <h3>No recommendations yet</h3>
                <p>No books have been borrowed yet. Check back soon!</p>
              </div>
            ) : (
              <div className="card-grid">
                {recommendations.map(book => (
                  <div key={book.id} className="book-card" onClick={() => setSelectedBook(book)}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                      Top Borrowed
                    </div>
                    <div className="book-title">{book.title}</div>
                    <div className="book-author">by {book.author_name}</div>
                    {book.publish_date && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--slate)', marginTop: 2 }}>
                        Published: {new Date(book.publish_date).toLocaleDateString()}
                      </div>
                    )}
                    <div className="book-meta" style={{ marginTop: 8 }}>
                      <span className={`badge ${book.availability === 'available' ? 'badge-available' : 'badge-unavailable'}`}>
                        {book.availability === 'available' ? '● Available' : '● Borrowed'}
                      </span>
                    </div>
                    <p className="book-description">{book.description}</p>
                    <div style={{ fontSize: '0.75rem', color: 'var(--slate)', marginTop: 4 }}>
                      Borrowed {book.times_borrowed} time{book.times_borrowed !== 1 ? 's' : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* My Borrows Tab */}
        {activeTab === 'my-books' && (
          <div>
            {/* Confirmation dialog */}
            {confirmReturn && (
              <div style={{
                padding: '16px', marginBottom: 16, borderRadius: 8,
                background: 'var(--surface)', border: '1px solid var(--gold)',
                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap'
              }}>
                <span style={{ color: 'var(--parchment)', flex: 1 }}>
                  Return <strong>"{confirmReturn.title}"</strong>? This cannot be undone.
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ padding: '6px 16px', fontSize: '0.85rem' }}
                    onClick={() => handleReturn(confirmReturn.book_id)}>
                    Confirm Return
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '6px 16px', fontSize: '0.85rem' }}
                    onClick={() => setConfirmReturn(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="empty-state"><div className="spinner" /></div>
            ) : borrows.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📚</div>
                <h3>No borrowing history</h3>
                <p>Books you borrow will appear here</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Book</th>
                      <th>Author</th>
                      <th>Borrowed</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {borrows.map(b => {
                      const isOverdue = b.status === 'active' && new Date(b.due_date) < new Date();
                      return (
                        <tr key={b.id}>
                          <td style={{ fontWeight: 500, color: 'var(--parchment)' }}>{b.title}</td>
                          <td>{b.author_name}</td>
                          <td>{new Date(b.borrow_date).toLocaleDateString()}</td>
                          <td style={{ color: isOverdue ? 'var(--ruby-light)' : 'inherit' }}>
                            {new Date(b.due_date).toLocaleDateString()}
                            {isOverdue && ' ⚠'}
                          </td>
                          <td>
                            <span className={`badge ${
                              b.status === 'returned' ? 'badge-genre' :
                              isOverdue ? 'badge-unavailable' : 'badge-available'
                            }`}>
                              {b.status === 'returned' ? 'Returned' : isOverdue ? 'Overdue' : 'Active'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {b.status === 'active' && b.file_name && (
                                <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                  onClick={() => setReadingBook(b)}>
                                  Read
                                </button>
                              )}
                              {b.status === 'active' && (
                                <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                                  onClick={() => setConfirmReturn(b)}>
                                  Return
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <NotificationBoard categories={['borrow', 'general', 'announcement']} />
        )}

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <ProfileEditor
            showFields={['full_name', 'password', 'profile_picture']}
            onPasswordChanged={logout}
          />
        )}
      </main>

      {/* Book Detail Modal */}
      {selectedBook && (
        <BookModal
          book={selectedBook}
          onClose={() => setSelectedBook(null)}
          onBorrowed={() => { loadData(); setSelectedBook(null); }}
        />
      )}

      {/* PDF Reader Modal */}
      {readingBook && (
        <PDFReader book={readingBook} onClose={() => setReadingBook(null)} />
      )}
    </div>
  );
}
