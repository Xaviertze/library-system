/**
 * Quick Review Modal
 * Shows first 3 pages of a PDF book as a preview before borrowing
 */
import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import api from '../utils/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const PREVIEW_PAGES = 2;
const SCALE = 1.2;

export default function QuickReview({ book, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalPages, setTotalPages] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    loadPreview();
  }, [book.id]);

  const loadPreview = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/books/quick-review/${book.id}`, { responseType: 'arraybuffer' });
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(response.data) }).promise;
      setTotalPages(pdf.numPages);
      const pagesToRender = Math.min(PREVIEW_PAGES, pdf.numPages);
      const container = containerRef.current;
      if (!container) return;
      container.innerHTML = '';

      for (let i = 1; i <= pagesToRender; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: SCALE });

        const pageDiv = document.createElement('div');
        pageDiv.style.cssText = `
          width: ${viewport.width}px; height: ${viewport.height}px;
          margin: 0 auto 16px auto; position: relative;
          background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.display = 'block';
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        pageDiv.appendChild(canvas);

        const label = document.createElement('div');
        label.className = 'pdf-page-label';
        label.textContent = `Page ${i}`;
        pageDiv.appendChild(label);

        container.appendChild(pageDiv);
      }
    } catch {
      setError('Unable to load preview for this book.');
    } finally {
      setLoading(false);
    }
  };

  const isPdf = book.file_name?.toLowerCase().endsWith('.pdf');

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '70vw', width: '70vw', height: '85vh', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        {/* Header */}
        <div style={{
          padding: '12px 20px', borderBottom: '1px solid var(--parchment-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', margin: 0 }}>
              Quick Review
            </h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--gold)' }}>
              {book.title} — by {book.author_name}
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>{'\u2715'}</button>
        </div>

        {/* Preview notice */}
        <div style={{ padding: '8px 20px', background: 'var(--gold-dim)', color: 'var(--gold-light)', fontSize: '0.82rem', flexShrink: 0 }}>
          Preview: showing first {PREVIEW_PAGES} of {totalPages > 0 ? totalPages : '...'} pages. Borrow to read the full book.
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div className="spinner" />
            </div>
          ) : error || !isPdf ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>📄</div>
              <p style={{ color: 'var(--slate)' }}>
                {error || 'Quick review is only available for PDF books.'}
              </p>
            </div>
          ) : (
            <div ref={containerRef} style={{ padding: '20px 0', background: '#525659' }} />
          )}
        </div>
      </div>
    </div>
  );
}
