/**
 * Author Portal
 * Publish new books, manage submissions and drafts
 */
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import api from '../utils/api';

const NAV_ITEMS = [
  { id: 'publish', label: 'Publish New Book', icon: '✍️' },
  { id: 'submissions', label: 'My Submissions', icon: '📋' },
  { id: 'drafts', label: 'Drafts', icon: '📝' },
];

const GENRES = [
  'Fiction', 'Non-Fiction', 'Science Fiction', 'Fantasy', 'Mystery',
  'Thriller', 'Romance', 'Biography', 'History', 'Science',
  'Technology', 'Philosophy', 'Poetry', 'Drama', 'Horror', 'Adventure'
];

const STATUS_CONFIG = {
  pending: { label: 'Pending Review', badge: 'badge-pending', icon: '⏳' },
  approved: { label: 'Approved', badge: 'badge-available', icon: '✓' },
  rejected: { label: 'Rejected', badge: 'badge-unavailable', icon: '✕' },
};

export default function AuthorPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('publish');
  const [submissions, setSubmissions] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [errors, setErrors] = useState({});
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const autoSaveTimer = useRef(null);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    title: '',
    genre: [],
    description: '',
  });

  useEffect(() => {
    if (activeTab === 'submissions') loadSubmissions();
    if (activeTab === 'drafts') loadDrafts();
  }, [activeTab]);

  // Auto-save draft when form changes (debounced 3s)
  useEffect(() => {
    if (activeTab !== 'publish') return;
    if (!form.title && !form.description) return;
    
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        setAutoSaveStatus('Saving draft…');
        const { data } = await api.post('/books/draft', {
          ...form,
          genre: form.genre.join(', '),
          draft_id: draftId
        });
        setDraftId(data.draft_id);
        setAutoSaveStatus('Draft saved ✓');
        setTimeout(() => setAutoSaveStatus(''), 2000);
      } catch {
        setAutoSaveStatus('');
      }
    }, 3000);

    return () => clearTimeout(autoSaveTimer.current);
  }, [form]);

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/books/my-submissions');
      setSubmissions(data);
    } finally {
      setLoading(false);
    }
  };

  const loadDrafts = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/books/my-drafts');
      setDrafts(data);
    } finally {
      setLoading(false);
    }
  };

  const toggleGenre = (genre) => {
    setForm(f => ({
      ...f,
      genre: f.genre.includes(genre)
        ? f.genre.filter(g => g !== genre)
        : [...f.genre, genre]
    }));
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setSuccess('');
    setLoading(true);

    const formData = new FormData();
    formData.append('title', form.title);
    formData.append('genre', form.genre.join(', '));
    formData.append('description', form.description);
    if (file) formData.append('book_file', file);
    if (draftId) formData.append('draft_id', draftId);

    try {
      await api.post('/books/submit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSuccess('Book submitted for librarian approval! ✓');
      setForm({ title: '', genre: [], description: '' });
      setFile(null);
      setDraftId(null);
    } catch (err) {
      setErrors(err.response?.data?.errors || { general: 'Submission failed' });
    } finally {
      setLoading(false);
    }
  };

  const loadDraft = (draft) => {
    try {
      const data = JSON.parse(draft.draft_data || '{}');
      setForm({
        title: data.title || draft.title || '',
        genre: (data.genre || '').split(',').map(g => g.trim()).filter(Boolean),
        description: data.description || '',
      });
      setDraftId(draft.id);
      setActiveTab('publish');
    } catch { }
  };

  return (
    <div className="app-layout">
      <Sidebar navItems={NAV_ITEMS} activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="main-content">
        {/* Publish Tab */}
        {activeTab === 'publish' && (
          <div style={{ maxWidth: 700 }}>
            <div className="page-header">
              <h2 className="page-title">Publish a Book</h2>
              <p className="page-subtitle">
                Submit your work for librarian review • {autoSaveStatus && (
                  <span style={{ color: 'var(--gold)', fontStyle: 'italic' }}>{autoSaveStatus}</span>
                )}
              </p>
            </div>

            {errors.general && <div className="alert alert-error mb-4">⚠ {errors.general}</div>}
            {success && <div className="alert alert-success mb-4">✓ {success}</div>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Title */}
              <div className="form-group">
                <label className="form-label">Book Title *</label>
                <input
                  className="form-input"
                  placeholder="Enter your book title…"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
                {errors.title && <span className="form-error">⚠ {errors.title}</span>}
              </div>

              {/* Author (read-only) */}
              <div className="form-group">
                <label className="form-label">Author Name</label>
                <input className="form-input" value={user.full_name} readOnly style={{ opacity: 0.7 }} />
              </div>

              {/* Genre Multi-select */}
              <div className="form-group">
                <label className="form-label">Genres * (select all that apply)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {GENRES.map(g => (
                    <button
                      key={g} type="button"
                      onClick={() => toggleGenre(g)}
                      style={{
                        padding: '5px 14px',
                        borderRadius: 20,
                        border: `1px solid ${form.genre.includes(g) ? 'var(--gold)' : 'var(--parchment-border)'}`,
                        background: form.genre.includes(g) ? 'var(--gold-dim)' : 'transparent',
                        color: form.genre.includes(g) ? 'var(--gold-light)' : 'var(--slate-light)',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                        transition: 'all 0.2s'
                      }}
                    >
                      {form.genre.includes(g) && '✓ '}{g}
                    </button>
                  ))}
                </div>
                {errors.genre && <span className="form-error">⚠ {errors.genre}</span>}
              </div>

              {/* Description */}
              <div className="form-group">
                <label className="form-label">Description / Abstract *</label>
                <textarea
                  className="form-textarea"
                  placeholder="Write a compelling description of your book (minimum 20 characters)…"
                  rows={5}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--slate)', textAlign: 'right' }}>
                  {form.description.length} characters
                </div>
                {errors.description && <span className="form-error">⚠ {errors.description}</span>}
              </div>

              {/* File Upload */}
              <div className="form-group">
                <label className="form-label">Book File * (PDF, TXT, DOC, DOCX — max 50MB)</label>
                <div
                  className={`file-drop ${dragOver ? 'drag-over' : ''}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.doc,.docx"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  {file ? (
                    <div>
                      <div style={{ fontSize: '2rem', marginBottom: 8 }}>📄</div>
                      <div style={{ color: 'var(--parchment)', fontWeight: 500 }}>{file.name}</div>
                      <div style={{ color: 'var(--slate)', fontSize: '0.8rem' }}>
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                      <div style={{ color: 'var(--gold)', fontSize: '0.8rem', marginTop: 4 }}>Click to change file</div>
                    </div>
                  ) : (
                    <div>
                      <div className="file-drop-icon">📂</div>
                      <div className="file-drop-text">
                        <strong>Click to browse</strong> or drag & drop your book file here
                      </div>
                      <div style={{ color: 'var(--slate)', fontSize: '0.78rem', marginTop: 6 }}>PDF, TXT, DOC, DOCX accepted</div>
                    </div>
                  )}
                </div>
                {errors.file && <span className="form-error">⚠ {errors.file}</span>}
              </div>

              <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>
                {loading ? 'Submitting…' : '📤 Submit for Review'}
              </button>
            </form>
          </div>
        )}

        {/* Submissions Tab */}
        {activeTab === 'submissions' && (
          <div>
            <div className="page-header">
              <h2 className="page-title">My Submissions</h2>
              <p className="page-subtitle">Track the status of your submitted books</p>
            </div>

            {loading ? (
              <div className="empty-state"><div className="spinner" /></div>
            ) : submissions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <h3>No submissions yet</h3>
                <p>Submit your first book to get started</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {submissions.map(book => {
                  const s = STATUS_CONFIG[book.status] || STATUS_CONFIG.pending;
                  return (
                    <div key={book.id} className="card">
                      <div className="flex justify-between items-center mb-4">
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem' }}>{book.title}</h3>
                        <span className={`badge ${s.badge}`}>{s.icon} {s.label}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 20, fontSize: '0.82rem', color: 'var(--slate)', flexWrap: 'wrap' }}>
                        <span>🏷️ {book.genre}</span>
                        <span>📅 Submitted: {new Date(book.submitted_date).toLocaleDateString()}</span>
                        {book.publish_date && <span>🌍 Published: {new Date(book.publish_date).toLocaleDateString()}</span>}
                        {book.file_name && <span>📄 {book.file_name}</span>}
                      </div>
                      <p style={{ marginTop: 10, fontSize: '0.88rem', color: 'rgba(245,240,232,0.65)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {book.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Drafts Tab */}
        {activeTab === 'drafts' && (
          <div>
            <div className="page-header">
              <h2 className="page-title">Saved Drafts</h2>
              <p className="page-subtitle">Continue where you left off</p>
            </div>

            {loading ? (
              <div className="empty-state"><div className="spinner" /></div>
            ) : drafts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📝</div>
                <h3>No drafts saved</h3>
                <p>Start writing and your work will auto-save here</p>
              </div>
            ) : (
              <div className="card-grid">
                {drafts.map(draft => {
                  const data = JSON.parse(draft.draft_data || '{}');
                  return (
                    <div key={draft.id} className="book-card">
                      <div style={{ fontSize: '0.72rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        📝 Draft
                      </div>
                      <div className="book-title">{draft.title}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--slate)' }}>
                        Last saved: {data.saved_at ? new Date(data.saved_at).toLocaleString() : 'Unknown'}
                      </div>
                      <p className="book-description">{data.description || 'No description yet'}</p>
                      <button className="btn btn-primary btn-sm" onClick={() => loadDraft(draft)}>
                        ✏️ Continue Editing
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
