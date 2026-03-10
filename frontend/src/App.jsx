/**
 * Main App Component
 * Handles routing and role-based portal redirection
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import StudentPortal from './pages/StudentPortal';
import AuthorPortal from './pages/AuthorPortal';
import LibrarianPortal from './pages/LibrarianPortal';
import './styles/global.css';

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

function AppRoutes() {
  return (
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
