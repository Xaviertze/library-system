/**
 * Main App Component
 * Handles routing and role-based portal redirection
 */
import { useState, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import StudentPortal from './pages/StudentPortal';
import AuthorPortal from './pages/AuthorPortal';
import LibrarianPortal from './pages/LibrarianPortal';
import { CrashRecoveryDialog } from './components/CrashRecovery';
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
 * Crash recovery wrapper — checks for recovery state on app load
 */
function CrashRecoveryWrapper({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recovered, setRecovered] = useState(false);
  const [recoveryMsg, setRecoveryMsg] = useState('');
  const [recoveryState, setRecoveryState] = useState(null);

  const handleRecover = (recoveryData) => {
    try {
      const portalMap = { student: '/student', staff: '/student', author: '/author', librarian: '/librarian' };
      const targetPath = portalMap[recoveryData.portal] || portalMap[user?.role] || '/portal';
      // Store state_data for the portal to pick up
      setRecoveryState({
        screen: recoveryData.screen,
        portal: recoveryData.portal,
        ...(recoveryData.state_data || {})
      });
      navigate(targetPath);
      setRecoveryMsg('Session restored successfully!');
      setTimeout(() => setRecoveryMsg(''), 4000);
    } catch {
      setRecoveryMsg('Recovery failed. Starting fresh.');
      setTimeout(() => setRecoveryMsg(''), 4000);
    }
    setRecovered(true);
  };

  return (
    <RecoveryContext.Provider value={{ recoveryState, clearRecoveryState: () => setRecoveryState(null) }}>
      {!recovered && user && (
        <CrashRecoveryDialog
          onRecover={handleRecover}
          onDismiss={() => setRecovered(true)}
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
