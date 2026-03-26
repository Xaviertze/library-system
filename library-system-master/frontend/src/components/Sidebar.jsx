/**
 * Sidebar Navigation Component
 * Shared layout component for all portals
 */
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Profile from './Profile';

export default function Sidebar({ navItems, activeTab, onTabChange }) {
  const { user, logout } = useAuth();
  const [showProfile, setShowProfile] = useState(false);

  const initial = user?.full_name?.[0]?.toUpperCase() || '?';

  return (
    <>
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
          <div
            onClick={() => setShowProfile(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: 'var(--radius)',
              background: 'var(--parchment-dim)',
              cursor: 'pointer',
              transition: 'background var(--transition)',
              flex: 1,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(245, 240, 232, 0.12)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--parchment-dim)'}
            title="Click to edit profile"
          >
            <div className="user-avatar">{initial}</div>
            <div className="user-info">
              <div className="user-name">{user?.full_name}</div>
              <div className="user-role">{user?.role}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={logout} title="Sign out">⏻</button>
        </div>
      </aside>

      {/* Profile Modal */}
      {showProfile && <Profile onClose={() => setShowProfile(false)} />}
    </>
  );
}
