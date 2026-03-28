/**
 * Book Detail Modal
 * Shows book summary and borrow dialog
 */
import { useState } from 'react';
import api from '../utils/api';

export default function BookModal({ book, onClose, onBorrowed }) {
  const [duration, setDuration] = useState(7);
  const [step, setStep] = useState('detail'); // detail | confirm | success
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!book) return null;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + duration);

  const handleBorrowConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      await api.post(`/books/${book.id}/borrow`, { duration_days: duration });
      setStep('success');
      onBorrowed?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to borrow book');
      setStep('detail');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        {/* Header */}
        <div className="modal-header">
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: 4 }}>
              {book.title}
            </h3>
            <div style={{ color: 'var(--gold)', fontSize: '0.9rem' }}>by {book.author_name}</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Cover Image */}
        {book.cover_image && (
          <div style={{ marginBottom: 16, borderRadius: 8, overflow: 'hidden', maxHeight: 200 }}>
            <img src={`/${book.cover_image}`} alt={book.title}
              style={{ width: '100%', objectFit: 'cover', maxHeight: 200 }}
              onError={e => { e.target.style.display = 'none'; }} />
          </div>
        )}

        {/* Badges */}
        <div className="book-meta" style={{ marginBottom: 16 }}>
          {book.genre?.split(',').map(g => (
            <span key={g} className="badge badge-genre">{g.trim()}</span>
          ))}
          <span className={`badge ${book.availability === 'available' ? 'badge-available' : 'badge-unavailable'}`}>
            {book.availability === 'available' ? '● Available' : '● Borrowed'}
          </span>
        </div>

        {step === 'success' ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>✓</div>
            <h3 style={{ color: 'var(--emerald-light)', marginBottom: 8 }}>Borrowed Successfully!</h3>
            <p style={{ color: 'var(--slate)', fontSize: '0.9rem' }}>
              Due date: <strong style={{ color: 'var(--parchment)' }}>{dueDate.toLocaleDateString()}</strong>
            </p>
            <button className="btn btn-primary mt-4" onClick={onClose}>Close</button>
          </div>
        ) : step === 'confirm' ? (
          <div>
            <div className="alert alert-info mb-4">
              📋 Please confirm your borrowing details
            </div>
            <div style={{ background: 'var(--ink-3)', borderRadius: 8, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--slate)' }}>Book:</span>
                <span style={{ fontWeight: 500 }}>{book.title}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--slate)' }}>Duration:</span>
                <span style={{ fontWeight: 500 }}>{duration} day{duration !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--slate)' }}>Due Date:</span>
                <span style={{ fontWeight: 500, color: 'var(--gold)' }}>{dueDate.toLocaleDateString()}</span>
              </div>
            </div>
            {error && <div className="alert alert-error mb-4">⚠ {error}</div>}
            <div className="flex gap-3">
              <button className="btn btn-ghost" onClick={() => setStep('detail')}>← Back</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleBorrowConfirm} disabled={loading}>
                {loading ? 'Processing…' : 'Confirm Borrow'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Description */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--slate)', marginBottom: 8 }}>Summary</div>
              <p style={{ color: 'rgba(245,240,232,0.75)', lineHeight: 1.7, fontSize: '0.9rem' }}>{book.description}</p>
            </div>

            {/* Publish date */}
            {book.publish_date && (
              <div style={{ fontSize: '0.82rem', color: 'var(--slate)', marginBottom: 20 }}>
                📅 Published: {new Date(book.publish_date).toLocaleDateString()}
                &nbsp;•&nbsp; 📖 Borrowed {book.times_borrowed} time{book.times_borrowed !== 1 ? 's' : ''}
              </div>
            )}

            {/* Borrow controls */}
            {book.availability === 'available' ? (
              <div>
                <div className="form-group mb-4">
                  <label className="form-label">Borrow Duration (days)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1} max={14} value={duration}
                      onChange={e => setDuration(Number(e.target.value))}
                      style={{ flex: 1, accentColor: 'var(--gold)' }}
                    />
                    <span style={{ 
                      background: 'var(--gold-dim)', 
                      border: '1px solid var(--gold-border)',
                      borderRadius: 6,
                      padding: '4px 12px',
                      color: 'var(--gold)',
                      fontWeight: 600,
                      minWidth: 50,
                      textAlign: 'center'
                    }}>
                      {duration}d
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--slate)' }}>
                    Due: {dueDate.toLocaleDateString()} • Max 14 days
                  </div>
                </div>
                <button className="btn btn-primary w-full" onClick={() => setStep('confirm')}>
                  Borrow This Book
                </button>
              </div>
            ) : (
              <div className="alert alert-error">
                📕 This book is currently borrowed and unavailable.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
