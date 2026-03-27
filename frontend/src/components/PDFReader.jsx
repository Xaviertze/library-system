/**
 * PDF Reader Component
 * In-browser PDF viewer with bookmark and highlight management
 */
import { useState, useEffect } from 'react';
import api from '../utils/api';

export default function PDFReader({ book, onClose }) {
  const [bookmarks, setBookmarks] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [newBookmark, setNewBookmark] = useState({ page: '', label: '' });
  const [newHighlight, setNewHighlight] = useState({ page: '', text: '', color: '#c9a84c' });
  const [activePanel, setActivePanel] = useState(null); // 'bookmarks' | 'highlights' | null
  const [msg, setMsg] = useState('');
  const [blobUrl, setBlobUrl] = useState(null);
  const [fileLoading, setFileLoading] = useState(true);

  useEffect(() => {
    loadBookmarks();
    loadHighlights();
    loadFile();
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [book.book_id]);

  const loadFile = async () => {
    setFileLoading(true);
    try {
      const response = await api.get(`/books/view/${book.book_id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      setBlobUrl(url);
    } catch {
      setBlobUrl(null);
    } finally {
      setFileLoading(false);
    }
  };

  const loadBookmarks = async () => {
    try {
      const { data } = await api.get(`/books/${book.book_id}/bookmarks`);
      setBookmarks(data);
    } catch {}
  };

  const loadHighlights = async () => {
    try {
      const { data } = await api.get(`/books/${book.book_id}/highlights`);
      setHighlights(data);
    } catch {}
  };

  const addBookmark = async () => {
    if (!newBookmark.page || newBookmark.page < 1) return;
    try {
      await api.post(`/books/${book.book_id}/bookmarks`, {
        page_number: parseInt(newBookmark.page),
        label: newBookmark.label || null
      });
      setNewBookmark({ page: '', label: '' });
      loadBookmarks();
      showMsg('Bookmark saved');
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed to save bookmark');
    }
  };

  const removeBookmark = async (id) => {
    try {
      await api.delete(`/books/bookmarks/${id}`);
      loadBookmarks();
      showMsg('Bookmark removed');
    } catch {}
  };

  const addHighlight = async () => {
    if (!newHighlight.page || !newHighlight.text) return;
    try {
      await api.post(`/books/${book.book_id}/highlights`, {
        page_number: parseInt(newHighlight.page),
        text_content: newHighlight.text,
        color: newHighlight.color
      });
      setNewHighlight({ page: '', text: '', color: '#c9a84c' });
      loadHighlights();
      showMsg('Highlight saved');
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed to save highlight');
    }
  };

  const removeHighlight = async (id) => {
    try {
      await api.delete(`/books/highlights/${id}`);
      loadHighlights();
      showMsg('Highlight removed');
    } catch {}
  };

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  const isPdf = book.file_name?.toLowerCase().endsWith('.pdf');

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 1100, width: '95vw', maxHeight: '95vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--parchment-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', margin: 0 }}>{book.title}</h3>
            <span style={{ fontSize: '0.82rem', color: 'var(--gold)' }}>by {book.author_name}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className={`btn btn-sm ${activePanel === 'bookmarks' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActivePanel(activePanel === 'bookmarks' ? null : 'bookmarks')}>
              Bookmarks ({bookmarks.length})
            </button>
            <button className={`btn btn-sm ${activePanel === 'highlights' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActivePanel(activePanel === 'highlights' ? null : 'highlights')}>
              Highlights ({highlights.length})
            </button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {msg && (
          <div style={{ padding: '8px 24px', background: 'var(--gold-dim)', color: 'var(--gold-light)', fontSize: '0.85rem', flexShrink: 0 }}>
            {msg}
          </div>
        )}

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* PDF Viewer */}
          <div style={{ flex: 1, position: 'relative' }}>
            {fileLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <div className="spinner" />
              </div>
            ) : blobUrl && isPdf ? (
              <iframe
                src={blobUrl}
                style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                title={`Reading ${book.title}`}
              />
            ) : blobUrl ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: 16 }}>📄</div>
                <p style={{ color: 'var(--slate)', marginBottom: 16 }}>
                  This file format ({book.file_name?.split('.').pop()?.toUpperCase()}) cannot be previewed in-browser.
                </p>
                <a href={blobUrl} download={book.file_name} className="btn btn-primary">
                  Download to View
                </a>
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: 16 }}>⚠</div>
                <p style={{ color: 'var(--ruby-light)' }}>Failed to load the book file.</p>
              </div>
            )}
          </div>

          {/* Side Panel */}
          {activePanel && (
            <div style={{ width: 300, borderLeft: '1px solid var(--parchment-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
              {activePanel === 'bookmarks' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ padding: 16, borderBottom: '1px solid var(--parchment-border)' }}>
                    <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: 12 }}>Add Bookmark</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input className="form-input" type="number" placeholder="Page #" min="1"
                        value={newBookmark.page} onChange={e => setNewBookmark(b => ({ ...b, page: e.target.value }))}
                        style={{ padding: '8px 10px', fontSize: '0.85rem' }} />
                      <input className="form-input" placeholder="Label (optional)"
                        value={newBookmark.label} onChange={e => setNewBookmark(b => ({ ...b, label: e.target.value }))}
                        style={{ padding: '8px 10px', fontSize: '0.85rem' }} />
                      <button className="btn btn-primary btn-sm" onClick={addBookmark} disabled={!newBookmark.page}>
                        Save Bookmark
                      </button>
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                    {bookmarks.length === 0 ? (
                      <p style={{ color: 'var(--slate)', fontSize: '0.85rem', textAlign: 'center', padding: 20 }}>No bookmarks yet</p>
                    ) : bookmarks.map(bm => (
                      <div key={bm.id} style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: 'var(--parchment-dim)', marginBottom: 8,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--parchment)' }}>
                            Page {bm.page_number}
                          </div>
                          {bm.label && <div style={{ fontSize: '0.78rem', color: 'var(--slate)' }}>{bm.label}</div>}
                        </div>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }}
                          onClick={() => removeBookmark(bm.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activePanel === 'highlights' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ padding: 16, borderBottom: '1px solid var(--parchment-border)' }}>
                    <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: 12 }}>Add Highlight</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input className="form-input" type="number" placeholder="Page #" min="1"
                        value={newHighlight.page} onChange={e => setNewHighlight(h => ({ ...h, page: e.target.value }))}
                        style={{ padding: '8px 10px', fontSize: '0.85rem' }} />
                      <textarea className="form-textarea" placeholder="Highlighted text…" rows={3}
                        value={newHighlight.text} onChange={e => setNewHighlight(h => ({ ...h, text: e.target.value }))}
                        style={{ padding: '8px 10px', fontSize: '0.85rem', minHeight: 60 }} />
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--slate)' }}>Color:</span>
                        {['#c9a84c', '#3dbf87', '#d45f5f', '#6b9bd2'].map(c => (
                          <button key={c} onClick={() => setNewHighlight(h => ({ ...h, color: c }))}
                            style={{
                              width: 22, height: 22, borderRadius: '50%', border: newHighlight.color === c ? '2px solid var(--parchment)' : '2px solid transparent',
                              background: c, cursor: 'pointer'
                            }} />
                        ))}
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={addHighlight}
                        disabled={!newHighlight.page || !newHighlight.text}>
                        Save Highlight
                      </button>
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                    {highlights.length === 0 ? (
                      <p style={{ color: 'var(--slate)', fontSize: '0.85rem', textAlign: 'center', padding: 20 }}>No highlights yet</p>
                    ) : highlights.map(hl => (
                      <div key={hl.id} style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: 'var(--parchment-dim)', marginBottom: 8,
                        borderLeft: `3px solid ${hl.color}`
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--slate)' }}>Page {hl.page_number}</span>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '1px 6px', fontSize: '0.7rem' }}
                            onClick={() => removeHighlight(hl.id)}>✕</button>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--parchment)', fontStyle: 'italic' }}>
                          "{hl.text_content}"
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
