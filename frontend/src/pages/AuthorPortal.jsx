/**
 * Author Portal
 * Publish new books, manage submissions and drafts
 * Extended: edit/delete books, cover image, preview, profile, notifications
 */
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import NotificationBoard from '../components/NotificationBoard';
import ProfileEditor from '../components/ProfileEditor';
import { useCrashRecovery } from '../components/CrashRecovery';
import { useRecovery } from '../App';
import api from '../utils/api';

const NAV_ITEMS = [
  { id: 'publish', label: 'Publish New Book', icon: '✍️' },
  { id: 'submissions', label: 'My Submissions', icon: '📋' },
  { id: 'drafts', label: 'Drafts', icon: '📝' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'profile', label: 'My Profile', icon: '👤' },
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
  pending_deletion: { label: 'Pending Deletion', badge: 'badge-unavailable', icon: '🗑' },
};

export default function AuthorPortal() {
  const { user, logout } = useAuth();
  const { recoveryState, clearRecoveryState } = useRecovery();
  const [activeTab, setActiveTab] = useState(() => recoveryState?.screen || 'publish');
  const [submissions, setSubmissions] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [errors, setErrors] = useState({});
  const [file, setFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [draftSaving, setDraftSaving] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const autoSaveTimer = useRef(null);
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);

  // Edit modal state
  const [editingBook, setEditingBook] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', genre: [], description: '' });
  const [editFile, setEditFile] = useState(null);
  const [editCover, setEditCover] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editErrors, setEditErrors] = useState({});

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [selectedForDelete, setSelectedForDelete] = useState(new Set());
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);

  // Preview state
  const [previewBook, setPreviewBook] = useState(null);

  const [form, setForm] = useState({
    title: '',
    genre: [],
    description: '',
  });

  // Clear recovery state after it has been consumed
  useEffect(() => {
    if (recoveryState) clearRecoveryState();
  }, []);

  // Crash recovery
  useCrashRecovery('author', activeTab, { form, draftId });

  useEffect(() => {
    if (activeTab === 'submissions') loadSubmissions();
    if (activeTab === 'drafts') loadDrafts();
    loadUnreadCount();
  }, [activeTab]);

  const loadUnreadCount = async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      setUnreadCount(data.count);
    } catch {}
  };

  // Restore in-progress publish form from localStorage on page load
  useEffect(() => {
    const saved = localStorage.getItem('author_publish_draft');
    if (!saved) return;
    try {
      const { savedForm, savedDraftId } = JSON.parse(saved);
      if (savedForm) setForm(savedForm);
      if (savedDraftId) setDraftId(savedDraftId);
    } catch {}
  }, []);

  // Persist publish form + draftId to localStorage whenever they change
  useEffect(() => {
    if (!form.title && !form.description && !draftId) {
      localStorage.removeItem('author_publish_draft');
      return;
    }
    localStorage.setItem('author_publish_draft', JSON.stringify({ savedForm: form, savedDraftId: draftId }));
  }, [form, draftId]);

  // Auto-save draft when form changes (debounced 3s)
  useEffect(() => {
    if (activeTab !== 'publish') return;
    if (!form.title && !form.description) return;

    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        setAutoSaveStatus('Saving draft…');
        const fd = new FormData();
        fd.append('title', form.title);
        fd.append('genre', form.genre.join(', '));
        fd.append('description', form.description);
        if (draftId) fd.append('draft_id', draftId);
        const { data } = await api.post('/books/draft', fd);
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

  const handleSaveDraft = async () => {
    setDraftSaving(true);
    setAutoSaveStatus('Saving draft…');
    clearTimeout(autoSaveTimer.current);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('genre', form.genre.join(', '));
      fd.append('description', form.description);
      if (draftId) fd.append('draft_id', draftId);
      if (file) fd.append('book_file', file);
      const { data } = await api.post('/books/draft', fd);
      setDraftId(data.draft_id);
      setAutoSaveStatus('Draft saved ✓');
      setTimeout(() => setAutoSaveStatus(''), 2000);
    } catch {
      setAutoSaveStatus('Save failed');
      setTimeout(() => setAutoSaveStatus(''), 2000);
    } finally {
      setDraftSaving(false);
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
    if (coverFile) formData.append('cover_image', coverFile);
    if (draftId) formData.append('draft_id', draftId);

    try {
      await api.post('/books/submit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSuccess('Book submitted for librarian approval! ✓');
      setForm({ title: '', genre: [], description: '' });
      setFile(null);
      setCoverFile(null);
      setDraftId(null);
      localStorage.removeItem('author_publish_draft');
    } catch (err) {
      setErrors(err.response?.data?.errors || { general: 'Submission failed' });
    } finally {
      setLoading(false);
    }
  };

  const loadDraft = (draft) => {
    try {
      const data = JSON.parse(draft.draft_data || '{}');
      const restoredForm = {
        title: data.title || draft.title || '',
        genre: (data.genre || '').split(',').map(g => g.trim()).filter(Boolean),
        description: data.description || '',
      };
      setForm(restoredForm);
      setDraftId(draft.id);
      localStorage.setItem('author_publish_draft', JSON.stringify({ savedForm: restoredForm, savedDraftId: draft.id }));
      setActiveTab('publish');
    } catch { }
  };

  // --- Edit Book ---
  const openEdit = (book) => {
    setEditingBook(book);
    setEditForm({
      title: book.title,
      genre: (book.genre || '').split(',').map(g => g.trim()).filter(Boolean),
      description: book.description,
    });
    setEditFile(null);
    setEditCover(null);
    setEditErrors({});
  };

  const handleEditSave = async () => {
    setEditLoading(true);
    setEditErrors({});
    try {
      const fd = new FormData();
      fd.append('title', editForm.title);
      fd.append('genre', editForm.genre.join(', '));
      fd.append('description', editForm.description);
      if (editFile) fd.append('book_file', editFile);
      if (editCover) fd.append('cover_image', editCover);
      const { data } = await api.put(`/books/${editingBook.id}/edit`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setEditingBook(null);
      setSuccess(data.message || 'Book updated successfully!');
      loadSubmissions();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setEditErrors(err.response?.data?.errors || { general: err.response?.data?.error || 'Update failed' });
    } finally {
      setEditLoading(false);
    }
  };

  // --- Delete Book ---
  const handleDelete = async (bookId) => {
    try {
      const { data } = await api.delete(`/books/${bookId}`);
      setConfirmDelete(null);
      setSuccess(data.message || 'Deletion request submitted');
      loadSubmissions();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setSuccess('');
      setErrors({ general: err.response?.data?.error || 'Delete failed' });
      setTimeout(() => setErrors({}), 3000);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedForDelete.size === 0) return;
    try {
      const { data } = await api.post('/books/bulk-delete', { book_ids: [...selectedForDelete] });
      setSuccess(data.message + (data.errors?.length ? ` Errors: ${data.errors.join('; ')}` : ''));
      setSelectedForDelete(new Set());
      setBulkDeleteMode(false);
      loadSubmissions();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setErrors({ general: err.response?.data?.error || 'Bulk delete failed' });
      setTimeout(() => setErrors({}), 3000);
    }
  };

  const canEdit = (book) => book.status === 'pending' || (book.status === 'approved' && book.availability !== 'borrowed');
  const canDelete = (book) => book.status !== 'pending_deletion';

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

              {/* Cover Image Upload */}
              <div className="form-group">
                <label className="form-label">Cover Image (optional — JPG/PNG, max 2MB)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button type="button" className="btn btn-ghost btn-sm"
                    onClick={() => coverInputRef.current?.click()}>
                    {coverFile ? 'Change Cover' : 'Upload Cover'}
                  </button>
                  <input ref={coverInputRef} type="file" accept="image/jpeg,image/png"
                    style={{ display: 'none' }}
                    onChange={e => { if (e.target.files?.[0]) setCoverFile(e.target.files[0]); }} />
                  {coverFile && (
                    <span style={{ fontSize: '0.82rem', color: 'var(--slate)' }}>
                      {coverFile.name} ({(coverFile.size / 1024 / 1024).toFixed(2)}MB)
                    </span>
                  )}
                </div>
                {errors.cover && <span className="form-error">⚠ {errors.cover}</span>}
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

              {/* Preview before submission */}
              {form.title && form.description && (
                <div className="card" style={{ borderColor: 'var(--gold-border)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                    Preview
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', marginBottom: 4 }}>{form.title}</h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--gold)', marginBottom: 8 }}>by {user.full_name}</div>
                  {form.genre.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {form.genre.map(g => <span key={g} className="badge badge-genre">{g}</span>)}
                    </div>
                  )}
                  <p style={{ fontSize: '0.88rem', color: 'rgba(245,240,232,0.65)' }}>{form.description}</p>
                  {file && <div style={{ fontSize: '0.78rem', color: 'var(--slate)', marginTop: 8 }}>📄 {file.name}</div>}
                  {coverFile && <div style={{ fontSize: '0.78rem', color: 'var(--slate)' }}>🖼 Cover: {coverFile.name}</div>}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>
                  {loading ? 'Submitting…' : 'Submit for Review'}
                </button>
                <button
                  className="btn btn-secondary btn-lg"
                  type="button"
                  disabled={draftSaving}
                  onClick={handleSaveDraft}
                >
                  {draftSaving ? 'Saving…' : 'Save Draft'}
                </button>
              </div>
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

            {success && <div className="alert alert-success mb-4">✓ {success}</div>}
            {errors.general && <div className="alert alert-error mb-4">⚠ {errors.general}</div>}

            {/* Bulk actions */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <button className={`btn btn-sm ${bulkDeleteMode ? 'btn-danger' : 'btn-ghost'}`}
                onClick={() => { setBulkDeleteMode(!bulkDeleteMode); setSelectedForDelete(new Set()); }}>
                {bulkDeleteMode ? 'Cancel Bulk Delete' : 'Bulk Delete'}
              </button>
              {bulkDeleteMode && selectedForDelete.size > 0 && (
                <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>
                  Delete {selectedForDelete.size} Book(s)
                </button>
              )}
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
                    <div key={book.id} className="card" style={bulkDeleteMode && selectedForDelete.has(book.id) ? { borderColor: 'var(--ruby)' } : {}}>
                      <div className="flex justify-between items-center mb-4">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {bulkDeleteMode && canDelete(book) && (
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '4px' }}>
                              <input type="checkbox" checked={selectedForDelete.has(book.id)}
                                style={{ width: 18, height: 18 }}
                                onChange={() => {
                                  setSelectedForDelete(prev => {
                                    const next = new Set(prev);
                                    next.has(book.id) ? next.delete(book.id) : next.add(book.id);
                                    return next;
                                  });
                                }} />
                            </label>
                          )}
                          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem' }}>{book.title}</h3>
                        </div>
                        <span className={`badge ${s.badge}`}>{s.icon} {s.label}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 20, fontSize: '0.82rem', color: 'var(--slate)', flexWrap: 'wrap' }}>
                        <span>{book.genre}</span>
                        <span>Submitted: {new Date(book.submitted_date).toLocaleDateString()}</span>
                        {book.publish_date && <span>Published: {new Date(book.publish_date).toLocaleDateString()}</span>}
                        {book.file_name && <span>📄 {book.file_name}</span>}
                      </div>
                      {book.rejection_reason && (
                        <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: 'var(--ruby-dim)', color: 'var(--ruby-light)', fontSize: '0.85rem' }}>
                          Rejection reason: {book.rejection_reason}
                        </div>
                      )}
                      <p style={{ marginTop: 10, fontSize: '0.88rem', color: 'rgba(245,240,232,0.65)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {book.description}
                      </p>
                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        {canEdit(book) && (
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(book)}>
                            Edit
                          </button>
                        )}
                        {canDelete(book) && (
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--ruby-light)' }}
                            onClick={() => setConfirmDelete(book)}>
                            Delete
                          </button>
                        )}
                      </div>
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
                        Draft
                      </div>
                      <div className="book-title">{draft.title}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--slate)' }}>
                        Last saved: {data.saved_at ? new Date(data.saved_at).toLocaleString() : 'Unknown'}
                      </div>
                      <p className="book-description">{data.description || 'No description yet'}</p>
                      <button className="btn btn-primary btn-sm" onClick={() => loadDraft(draft)}>
                        Continue Editing
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <NotificationBoard categories={['submissions', 'general', 'announcement']} />
        )}

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <ProfileEditor
            showFields={['full_name', 'password', 'bio', 'profile_picture']}
            onPasswordChanged={logout}
          />
        )}
      </main>

      {/* Edit Book Modal */}
      {editingBook && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingBook(null)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>Edit Book</h3>
              <button className="modal-close" onClick={() => setEditingBook(null)}>✕</button>
            </div>

            {editErrors.general && <div className="alert alert-error mb-4">⚠ {editErrors.general}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input className="form-input" value={editForm.title}
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
                {editErrors.title && <span className="form-error">⚠ {editErrors.title}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Genres</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {GENRES.map(g => (
                    <button key={g} type="button"
                      onClick={() => setEditForm(f => ({
                        ...f,
                        genre: f.genre.includes(g) ? f.genre.filter(x => x !== g) : [...f.genre, g]
                      }))}
                      style={{
                        padding: '4px 12px', borderRadius: 20, fontSize: '0.78rem', cursor: 'pointer',
                        border: `1px solid ${editForm.genre.includes(g) ? 'var(--gold)' : 'var(--parchment-border)'}`,
                        background: editForm.genre.includes(g) ? 'var(--gold-dim)' : 'transparent',
                        color: editForm.genre.includes(g) ? 'var(--gold-light)' : 'var(--slate-light)',
                      }}>
                      {editForm.genre.includes(g) && '✓ '}{g}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-textarea" rows={4} value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                {editErrors.description && <span className="form-error">⚠ {editErrors.description}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Replace Book File (optional)</label>
                <input type="file" accept=".pdf,.txt,.doc,.docx"
                  onChange={e => setEditFile(e.target.files?.[0] || null)} />
              </div>
              <div className="form-group">
                <label className="form-label">Replace Cover Image (optional)</label>
                <input type="file" accept="image/jpeg,image/png"
                  onChange={e => setEditCover(e.target.files?.[0] || null)} />
              </div>
              <div className="flex gap-3">
                <button className="btn btn-ghost" onClick={() => setEditingBook(null)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleEditSave} disabled={editLoading}>
                  {editLoading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>Confirm Delete</h3>
              <button className="modal-close" onClick={() => setConfirmDelete(null)}>✕</button>
            </div>
            <div className="alert alert-error mb-4">
              Request deletion of <strong>"{confirmDelete.title}"</strong>? A librarian will review this request.
            </div>
            <div className="flex gap-3">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => handleDelete(confirmDelete.id)}>
                Request Deletion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
