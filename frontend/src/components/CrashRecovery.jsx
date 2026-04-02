/**
 * Session Recording & Recovery System
 *
 * Records ALL user actions (tab switches, inputs, filter/search changes) as
 * state snapshots stored in localStorage, keyed per user.
 *
 * Recovery logic:
 *   Page refresh       -> REFRESH_FLAG survives in sessionStorage -> auto-restore
 *   Manual tab close   -> SHOULD_CLEAR_KEY set in localStorage -> record cleared on next open
 *   Actual crash       -> no flags set -> record survives -> auto-restore on next login
 *   Crash Test button  -> CRASH_TEST_CLOSE_KEY set -> record survives -> auto-restore on next login
 *   Logout             -> record cleared immediately
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

/** localStorage key for the session snapshot (per user) */
export const RECORD_KEY = (userId) => `bv_session_${userId}`;
/** sessionStorage key: present after refresh, gone after tab close */
export const REFRESH_FLAG = 'bv_is_refresh';
/** localStorage key: set on normal beforeunload so next fresh open clears the record */
export const SHOULD_CLEAR_KEY = 'bv_should_clear';
/** localStorage key: set before crash-test window.close() to preserve the record */
export const CRASH_TEST_CLOSE_KEY = 'bv_crash_test';

const SAVE_INTERVAL = 5000; // 5 seconds

/**
 * Hook: useSessionRecorder
 * Saves the full UI state snapshot:
 *   - Immediately whenever the tracked state actually changes
 *   - Every 5 seconds as a periodic safety save
 *   - Synchronously on beforeunload
 *
 * @param {string} portal        'student' | 'author' | 'librarian'
 * @param {string} activeTab     current active tab / screen name
 * @param {object} stateSnapshot all relevant state values to preserve
 */
export function useSessionRecorder(portal, activeTab, stateSnapshot) {
  const { user } = useAuth();
  const latestRef = useRef({ portal, activeTab, stateSnapshot });
  const prevSnapshotKeyRef = useRef('');

  // Keep the ref in sync on every render
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

  // Save immediately whenever any tracked value actually changes
  useEffect(() => {
    const key = JSON.stringify({ portal, activeTab, stateSnapshot });
    if (key !== prevSnapshotKeyRef.current) {
      prevSnapshotKeyRef.current = key;
      saveRecord();
    }
  });

  // Periodic safety save every 5 seconds
  useEffect(() => {
    const timerId = setInterval(saveRecord, SAVE_INTERVAL);
    return () => clearInterval(timerId);
  }, [saveRecord]);

  // On unload: flush latest state and set cleanup/refresh flags
  useEffect(() => {
    if (!user) return;
    const handleBeforeUnload = () => {
      saveRecord();
      const isCrashTest = !!localStorage.getItem(CRASH_TEST_CLOSE_KEY);
      if (!isCrashTest) {
        // Schedule the record for deletion on next fresh open (manual close)
        localStorage.setItem(SHOULD_CLEAR_KEY, JSON.stringify({ userId: user.id }));
        // Tell the next page load that this was a refresh (survives refresh, not close)
        sessionStorage.setItem(REFRESH_FLAG, 'true');
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveRecord, user]);

  return { saveRecord };
}

/**
 * CrashTestButton
 * Flushes the current state, sets a crash-test marker so the beforeunload
 * handler skips its usual cleanup, then closes the entire browser tab.
 * On next login the surviving record is automatically restored.
 */
export function CrashTestButton({ onBeforeCrash }) {
  const [confirming, setConfirming] = useState(false);

  const simulateCrash = async () => {
      // Do NOT call onBeforeCrash and do NOT write to localStorage —
      // the button click itself must not be recorded as a recoverable action.
      try {
          await fetch('http://localhost:5000/api/shutdown', { method: 'POST' });
      } catch {
          // Expected: the server may close the connection before sending a response
      }
  };

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--ruby-light)' }}>Close this page?</span>
        <button className="btn btn-danger btn-sm" onClick={simulateCrash}>Yes, Close</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
      </div>
    );
  }

  return (
    <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)}
      style={{ color: 'var(--ruby-light)', borderColor: 'rgba(179,73,73,0.3)' }}
      title="Simulate a crash – closes the page; session is recoverable on next login">
      Crash Test
    </button>
  );
}
