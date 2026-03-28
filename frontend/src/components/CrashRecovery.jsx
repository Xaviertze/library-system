/**
 * Crash Recovery System
 * Saves state periodically and offers recovery after crash/reload
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

/**
 * Hook for crash recovery state management
 * @param {string} portal - Portal identifier (student, author, librarian)
 * @param {string} activeTab - Current active tab
 * @param {object} stateData - Current state to save
 */
export function useCrashRecovery(portal, activeTab, stateData = {}) {
  const { user } = useAuth();
  const saveTimer = useRef(null);

  // Save state on tab changes and periodically
  const saveState = useCallback(async () => {
    if (!user) return;
    try {
      await api.post('/recovery/save', {
        screen: activeTab,
        portal,
        state_data: stateData
      });
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
      // Use sendBeacon for reliable save on close
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
 * Shows when recovery data is available
 */
export function CrashRecoveryDialog({ onRecover, onDismiss }) {
  const { user } = useAuth();
  const [recovery, setRecovery] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    checkRecovery();
  }, [user]);

  const checkRecovery = async () => {
    try {
      const { data } = await api.get('/recovery/state');
      if (data.has_recovery) {
        setRecovery(data);
      }
    } catch {}
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
    try { await api.delete('/recovery/clear'); } catch {}
    setRecovery(null);
  };

  if (loading || !recovery) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 2000 }}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
            Session Recovery
          </h3>
        </div>

        <div className="alert alert-info mb-4">
          A previous session was found. Would you like to restore your last state?
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
    if (onBeforeCrash) await onBeforeCrash();
    // Force reload to simulate crash
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
