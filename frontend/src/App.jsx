/**
 * Main App Component
 * Handles routing and role-based portal redirection
 */
import { useState, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import StudentPortal from './pages/StudentPortal';
import AuthorPortal from './pages/AuthorPortal';
import LibrarianPortal from './pages/LibrarianPortal';
import { CrashRecoveryDialog, RECORD_KEY, CRASH_FLAG_KEY, REFRESH_FLAG } from './components/CrashRecovery';
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
 * On mount it reads the sessionStorage refresh flag (set by beforeunload before
 * every unload event) to decide whether this page-load is:
 *   - a manual close + reopen  -> no refresh flag  -> clear stale record
 *   - a page refresh            -> refresh flag     -> auto-restore from record
 *   - a crash-test recovery     -> crash flag       -> show recovery dialog
 *
 * Children are NOT rendered until the recovery check finishes, ensuring portals
 * initialise their state lazily with the correct recoveryState in context.
 */
function CrashRecoveryWrapper({ children }) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Read the refresh flag SYNCHRONOUSLY at component creation (before any effect).
  // useRef so re-renders don't re-read it (it will be cleared by the effect).
  const isRefreshRef = useRef(sessionStorage.getItem(REFRESH_FLAG) === 'true');

  const [recoveryState, setRecoveryState] = useState(null);
  // recoveryReady gates children rendering until we know what to restore
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [showCrashDialog, setShowCrashDialog] = useState(false);
  const [crashRecord, setCrashRecord] = useState(null);
  const [recoveryMsg, setRecoveryMsg] = useState('');
  // Track which userId we have already processed so crash-test logout+login works
  const lastHandledUserRef = useRef(null);

  // Register beforeunload: marks the NEXT page load as a refresh
  // (sessionStorage is cleared when the tab is closed, so a fresh open won't see it)
  useEffect(() => {
    sessionStorage.removeItem(REFRESH_FLAG); // clear the flag we already read
    const handler = () => sessionStorage.setItem(REFRESH_FLAG, 'true');
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Reset state when user logs out
  useEffect(() => {
    if (!user) {
      lastHandledUserRef.current = null;
      setShowCrashDialog(false);
      setCrashRecord(null);
      setRecoveryState(null);
      setRecoveryReady(false);
    }
  }, [user]);

  // Main recovery logic: runs once per user session
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      // Not logged in — allow login/register pages to render
      setRecoveryReady(true);
      return;
    }

    if (lastHandledUserRef.current === user.id) return;
    lastHandledUserRef.current = user.id;

    const wasRefresh = isRefreshRef.current;
    isRefreshRef.current = false;

    if (wasRefresh) {
      // ---- PAGE REFRESH: silently restore last state ----
      try {
        const raw = localStorage.getItem(RECORD_KEY(user.id));
        if (raw) {
          const record = JSON.parse(raw);
          if (record.userId === user.id) {
            setRecoveryState({
              screen: record.activeTab,
              portal: record.portal,
              ...record.stateSnapshot,
            });
            setRecoveryMsg('Session restored');
            setTimeout(() => setRecoveryMsg(''), 2500);
          }
        }
      } catch { /* corrupted record – ignore */ }
      setRecoveryReady(true);
    } else {
      // ---- FRESH LOAD: check for crash-test flag ----
      try {
        const flagRaw = localStorage.getItem(CRASH_FLAG_KEY);
        if (flagRaw) {
          const { userId } = JSON.parse(flagRaw);
          if (userId === user.id) {
            const raw = localStorage.getItem(RECORD_KEY(user.id));
            if (raw) {
              const record = JSON.parse(raw);
              if (record.userId === user.id) {
                setCrashRecord(record);
                setShowCrashDialog(true);
                setRecoveryReady(true);
                return;
              }
            }
          }
          // Stale flag for a different user
          localStorage.removeItem(CRASH_FLAG_KEY);
        } else {
          // Genuine fresh start: remove any stale record
          localStorage.removeItem(RECORD_KEY(user.id));
        }
      } catch {
        localStorage.removeItem(CRASH_FLAG_KEY);
      }
      setRecoveryReady(true);
    }
  }, [user, authLoading]);

  const clearRecoveryState = useCallback(() => setRecoveryState(null), []);

  const handleCrashRecover = () => {
    if (!crashRecord) return;
    try {
      const portalMap = { student: '/student', staff: '/student', author: '/author', librarian: '/librarian' };
      const target = portalMap[crashRecord.portal] || portalMap[user?.role] || '/portal';
      setRecoveryState({
        screen: crashRecord.activeTab,
        portal: crashRecord.portal,
        ...crashRecord.stateSnapshot,
      });
      navigate(target);
      setRecoveryMsg('Session restored successfully!');
      setTimeout(() => setRecoveryMsg(''), 4000);
    } catch {
      setRecoveryMsg('Restoration failed');
      setTimeout(() => setRecoveryMsg(''), 4000);
    }
    localStorage.removeItem(CRASH_FLAG_KEY);
    setShowCrashDialog(false);
    setCrashRecord(null);
  };

  const handleCrashDismiss = () => {
    localStorage.removeItem(CRASH_FLAG_KEY);
    localStorage.removeItem(RECORD_KEY(user?.id));
    setShowCrashDialog(false);
    setCrashRecord(null);
  };

  // Block children until recovery check is complete (prevents portals from
  // initialising with stale/empty defaults before the record is read)
  if (!recoveryReady) {
    return (
      <RecoveryContext.Provider value={{ recoveryState: null, clearRecoveryState }}>
        <div className="loading-screen"><div className="spinner" /></div>
      </RecoveryContext.Provider>
    );
  }

  return (
    <RecoveryContext.Provider value={{ recoveryState, clearRecoveryState }}>
      {showCrashDialog && crashRecord && (
        <CrashRecoveryDialog
          record={crashRecord}
          onRecover={handleCrashRecover}
          onDismiss={handleCrashDismiss}
        />
      )}
      {recoveryMsg && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 3000,
          padding: '12px 20px', borderRadius: 8,
          background: recoveryMsg.includes('success') ? 'var(--emerald-dim)' : 'var(--ruby-dim)',
          color: recoveryMsg.includes('success') ? 'var(--emerald-light)' : 'var(--ruby-light)',
          border: `1px solid ${recoveryMsg.includes('success') ? 'rgba(45,155,111,0.3)' : 'rgba(179,73,73,0.3)'}`,
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
