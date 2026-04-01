/**
 * Session Recording & Recovery System
 *
 * Records ALL user actions (tab switches, inputs, clicks) as state snapshots.
 * Snapshots are saved to localStorage every 5 seconds and on beforeunload.
 *
 * Behaviours:
 *   Manual page close  -> sessionStorage flag absent on next load -> record cleared
 *   Page refresh       -> sessionStorage flag present -> auto-restore (no dialog)
 *   Crash Test button  -> crash flag set in localStorage -> recovery dialog on next login
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** localStorage key for the session snapshot (per user) */
export const RECORD_KEY = (userId) => `bv_session_${userId}`;
/** localStorage key marking that a crash-test was triggered */
export const CRASH_FLAG_KEY = 'bv_crash_pending';
/** sessionStorage key that survives a refresh but is cleared on tab close */
export const REFRESH_FLAG = 'bv_is_refresh';

const SAVE_INTERVAL = 5000; // 5 seconds

/**
 * Hook: useSessionRecorder
 * Records the full UI state snapshot every 5 seconds.
 * Also saves synchronously on beforeunload (catches last-second changes).
 *
 * @param {string} portal        'student' | 'author' | 'librarian'
 * @param {string} activeTab     current active tab / screen name
 * @param {object} stateSnapshot all relevant state values to preserve
 */
export function useSessionRecorder(portal, activeTab, stateSnapshot) {
  const { user } = useAuth();
  const timerRef = useRef(null);
  // Ref so interval/beforeunload handlers always see the latest state
  // without needing to re-register on every render.
  const latestRef = useRef({ portal, activeTab, stateSnapshot });
  useEffect(() => {
    latestRef.current = { portal, activeTab, stateSnapshot };
  });

  const saveRecord = useCallback(() => {
    if (!user) return;
    const { portal: p, activeTab: t, stateSnapshot: s } = latestRef.current;
    try {
      localStorage.setItem(RECORD_KEY(user.id), JSON.stringify({
        userId: user.id,
        portal: p,
        activeTab: t,
        stateSnapshot: s,
        updatedAt: new Date().toISOString(),
      }));
    } catch { /* quota exceeded – ignore */ }
  }, [user]);

  // Periodic save every 5 seconds
  useEffect(() => {
    timerRef.current = setInterval(saveRecord, SAVE_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [saveRecord]);

  // Synchronous final save on browser unload (refresh or close)
  useEffect(() => {
    const handleBeforeUnload = () => saveRecord();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveRecord]);

  return { saveRecord };
}

/**
 * CrashRecoveryDialog
 * Shown only after the Crash Test button was used and the user logs back in.
 */
export function CrashRecoveryDialog({ record, onRecover, onDismiss }) {
  return (
    <div className="modal-overlay" style={{ zIndex: 2000 }}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
            Crash Recovery
          </h3>
        </div>

        <div className="alert alert-info mb-4">
          A simulated crash was detected. Restore your last session?
        </div>

        <div style={{ background: 'var(--ink-3)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--slate)' }}>Portal:</span>
              <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{record.portal}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--slate)' }}>Last Screen:</span>
              <span style={{ fontWeight: 500 }}>{record.activeTab}</span>
            </div>
            {record.stateSnapshot?.readingBook && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--slate)' }}>Reading:</span>
                <span style={{ fontWeight: 500 }}>{record.stateSnapshot.readingBook.title || 'A book'}</span>
              </div>
            )}
            {record.stateSnapshot?.form?.title && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--slate)' }}>Draft Title:</span>
                <span style={{ fontWeight: 500 }}>{record.stateSnapshot.form.title}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--slate)' }}>Saved At:</span>
              <span style={{ fontWeight: 500 }}>{new Date(record.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button className="btn btn-ghost" onClick={onDismiss}>
            Start Fresh
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onRecover}>
            Restore Session
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * CrashTestButton
 * Flushes the current state, marks a crash flag in localStorage, removes the
 * refresh flag from sessionStorage (so the next page-load is treated as a
 * fresh start that checks for crash recovery), then logs the user out.
 */
export function CrashTestButton({ onBeforeCrash }) {
  const [confirming, setConfirming] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const simulateCrash = async () => {
    // Flush the very latest state before leaving
    if (onBeforeCrash) await onBeforeCrash();
    // Persist a crash flag so the recovery dialog appears after next login
    try {
      localStorage.setItem(CRASH_FLAG_KEY, JSON.stringify({
        userId: user?.id,
        triggeredAt: new Date().toISOString(),
      }));
    } catch { /* ignore */ }
    // Clear the refresh flag so next load is treated as crash, not refresh
    sessionStorage.removeItem(REFRESH_FLAG);
    logout();
    navigate('/login');
  };

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--ruby-light)' }}>Simulate crash?</span>
        <button className="btn btn-danger btn-sm" onClick={simulateCrash}>Yes</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>No</button>
      </div>
    );
  }

  return (
    <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)}
      style={{ color: 'var(--ruby-light)', borderColor: 'rgba(179,73,73,0.3)' }}
      title="Simulate system crash for testing recovery">
      Crash Test
    </button>
  );
}
