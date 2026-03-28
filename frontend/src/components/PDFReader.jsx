/**
 * PDF Reader Component
 * Full-screen PDF viewer with bookmark and highlight management
 */
import { useState, useEffect, useRef } from 'react';
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedText, setSelectedText] = useState('');
  const [showHighlightBtn, setShowHighlightBtn] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    loadBookmarks();
    loadHighlights();
    loadFile();
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [book.book_id]);

  // Listen for text selection inside the PDF iframe
  useEffect(() => {
    const checkSelection = () => {
      try {
        const iframe = iframeRef.current;
        if (!iframe) return;
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) return;
        const sel = iframeDoc.getSelection();
        const text = sel?.toString()?.trim();
        if (text && text.length > 0) {
          setSelectedText(text);
          setShowHighlightBtn(true);
        } else {
          setShowHighlightBtn(false);
        }
      } catch {
        // Cross-origin or unavailable — ignore
      }
    };

    const interval = setInterval(checkSelection, 500);
    return () => clearInterval(interval);
  }, [blobUrl]);

  // Try to detect current page from PDF viewer URL hash
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !blobUrl) return;
    const detectPage = () => {
      try {
        const hash = iframe.contentWindow?.location?.hash || '';
        const match = hash.match(/page=(\d+)/);
        if (match) setCurrentPage(parseInt(match[1]));
      } catch {}
    };
    const interval = setInterval(detectPage, 1000);
    return () => clearInterval(interval);
  }, [blobUrl]);

  // Escape key to exit fullscreen or close reader
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (isFullscreen) setIsFullscreen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isFullscreen, onClose]);

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

  const addBookmark = async (page, label) => {
    const pg = page || newBookmark.page;
    if (!pg || pg < 1) return;
    try {
      await api.post(`/books/${book.book_id}/bookmarks`, {
        page_number: parseInt(pg),
        label: label !== undefined ? label : (newBookmark.label || null)
      });
      setNewBookmark({ page: '', label: '' });
      loadBookmarks();
      showMsg('Bookmark saved');
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed to save bookmark');
    }
  };

  const bookmarkCurrentPage = () => {
    addBookmark(currentPage, `Page ${currentPage}`);
  };

  const removeBookmark = async (id) => {
    try {
      await api.delete(`/books/bookmarks/${id}`);
      loadBookmarks();
      showMsg('Bookmark removed');
    } catch {}
  };

  const addHighlight = async (text, page, color) => {
    const t = text || newHighlight.text;
    const p = page || newHighlight.page;
    const c = color || newHighlight.color;
    if (!p || !t) return;
    try {
      await api.post(`/books/${book.book_id}/highlights`, {
        page_number: parseInt(p),
        text_content: t,
        color: c
      });
      setNewHighlight({ page: '', text: '', color: '#c9a84c' });
      setShowHighlightBtn(false);
      setSelectedText('');
      loadHighlights();
      showMsg('Highlight saved');
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed to save highlight');
    }
  };

  const highlightSelection = () => {
    if (selectedText) {
      addHighlight(selectedText, currentPage, '#c9a84c');
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

  const containerStyle = isFullscreen ? {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    zIndex: 9999,
    background: 'var(--ink)',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 0,
    padding: 0,
    margin: 0,
    maxWidth: 'none',
    maxHeight: 'none',
  } : {
    maxWidth: '90vw',
    width: '90vw',
    height: '90vh',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    padding: 0,
  };

  return (
    <div className={isFullscreen ? '' : 'modal-overlay'}
      onClick={e => !isFullscreen && e.target === e.currentTarget && onClose()}
      style={isFullscreen ? { position: 'fixed', inset: 0, zIndex: 9998 } : undefined}>
      <div className={isFullscreen ? '' : 'modal'} style={containerStyle}>
        {/* Header */}
        <div style={{
          padding: '10px 20px',
          borderBottom: '1px solid var(--parchment-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          background: isFullscreen ? 'var(--ink-light)' : 'transparent',
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{book.title}</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--gold)' }}>by {book.author_name}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <button className="btn btn-sm btn-ghost" onClick={bookmarkCurrentPage}
              title="Bookmark current page">
              Bookmark Page
            </button>
            <button className={`btn btn-sm ${activePanel === 'bookmarks' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActivePanel(activePanel === 'bookmarks' ? null : 'bookmarks')}>
              Bookmarks ({bookmarks.length})
            </button>
            <button className={`btn btn-sm ${activePanel === 'highlights' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActivePanel(activePanel === 'highlights' ? null : 'highlights')}>
              Highlights ({highlights.length})
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setIsFullscreen(f => !f)}
              title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
              style={{ fontSize: '1.1rem', padding: '4px 8px', lineHeight: 1 }}
            >
              {isFullscreen ? '⊡' : '⊞'}
            </button>
            <button className="modal-close" onClick={onClose} title="Close (Esc)">✕</button>
          </div>
        </div>

        {msg && (
          <div style={{ padding: '6px 20px', background: 'var(--gold-dim)', color: 'var(--gold-light)', fontSize: '0.85rem', flexShrink: 0 }}>
            {msg}
          </div>
        )}

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* PDF Viewer */}
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            {fileLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <div className="spinner" />
              </div>
            ) : blobUrl && isPdf ? (
              <>
                <iframe
                  ref={iframeRef}
                  src={blobUrl}
                  style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                  title={`Reading ${book.title}`}
                />
                {/* Floating highlight button when text is selected */}
                {showHighlightBtn && selectedText && (
                  <button
                    onClick={highlightSelection}
                    style={{
                      position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                      zIndex: 10, padding: '8px 18px', borderRadius: 20,
                      background: 'var(--gold)', color: 'var(--ink)', fontWeight: 600,
                      border: 'none', cursor: 'pointer', fontSize: '0.85rem',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                    }}
                  >
                    Highlight Selection
                  </button>
                )}
              </>
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
