/**
 * Student / Staff Portal
 * Browse books, borrow books, view history, see recommendations
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import BookModal from '../components/BookModal';
import api from '../utils/api';
import PdfReader from '../components/pdfReader';

const NAV_ITEMS = [
  { id: 'browse', label: 'Browse Books', icon: '🔍' },
  { id: 'recommendations', label: 'Recommended', icon: '⭐' },
  { id: 'my-books', label: 'My Borrows', icon: '📖' },
];

export default function StudentPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('browse');
  const [books, setBooks] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [borrows, setBorrows] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [search, setSearch] = useState('');
  const [filterGenre, setFilterGenre] = useState('');
  const [filterAvail, setFilterAvail] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [activeTab]);

  /**
   * Automatically return overdue books
   * Called when the "My Borrows" tab is activated
   */
  const autoReturnOverdueBooks = async () => {
    try {
      // Get current borrow records
      const { data: borrowsData } = await api.get('/books/my-borrows');
      const now = new Date();
      
      // Find all overdue books with active status
      const overdueBooks = borrowsData.filter(b => 
        b.status === 'active' && new Date(b.due_date) < now
      );

      // Return each overdue book
      for (const borrow of overdueBooks) {
        try {
          await api.post(`/books/return/${borrow.id}`);
          console.log(`Automatically returned overdue book: ${borrow.title}`);
        } catch (err) {
          console.error(`Failed to return ${borrow.title}:`, err);
        }
      }
    } catch (err) {
      console.error('Error checking for overdue books:', err);
    }
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
        // Auto-return overdue books first, then load updated data
        await autoReturnOverdueBooks();
        const { data } = await api.get('/books/my-borrows');
        setBorrows(data);
      }
    } finally {
      setLoading(false);
    }
  };

  // 在组件内部添加
const [readerConfig, setReaderConfig] = useState({ isOpen: false, bookId: null });
const openReader = (bookId) => {
  setReaderConfig({ isOpen: true, bookId });
};

const handleReturn = async (borrowId) => {
//   if (!window.confirm('确定要归还这本书吗？')) return;
  try {
    await api.post(`/books/return/${borrowId}`);
    loadData(); // 刷新列表
  } catch (err) {
    alert('归还失败: ' + err.response?.data?.error);
  }
};

  // Derive available genres for filter
  const genres = [...new Set(books.flatMap(b => b.genre?.split(',').map(g => g.trim()) || []))];

  // Filtered books
  const filtered = books.filter(b => {
    const matchSearch = !search || 
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.author_name.toLowerCase().includes(search.toLowerCase());
    const matchGenre = !filterGenre || b.genre?.includes(filterGenre);
    const matchAvail = !filterAvail || b.availability === filterAvail;
    return matchSearch && matchGenre && matchAvail;
  });

  return (
    <div className="app-layout">
      <Sidebar navItems={NAV_ITEMS} activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="main-content">
        {/* Page Header */}
        <div className="page-header">
          <h2 className="page-title">
            {activeTab === 'browse' && `Welcome back, ${user.full_name.split(' ')[0]}`}
            {activeTab === 'recommendations' && 'Recommended for You'}
            {activeTab === 'my-books' && 'My Borrowed Books'}
          </h2>
          <p className="page-subtitle">
            {activeTab === 'browse' && 'Discover and borrow from our collection'}
            {activeTab === 'recommendations' && 'Top 3 most borrowed books in our collection'}
            {activeTab === 'my-books' && 'Track your current and past borrowings'}
          </p>
        </div>

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
            </div>

            {/* Filters */}
            <div className="filter-bar">
              <input
                className="form-input"
                placeholder="🔍 Search by title or author…"
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
            </div>

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
                  <div key={book.id} className="book-card" onClick={() => setSelectedBook(book)}>
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
                    <div style={{ fontSize: '0.75rem', color: 'var(--slate)', marginTop: 4 }}>
                      Click to read more & borrow →
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
                      ⭐ Top Borrowed
                    </div>
                    <div className="book-title">{book.title}</div>
                    <div className="book-author">by {book.author_name}</div>
                    {book.publish_date && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--slate)', marginTop: 2 }}>
                        📅 Published: {new Date(book.publish_date).toLocaleDateString()}
                      </div>
                    )}
                    <div className="book-meta" style={{ marginTop: 8 }}>
                      <span className={`badge ${book.availability === 'available' ? 'badge-available' : 'badge-unavailable'}`}>
                        {book.availability === 'available' ? '● Available' : '● Borrowed'}
                      </span>
                    </div>
                    <p className="book-description">{book.description}</p>
                    <div style={{ fontSize: '0.75rem', color: 'var(--slate)', marginTop: 4 }}>
                      📖 Borrowed {book.times_borrowed} time{book.times_borrowed !== 1 ? 's' : ''}
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
                      <th>Genre</th>
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
                        <tr key={b.id}
                            onClick={() => {
                                // 只有活跃状态（已借出且未归还）的条目才可以阅读
                                if (b.status === 'active') {
                                    openReader(b.book_id);
                                }
                            }} 
                            style={{ 
                                cursor: b.status === 'active' ? 'pointer' : 'default',
                                opacity: b.status === 'active' ? 1 : 0.7 // 非活跃条目稍微变淡
                            }}>
                          <td style={{ fontWeight: 500, color: 'var(--parchment)' }}>{b.title}</td>
                          <td>{b.author_name}</td>
                          <td>
                            <span className="badge badge-genre">{b.genre?.split(',')[0]?.trim()}</span>
                          </td>
                          <td>{new Date(b.borrow_date).toLocaleDateString()}</td>
                          <td style={{ color: isOverdue ? 'var(--ruby-light)' : 'inherit' }}>
                            {new Date(b.due_date).toLocaleDateString()}
                            {isOverdue && ' ⚠'}
                          </td>
                          <td>
                            <span className={`badge ${
                              b.status === 'active' && !isOverdue ? 'badge-available' : 
                              isOverdue ? 'badge-unavailable' : 'badge-genre'
                            }`}>
                              {isOverdue ? 'Overdue' : b.status}
                            </span>
                          </td>
                          <td>
                            {b.status === 'active' && (
                                <button 
                                className="badge" // 需在 CSS 中定义样式
                                onClick={(e) => {
                                    e.stopPropagation(); // 阻止触发行的点击事件
                                    handleReturn(b.id);
                                }}
                                >
                                Return
                                </button>
                            )}
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
        {/* 在 main-content 外部或底部添加 */}
        {readerConfig.isOpen && (
        <PdfReader 
            bookId={readerConfig.bookId} 
            onClose={() => setReaderConfig({ isOpen: false, bookId: null })} 
        />
        )}
      </main>

      {/* Book Detail Modal */}
      {selectedBook && (
        <BookModal
          book={selectedBook}
          onClose={() => setSelectedBook(null)}
          onBorrowed={() => { loadData(); setSelectedBook(null); setTimeout(() => setSelectedBook(null), 2000); }}
        />
      )}
    </div>
  );
}
