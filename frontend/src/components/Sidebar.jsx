/**
 * Sidebar Navigation Component
 * Shared layout component for all portals
 */
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ navItems, activeTab, onTabChange }) {
  const { user, logout } = useAuth();

  const initial = user?.full_name?.[0]?.toUpperCase() || '?';

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          📚 <span>Biblio<span style={{ color: 'var(--gold)' }}>Vault</span></span>
        </div>
        <div className="sidebar-tagline">E-Book Library System</div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">Navigation</div>
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-btn ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => onTabChange(item.id)}
          >
            <span className="icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* User Info & Logout */}
      <div className="sidebar-footer">
        <div className="user-card">
          <div className="user-avatar">{initial}</div>
          <div className="user-info">
            <div className="user-name">{user?.full_name}</div>
            <div className="user-role">{user?.role}</div>
          </div>
          <button className="logout-btn" onClick={logout} title="Sign out">⏻</button>
        </div>
      </div>
    </aside>
  );
}
