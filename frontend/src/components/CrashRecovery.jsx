/**
 * Crash Recovery System
 * Saves state periodically and offers recovery after crash/reload
 * Persists to both backend and localStorage for reliability
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

const LS_KEY = 'bibliovault_crash_recovery';

/**
 * Hook for crash recovery state management
 * @param {string} portal - Portal identifier (student, author, librarian)
 * @param {string} activeTab - Current active tab
 * @param {object} stateData - Current state to save (search, filters, reading book, etc.)
 */
export function useCrashRecovery(portal, activeTab, stateData = {}) {
  const { user } = useAuth();
  const saveTimer = useRef(null);

  // Save state on tab changes and periodically
  const saveState = useCallback(async () => {
    if (!user) return;
    const payload = { screen: activeTab, portal, state_data: stateData };

    // Always save to localStorage (instant, reliable)
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        ...payload,
        user_id: user.id,
        updated_at: new Date().toISOString()
      }));
    } catch {}

    // Also save to backend
    try {
      await api.post('/recovery/save', payload);
    } catch {}
  }, [user, activeTab, portal, stateData]);

  // Save on every tab change
  useEffect(() => {
    saveState();
  }, [activeTab]);

  // Periodic save every 30 seconds
  useEffect(() => {
    saveTimer.current = setInterval(saveState, 30000);
    return () => clearInterval(saveTimer.current);
  }, [saveState]);

  // Save before unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Save to localStorage synchronously
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({
          screen: activeTab, portal, state_data: stateData,
          user_id: user?.id,
          updated_at: new Date().toISOString()
        }));
      } catch {}

      // Use sendBeacon for reliable save to backend on close
      const token = localStorage.getItem('token');
      if (!token || !user) return;
      navigator.sendBeacon('/api/recovery/save',
        new Blob([JSON.stringify({
          screen: activeTab, portal, state_data: stateData,
          _token: token
        })], { type: 'application/json' })
      );
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeTab, portal, stateData, user]);

  return { saveState };
}

/**
 * Crash Recovery Dialog
 * Shows when recovery data is available (checks both localStorage and backend)
 */
export function CrashRecoveryDialog({ onRecover, onDismiss }) {
  const { user } = useAuth();
  const [recovery, setRecovery] = useState(null);
  const [loading, setLoading] = useState(true);
  const isCrashTest = sessionStorage.getItem('bibliovault_crash_test') === '1';

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    checkRecovery();
  }, [user]);

  const checkRecovery = async () => {
    let best = null;

    // Check localStorage first (faster, more reliable for crash)
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.user_id === user.id && parsed.screen) {
          best = { ...parsed, has_recovery: true };
        }
      }
    } catch {}

    // Also check backend
    try {
      const { data } = await api.get('/recovery/state');
      if (data.has_recovery) {
        // Use whichever is newer
        if (!best || (data.updated_at && new Date(data.updated_at) > new Date(best.updated_at))) {
          best = data;
        }
      }
    } catch {}

    if (best?.has_recovery) {
      setRecovery(best);
    }
    setLoading(false);
  };

  const handleRecover = () => {
    if (recovery) {
      onRecover(recovery);
    }
    clearRecovery();
  };

  const handleDismiss = () => {
    clearRecovery();
    onDismiss?.();
  };

  const clearRecovery = async () => {
    try { localStorage.removeItem(LS_KEY); } catch {}
    try { await api.delete('/recovery/clear'); } catch {}
    setRecovery(null);
  };

  if (loading || !recovery) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 2000 }}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
            {isCrashTest ? 'Crash Recovery' : 'Session Recovery'}
          </h3>
        </div>

        <div className="alert alert-info mb-4">
          {isCrashTest
            ? 'A simulated crash was detected. Attempting to restore your last state.'
            : 'A previous session was found. Would you like to restore your last state?'}
        </div>

        <div style={{ background: 'var(--ink-3)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--slate)' }}>Portal:</span>
              <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{recovery.portal}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--slate)' }}>Last Screen:</span>
              <span style={{ fontWeight: 500 }}>{recovery.screen}</span>
            </div>
            {recovery.state_data?.readingBook && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--slate)' }}>Reading:</span>
                <span style={{ fontWeight: 500 }}>{recovery.state_data.readingBook.title || 'A book'}</span>
              </div>
            )}
            {recovery.state_data?.currentPage && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--slate)' }}>Page:</span>
                <span style={{ fontWeight: 500 }}>{recovery.state_data.currentPage}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--slate)' }}>Saved At:</span>
              <span style={{ fontWeight: 500 }}>{new Date(recovery.updated_at).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button className="btn btn-ghost" onClick={handleDismiss}>
            Start Fresh
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleRecover}>
            Restore Session
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Crash Test Button
 * Simulates a system crash for testing recovery
 */
export function CrashTestButton({ onBeforeCrash }) {
  const [confirming, setConfirming] = useState(false);

  const simulateCrash = async () => {
    // Save state explicitly before "crash" (in a real crash beforeunload wouldn't fire)
    if (onBeforeCrash) await onBeforeCrash();
    // Mark this as a crash (not a normal reload) so recovery can distinguish
    sessionStorage.setItem('bibliovault_crash_test', '1');
    // Force reload simulating abrupt termination
    window.location.reload();
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
