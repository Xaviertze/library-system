/**
 * Main App Component
 * Handles routing and role-based portal redirection
 */
import { useState, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import StudentPortal from './pages/StudentPortal';
import AuthorPortal from './pages/AuthorPortal';
import LibrarianPortal from './pages/LibrarianPortal';
import { RECORD_KEY, REFRESH_FLAG, SHOULD_CLEAR_KEY, CRASH_TEST_CLOSE_KEY } from './components/CrashRecovery';
import './styles/global.css';

// Context for passing recovery state to portals
export const RecoveryContext = createContext({ recoveryState: null, clearRecoveryState: () => {} });
export const useRecovery = () => useContext(RecoveryContext);

/**
 * Protected route wrapper — redirects to login if not authenticated
 * Also enforces role-based access
 */
function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/portal" replace />;
  }
  return children;
}

/**
 * Smart portal redirect — sends users to the right portal based on role
 */
function PortalRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  const portalMap = {
    student: '/student',
    staff: '/student',       // Staff shares student portal
    author: '/author',
    librarian: '/librarian',
  };
  return <Navigate to={portalMap[user.role] || '/login'} replace />;
}

/**
 * Session-recording wrapper.
 *
 * Reads flags on mount to decide how to handle the current page-load:
 *   page refresh    -> REFRESH_FLAG in sessionStorage  -> cancel cleanup, auto-restore record
 *   crash test      -> CRASH_TEST_CLOSE_KEY in localStorage -> auto-restore record
 *   manual close    -> SHOULD_CLEAR_KEY in localStorage    -> delete stale record, fresh start
 *   actual crash    -> no flags at all                     -> record survived, auto-restore
 *   logout          -> user transitions null               -> delete record immediately
 *
 * Children are NOT rendered until the recovery check finishes, ensuring portals
 * initialise with the correct recoveryState already in context.
 */
function CrashRecoveryWrapper({ children }) {
  const { user, loading: authLoading } = useAuth();

  // Read the refresh flag SYNCHRONOUSLY at component creation (before any effect).
  const isRefreshRef = useRef(sessionStorage.getItem(REFRESH_FLAG) === 'true');

  const [recoveryState, setRecoveryState] = useState(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryMsg, setRecoveryMsg] = useState('');
  const lastHandledUserRef = useRef(null);
  const prevUserRef = useRef(null);

  // Clear the refresh flag we already consumed
  useEffect(() => {
    sessionStorage.removeItem(REFRESH_FLAG);
  }, []);

  // Logout cleanup: when user transitions from logged-in to null, delete the record
  useEffect(() => {
    if (prevUserRef.current && !user) {
      const userId = prevUserRef.current.id;
      localStorage.removeItem(RECORD_KEY(userId));
      localStorage.removeItem(SHOULD_CLEAR_KEY);
    }
    prevUserRef.current = user;
  }, [user]);

  // Reset recovery gate when user logs out so next login re-runs the check
  useEffect(() => {
    if (!user) {
      lastHandledUserRef.current = null;
      setRecoveryState(null);
      setRecoveryReady(false);
    }
  }, [user]);

  // Main recovery logic: runs once per user login
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setRecoveryReady(true);
      return;
    }

    if (lastHandledUserRef.current === user.id) return;
    lastHandledUserRef.current = user.id;

    const wasRefresh = isRefreshRef.current;
    isRefreshRef.current = false;

    const wasCrashTest = !!localStorage.getItem(CRASH_TEST_CLOSE_KEY);
    if (wasCrashTest) localStorage.removeItem(CRASH_TEST_CLOSE_KEY);

    let shouldClearUserId = null;
    try {
      const raw = localStorage.getItem(SHOULD_CLEAR_KEY);
      if (raw) shouldClearUserId = JSON.parse(raw).userId;
    } catch {}

    if (wasRefresh) {
      // Page refresh: cancel pending cleanup and restore
      localStorage.removeItem(SHOULD_CLEAR_KEY);
      tryRestore(user.id, 'Session restored');
    } else if (wasCrashTest) {
      // Crash test: record was intentionally preserved — restore it
      localStorage.removeItem(SHOULD_CLEAR_KEY);
      tryRestore(user.id, 'Session recovered after crash test');
    } else {
      // Actual crash (no flags): record survived, restore it
      localStorage.removeItem(SHOULD_CLEAR_KEY);
      tryRestore(user.id, 'Session recovered');
    }

    setRecoveryReady(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const tryRestore = (userId, msg) => {
    try {
      const raw = localStorage.getItem(RECORD_KEY(userId));
      if (raw) {
        const record = JSON.parse(raw);
        if (String(record.userId) === String(userId)) {
          setRecoveryState({
            screen: record.activeTab,
            portal: record.portal,
            ...record.stateSnapshot,
          });
          setRecoveryMsg(msg);
          setTimeout(() => setRecoveryMsg(''), 3000);
        }
      }
    } catch { /* corrupted record – ignore */ }
  };

  const clearRecoveryState = useCallback(() => setRecoveryState(null), []);

  // Block children until recovery check is complete
  if (!recoveryReady) {
    return (
      <RecoveryContext.Provider value={{ recoveryState: null, clearRecoveryState }}>
        <div className="loading-screen"><div className="spinner" /></div>
      </RecoveryContext.Provider>
    );
  }

  return (
    <RecoveryContext.Provider value={{ recoveryState, clearRecoveryState }}>
      {recoveryMsg && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 3000,
          padding: '12px 20px', borderRadius: 8,
          background: 'var(--emerald-dim)',
          color: 'var(--emerald-light)',
          border: '1px solid rgba(45,155,111,0.3)',
          fontSize: '0.9rem', animation: 'fadeIn 0.2s ease'
        }}>
          {recoveryMsg}
        </div>
      )}
      {children}
    </RecoveryContext.Provider>
  );
}

function AppRoutes() {
  return (
    <CrashRecoveryWrapper>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/portal" element={<PortalRedirect />} />

        <Route path="/student" element={
          <ProtectedRoute allowedRoles={['student', 'staff']}>
            <StudentPortal />
          </ProtectedRoute>
        } />

        <Route path="/author" element={
          <ProtectedRoute allowedRoles={['author']}>
            <AuthorPortal />
          </ProtectedRoute>
        } />

        <Route path="/librarian" element={
          <ProtectedRoute allowedRoles={['librarian']}>
            <LibrarianPortal />
          </ProtectedRoute>
        } />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/portal" replace />} />
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes>
    </CrashRecoveryWrapper>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
