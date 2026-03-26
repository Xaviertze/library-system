/**
 * User Profile Component
 * Allows users to view and edit their profile information
 */
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

export default function Profile({ onClose }) {
  const { user, logout } = useAuth();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  // Form fields
  const [formData, setFormData] = useState({
    username: user?.username || '',
    full_name: user?.full_name || '',
    new_password: '',
    bio: user?.bio || '',
  });

  // Handle unlock with current password
  const handleUnlock = async () => {
    if (!currentPassword.trim()) {
      setPasswordError('Please enter your current password');
      return;
    }

    setLoading(true);
    setPasswordError('');

    try {
      // Verify current password by attempting to re-login
      await api.post('/auth/verify-password', {
        username: user.username,
        password: currentPassword,
      });
      setIsUnlocked(true);
    } catch (err) {
      setPasswordError(
        err.response?.data?.error || 'Incorrect password. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle save
  const handleSave = async () => {
    setSaveError('');
    setSaveSuccess('');

    // Validation
    if (!formData.full_name.trim()) {
      setSaveError('Full name is required');
      return;
    }
    if (user?.role === 'author' && !formData.bio.trim()) {
      setSaveError('Bio is required for authors');
      return;
    }

    // Check if password is too weak if being changed
    if (formData.new_password) {
      const passwordErrors = validatePassword(formData.new_password);
      if (passwordErrors.length > 0) {
        setSaveError(`Password must contain: ${passwordErrors.join(', ')}`);
        return;
      }
    }

    setLoading(true);

    try {
      const updateData = {
        full_name: formData.full_name.trim(),
        current_password: currentPassword,
      };

      // Only include new password if provided
      if (formData.new_password) {
        updateData.new_password = formData.new_password;
      }

      // Include bio for authors
      if (user?.role === 'author') {
        updateData.bio = formData.bio.trim();
      }

      const response = await api.put('/auth/profile', updateData);

      // Update localStorage with new user data
      localStorage.setItem('user', JSON.stringify(response.data.user));

      setSaveSuccess('Profile updated successfully!');
      
      // Refresh page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      setSaveError(
        err.response?.data?.error || err.response?.data?.errors?.[Object.keys(err.response?.data?.errors || {})[0]] || 'Failed to update profile'
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Validate password strength
   * Must be 8+ chars, contain uppercase, lowercase, digit, and special char
   */
  function validatePassword(password) {
    const minLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const errors = [];
    if (!minLength) errors.push('at least 8 characters');
    if (!hasUpper) errors.push('an uppercase letter');
    if (!hasLower) errors.push('a lowercase letter');
    if (!hasDigit) errors.push('a number');
    if (!hasSpecial) errors.push('a special character');

    return errors;
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '520px' }}>
        {/* Header */}
        <div className="modal-header">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', margin: 0 }}>
            My Profile
          </h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {!isUnlocked ? (
          <>
            {/* Read-only Profile View */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              {/* Username */}
              <div className="form-group">
                <label className="form-label">Username</label>
                <div style={{
                  background: 'var(--ink-3)',
                  border: '1px solid var(--parchment-border)',
                  borderRadius: 'var(--radius)',
                  padding: '11px 14px',
                  color: 'var(--parchment)',
                  fontSize: '0.9rem',
                  cursor: 'not-allowed',
                  opacity: 0.6,
                }}>
                  {formData.username}
                </div>
              </div>

              {/* Full Name */}
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <div style={{
                  background: 'var(--ink-3)',
                  border: '1px solid var(--parchment-border)',
                  borderRadius: 'var(--radius)',
                  padding: '11px 14px',
                  color: 'var(--parchment)',
                  fontSize: '0.9rem',
                  cursor: 'not-allowed',
                  opacity: 0.6,
                }}>
                  {formData.full_name}
                </div>
              </div>

              {/* Password (Read-only placeholder) */}
              <div className="form-group">
                <label className="form-label">Password</label>
                <div style={{
                  background: 'var(--ink-3)',
                  border: '1px solid var(--parchment-border)',
                  borderRadius: 'var(--radius)',
                  padding: '11px 14px',
                  color: 'var(--slate)',
                  fontSize: '0.9rem',
                  cursor: 'not-allowed',
                }}>
                  ••••••••••
                </div>
              </div>

              {/* Bio (only for authors) */}
              {user?.role === 'author' && (
                <div className="form-group">
                  <label className="form-label">Bio</label>
                  <div style={{
                    background: 'var(--ink-3)',
                    border: '1px solid var(--parchment-border)',
                    borderRadius: 'var(--radius)',
                    padding: '11px 14px',
                    color: 'var(--parchment)',
                    fontSize: '0.9rem',
                    minHeight: '60px',
                    cursor: 'not-allowed',
                    opacity: 0.6,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {formData.bio || '(No bio yet)'}
                  </div>
                </div>
              )}
            </div>

            {/* Unlock Section */}
            <div style={{
              background: 'var(--gold-dim)',
              border: '1px solid var(--gold-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px',
              marginBottom: '20px',
            }}>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Enter Your Current Password to Edit</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="Enter your current password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  disabled={loading}
                  style={{ marginTop: '6px' }}
                />
              </div>
              {passwordError && (
                <div className="alert alert-error" style={{ marginBottom: '12px' }}>
                  ⚠ {passwordError}
                </div>
              )}
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={handleUnlock}
                disabled={loading || !currentPassword.trim()}
              >
                {loading ? 'Verifying…' : 'Unlock to Edit'}
              </button>
            </div>

            {/* Footer Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Editable Profile Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              {/* Username (Read-only) */}
              <div className="form-group">
                <label className="form-label">Username</label>
                <div style={{
                  background: 'var(--ink-3)',
                  border: '1px solid var(--parchment-border)',
                  borderRadius: 'var(--radius)',
                  padding: '11px 14px',
                  color: 'var(--parchment)',
                  fontSize: '0.9rem',
                  cursor: 'not-allowed',
                  opacity: 0.6,
                }}>
                  {formData.username}
                </div>
              </div>

              {/* Full Name */}
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  className="form-input"
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  placeholder="Full name"
                />
              </div>

              {/* New Password */}
              <div className="form-group">
                <label className="form-label">New Password (Leave blank to keep current)</label>
                <input
                  className="form-input"
                  type="password"
                  name="new_password"
                  value={formData.new_password}
                  onChange={handleInputChange}
                  placeholder="Enter new password (optional)"
                />
                {formData.new_password && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--slate)', marginTop: '4px' }}>
                    💡 Password must contain: 8+ characters, uppercase, lowercase, number, special character
                  </div>
                )}
              </div>

              {/* Bio (only for authors) */}
              {user?.role === 'author' && (
                <div className="form-group">
                  <label className="form-label">Bio</label>
                  <textarea
                    className="form-textarea"
                    name="bio"
                    value={formData.bio}
                    onChange={handleInputChange}
                    placeholder="Tell us about yourself..."
                    style={{ minHeight: '100px' }}
                  />
                </div>
              )}

              {/* Save Error */}
              {saveError && (
                <div className="alert alert-error">
                  ⚠ {saveError}
                </div>
              )}

              {/* Save Success */}
              {saveSuccess && (
                <div className="alert alert-success">
                  ✓ {saveSuccess}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setIsUnlocked(false);
                  setCurrentPassword('');
                  setSaveError('');
                  setSaveSuccess('');
                  setFormData({
                    username: user?.username || '',
                    full_name: user?.full_name || '',
                    new_password: '',
                    bio: user?.bio || '',
                  });
                }}
                disabled={loading || saveSuccess}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={handleSave}
                disabled={loading || saveSuccess}
              >
                {loading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
