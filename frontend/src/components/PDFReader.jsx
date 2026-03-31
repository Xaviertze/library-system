/**
 * PDF Reader Component
 * Full-screen PDF viewer with bookmark and highlight management
 * Uses PDF.js for proper text layer support (selectable text, highlights)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import api from '../utils/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const SCALE = 1.5;

export default function PDFReader({ book, onClose }) {
  const [bookmarks, setBookmarks] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [newBookmark, setNewBookmark] = useState({ page: '', label: '' });
  const [newHighlight, setNewHighlight] = useState({ page: '', text: '', color: '#c9a84c' });
  const [activePanel, setActivePanel] = useState(null);
  const [msg, setMsg] = useState('');
  const [fileLoading, setFileLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedText, setSelectedText] = useState('');
  const [showHighlightBtn, setShowHighlightBtn] = useState(false);
  const [highlightColor, setHighlightColor] = useState('#c9a84c');
  const [loadError, setLoadError] = useState(false);

  const pdfDocRef = useRef(null);
  const containerRef = useRef(null);
  const renderedPagesRef = useRef(new Set());
  const pageElemsRef = useRef({});
  const observerRef = useRef(null);
  const highlightsRef = useRef([]);

  useEffect(() => { highlightsRef.current = highlights; }, [highlights]);

  useEffect(() => {
    loadBookmarks();
    loadHighlights();
    loadPdf();
    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [book.book_id]);

  // Escape key
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

  // Text selection detection
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      const text = sel?.toString()?.trim();
      if (text && text.length > 0 && containerRef.current) {
        const anchorNode = sel.anchorNode;
        if (anchorNode && containerRef.current.contains(anchorNode)) {
          setSelectedText(text);
          setShowHighlightBtn(true);
          // Determine page from ancestor
          let node = anchorNode;
          while (node && node !== containerRef.current) {
            if (node.dataset?.page) {
              setCurrentPage(parseInt(node.dataset.page));
              break;
            }
            node = node.parentNode;
          }
          return;
        }
      }
      setShowHighlightBtn(false);
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const loadPdf = async () => {
    setFileLoading(true);
    setLoadError(false);
    try {
      const response = await api.get(`/books/view/${book.book_id}`, { responseType: 'arraybuffer' });
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(response.data) }).promise;
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);
      setupPages(pdf);
    } catch {
      setLoadError(true);
    } finally {
      setFileLoading(false);
    }
  };

  const setupPages = async (pdf) => {
    const container = containerRef.current;
    if (!container || !pdf) return;
    container.innerHTML = '';
    renderedPagesRef.current = new Set();
    pageElemsRef.current = {};

    const firstPage = await pdf.getPage(1);
    const viewport = firstPage.getViewport({ scale: SCALE });

    for (let i = 1; i <= pdf.numPages; i++) {
      const pageDiv = document.createElement('div');
      pageDiv.className = 'pdf-page-container';
      pageDiv.dataset.page = String(i);
      pageDiv.style.cssText = `
        width: ${viewport.width}px; height: ${viewport.height}px;
        margin: 0 auto 20px auto; position: relative;
        background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      `;
      const label = document.createElement('div');
      label.className = 'pdf-page-label';
      label.textContent = `Page ${i}`;
      pageDiv.appendChild(label);
      container.appendChild(pageDiv);
      pageElemsRef.current[i] = pageDiv;
    }

    // IntersectionObserver for lazy rendering
    if (observerRef.current) observerRef.current.disconnect();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            renderPage(parseInt(entry.target.dataset.page));
          }
        });
      },
      { root: container, rootMargin: '300px 0px', threshold: 0.01 }
    );
    Object.values(pageElemsRef.current).forEach(el => observer.observe(el));
    observerRef.current = observer;

    container.addEventListener('scroll', handleScroll);
    renderPage(1);
  };

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const scrollCenter = container.scrollTop + container.clientHeight / 2;
    let closestPage = 1;
    let closestDist = Infinity;
    for (const [num, el] of Object.entries(pageElemsRef.current)) {
      const dist = Math.abs(el.offsetTop + el.offsetHeight / 2 - scrollCenter);
      if (dist < closestDist) { closestDist = dist; closestPage = parseInt(num); }
    }
    setCurrentPage(closestPage);
  }, []);

  const renderPage = async (pageNum) => {
    const pdf = pdfDocRef.current;
    if (!pdf || renderedPagesRef.current.has(pageNum)) return;
    renderedPagesRef.current.add(pageNum);

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: SCALE });
    const pageDiv = pageElemsRef.current[pageNum];
    if (!pageDiv) return;

    pageDiv.innerHTML = '';

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.display = 'block';
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    pageDiv.appendChild(canvas);

    // Text layer
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'pdf-text-layer';
    textLayerDiv.style.cssText = `
      position: absolute; top: 0; left: 0;
      width: ${viewport.width}px; height: ${viewport.height}px;
    `;
    const textContent = await page.getTextContent();
    await pdfjsLib.renderTextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport,
    }).promise;
    pageDiv.appendChild(textLayerDiv);

    // Page label
    const label = document.createElement('div');
    label.className = 'pdf-page-label';
    label.textContent = `Page ${pageNum}`;
    pageDiv.appendChild(label);

    applyHighlightsToPage(pageNum, textLayerDiv);
  };

  const applyHighlightsToPage = (pageNum, textLayerDiv) => {
    const pageHighlights = highlightsRef.current.filter(h => h.page_number === pageNum);
    if (pageHighlights.length === 0) return;
    const spans = textLayerDiv.querySelectorAll('span');
    for (const hl of pageHighlights) {
      const hlText = hl.text_content.toLowerCase();
      // Build combined text to find multi-span highlights
      let accumulated = '';
      const matchSpans = [];
      for (const span of spans) {
        const t = span.textContent;
        if (!t) continue;
        accumulated += t;
        matchSpans.push(span);
        if (accumulated.toLowerCase().includes(hlText)) {
          // Highlight all accumulated spans that are part of the match
          for (const ms of matchSpans) {
            ms.style.backgroundColor = hl.color || '#c9a84c';
            ms.style.borderRadius = '2px';
          }
          accumulated = '';
          matchSpans.length = 0;
        }
        // If accumulated gets too long without matching, slide forward
        if (accumulated.length > hlText.length * 3) {
          matchSpans.shift();
          accumulated = matchSpans.map(s => s.textContent).join('');
        }
      }
    }
  };

  // Re-apply highlights when highlights list changes
  useEffect(() => {
    for (const pageNum of renderedPagesRef.current) {
      const pageDiv = pageElemsRef.current[pageNum];
      if (!pageDiv) continue;
      const textLayer = pageDiv.querySelector('.pdf-text-layer');
      if (!textLayer) continue;
      // Reset
      textLayer.querySelectorAll('span').forEach(s => {
        s.style.backgroundColor = '';
        s.style.borderRadius = '';
      });
      applyHighlightsToPage(pageNum, textLayer);
    }
  }, [highlights]);

  const goToPage = (pageNum) => {
    const p = Math.max(1, Math.min(pageNum, totalPages));
    setCurrentPage(p);
    const el = pageElemsRef.current[p];
    if (el && containerRef.current) {
      containerRef.current.scrollTo({ top: el.offsetTop - 10, behavior: 'smooth' });
      renderPage(p);
    }
  };

  // --- Bookmark & Highlight CRUD ---
  const loadBookmarks = async () => {
    try { const { data } = await api.get(`/books/${book.book_id}/bookmarks`); setBookmarks(data); } catch {}
  };
  const loadHighlights = async () => {
    try { const { data } = await api.get(`/books/${book.book_id}/highlights`); setHighlights(data); } catch {}
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

  const bookmarkCurrentPage = () => addBookmark(currentPage, `Page ${currentPage}`);

  const removeBookmark = async (id) => {
    try { await api.delete(`/books/bookmarks/${id}`); loadBookmarks(); showMsg('Bookmark removed'); } catch {}
  };

  const addHighlight = async (text, page, color) => {
    const t = text || newHighlight.text;
    const p = page || newHighlight.page;
    const c = color || newHighlight.color;
    if (!p || !t) return;
    try {
      await api.post(`/books/${book.book_id}/highlights`, {
        page_number: parseInt(p), text_content: t, color: c
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
    if (selectedText) addHighlight(selectedText, currentPage, highlightColor);
  };

  const removeHighlight = async (id) => {
    try { await api.delete(`/books/highlights/${id}`); loadHighlights(); showMsg('Highlight removed'); } catch {}
  };

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  const isPdf = book.file_name?.toLowerCase().endsWith('.pdf');

  const containerStyle = isFullscreen ? {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    zIndex: 9999, background: 'var(--ink)', display: 'flex', flexDirection: 'column',
    borderRadius: 0, padding: 0, margin: 0, maxWidth: 'none', maxHeight: 'none',
  } : {
    maxWidth: '90vw', width: '90vw', height: '90vh', maxHeight: '90vh',
    display: 'flex', flexDirection: 'column', padding: 0,
  };

  return (
    <div className={isFullscreen ? '' : 'modal-overlay'}
      onClick={e => !isFullscreen && e.target === e.currentTarget && onClose()}
      style={isFullscreen ? { position: 'fixed', inset: 0, zIndex: 9998 } : undefined}>
      <div className={isFullscreen ? '' : 'modal'} style={containerStyle}>
        {/* Header */}
        <div style={{
          padding: '10px 20px', borderBottom: '1px solid var(--parchment-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0, background: isFullscreen ? 'var(--ink-light)' : 'transparent',
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{book.title}</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--gold)' }}>by {book.author_name}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--slate)' }}>Page:</span>
              <input
                type="number" min="1" max={totalPages || undefined} value={currentPage}
                onChange={e => { const v = parseInt(e.target.value); if (v >= 1) goToPage(v); }}
                style={{ width: 52, padding: '3px 6px', fontSize: '0.82rem', textAlign: 'center', borderRadius: 4, border: '1px solid var(--parchment-border)', background: 'var(--ink-light)', color: 'var(--parchment)' }}
                title="Current page number"
              />
              {totalPages > 0 && <span style={{ fontSize: '0.78rem', color: 'var(--slate)' }}>/ {totalPages}</span>}
            </div>
            <button className="btn btn-sm btn-ghost" onClick={bookmarkCurrentPage} title="Bookmark current page">
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
            <button className="btn btn-sm btn-ghost" onClick={() => setIsFullscreen(f => !f)}
              title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
              style={{ fontSize: '1.1rem', padding: '4px 8px', lineHeight: 1 }}>
              {isFullscreen ? '\u2291' : '\u229E'}
            </button>
            <button className="modal-close" onClick={onClose} title="Close (Esc)">\u2715</button>
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
            ) : !loadError && isPdf ? (
              <>
                <div
                  ref={containerRef}
                  style={{
                    width: '100%', height: '100%', overflowY: 'auto',
                    background: '#525659', padding: '20px 0',
                  }}
                />
                {/* Floating highlight button when text is selected */}
                {showHighlightBtn && selectedText && (
                  <div style={{
                    position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                    zIndex: 10, display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 20,
                    background: 'var(--ink-2)', border: '1px solid var(--gold-border)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  }}>
                    {['#c9a84c', '#3dbf87', '#d45f5f', '#6b9bd2'].map(c => (
                      <button key={c} onClick={() => setHighlightColor(c)}
                        style={{
                          width: 20, height: 20, borderRadius: '50%', border: highlightColor === c ? '2px solid var(--parchment)' : '2px solid transparent',
                          background: c, cursor: 'pointer', padding: 0,
                        }} />
                    ))}
                    <button onClick={highlightSelection}
                      style={{
                        padding: '4px 14px', borderRadius: 14,
                        background: 'var(--gold)', color: 'var(--ink)', fontWeight: 600,
                        border: 'none', cursor: 'pointer', fontSize: '0.82rem',
                      }}>
                      Highlight
                    </button>
                  </div>
                )}
              </>
            ) : !loadError ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: 16 }}>📄</div>
                <p style={{ color: 'var(--slate)', marginBottom: 16 }}>
                  This file format ({book.file_name?.split('.').pop()?.toUpperCase()}) cannot be previewed in-browser.
                </p>
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
                      <button className="btn btn-primary btn-sm" onClick={() => addBookmark()} disabled={!newBookmark.page}>
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
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        cursor: 'pointer'
                      }} onClick={() => goToPage(bm.page_number)} title={`Go to page ${bm.page_number}`}>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--parchment)' }}>
                            Page {bm.page_number}
                          </div>
                          {bm.label && <div style={{ fontSize: '0.78rem', color: 'var(--slate)' }}>{bm.label}</div>}
                        </div>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }}
                          onClick={(e) => { e.stopPropagation(); removeBookmark(bm.id); }}>{'\u2715'}</button>
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
                      <button className="btn btn-primary btn-sm" onClick={() => addHighlight()}
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
                        borderLeft: `3px solid ${hl.color}`,
                        cursor: 'pointer'
                      }} onClick={() => goToPage(hl.page_number)} title={`Go to page ${hl.page_number}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--slate)' }}>Page {hl.page_number}</span>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '1px 6px', fontSize: '0.7rem' }}
                            onClick={(e) => { e.stopPropagation(); removeHighlight(hl.id); }}>{'\u2715'}</button>
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
