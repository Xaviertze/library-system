/**
 * Profile Editor Component
 * Shared profile management UI for all portals
 */
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

function PasswordStrength({ password }) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;

  const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
  const colors = ['var(--ruby-light)', 'var(--ruby-light)', '#e0a030', 'var(--emerald-light)', 'var(--emerald-light)'];
  const idx = Math.max(0, score - 1);

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i < score ? colors[idx] : 'var(--parchment-border)'
          }} />
        ))}
      </div>
      <span style={{ fontSize: '0.75rem', color: colors[idx] }}>{labels[idx]}</span>
    </div>
  );
}

export default function ProfileEditor({ showFields = ['full_name', 'password'], onPasswordChanged }) {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [pwMode, setPwMode] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({ full_name: '', bio: '', employee_id: '', current_password: '' });
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/users/profile');
      setProfile(data);
      setForm({ full_name: data.full_name, bio: data.bio || '', employee_id: data.employee_id || '', current_password: '' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setError('');
    if (!form.current_password) {
      setError('Enter your current password to confirm changes');
      return;
    }
    try {
      await api.put('/users/profile', form);
      setMsg('Profile updated successfully!');
      setEditMode(false);
      loadProfile();
      // Update localStorage user
      const savedUser = JSON.parse(localStorage.getItem('user') || '{}');
      savedUser.full_name = form.full_name;
      if (form.bio) savedUser.bio = form.bio;
      if (form.employee_id) savedUser.employee_id = form.employee_id;
      localStorage.setItem('user', JSON.stringify(savedUser));
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.errors?.full_name || 'Update failed');
    }
  };

  const handleChangePassword = async () => {
    setError('');
    if (pwForm.new_password !== pwForm.confirm_password) {
      setError('New passwords do not match');
      return;
    }
    try {
      await api.put('/users/password', {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password
      });
      setMsg('Password changed! Logging out...');
      setTimeout(() => {
        if (onPasswordChanged) onPasswordChanged();
        else logout();
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Password change failed');
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('avatar', file);
    try {
      const { data } = await api.post('/users/profile-picture', fd);
      setMsg('Profile picture updated!');
      // Update localStorage so sidebar and other components reflect the new picture
      const savedUser = JSON.parse(localStorage.getItem('user') || '{}');
      savedUser.profile_picture = data.profile_picture;
      localStorage.setItem('user', JSON.stringify(savedUser));
      loadProfile();
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    }
  };

  if (loading) return <div className="empty-state"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Manage Profile</h2>
        <p className="page-subtitle">Update your account information</p>
      </div>

      {msg && <div className="alert alert-success mb-4">{msg}</div>}
      {error && <div className="alert alert-error mb-4">{error}</div>}

      <div style={{ maxWidth: 600 }}>
        {/* Profile Picture */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%', background: 'var(--gold-dim)',
            border: '2px solid var(--gold-border)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '2rem', color: 'var(--gold)',
            fontFamily: 'var(--font-display)', overflow: 'hidden', flexShrink: 0
          }}>
            {profile.profile_picture ? (
              <img src={`/uploads/${profile.profile_picture.replace(/^uploads\//, '')}`} alt="Avatar"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { e.target.style.display = 'none'; e.target.parentNode.textContent = profile.full_name?.[0]?.toUpperCase(); }}
              />
            ) : (
              profile.full_name?.[0]?.toUpperCase()
            )}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--parchment)' }}>
              {profile.full_name}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--slate)', textTransform: 'capitalize' }}>
              {profile.role} &middot; @{profile.username}
            </div>
            {showFields.includes('profile_picture') && (
              <>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
                  onClick={() => fileInputRef.current?.click()}>
                  Change Photo
                </button>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png"
                  style={{ display: 'none' }} onChange={handleAvatarUpload} />
              </>
            )}
          </div>
        </div>

        {/* Profile Info */}
        {!editMode && !pwMode && (
          <div>
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--slate)', letterSpacing: '0.1em', marginBottom: 4 }}>Full Name</div>
                  <div style={{ fontSize: '1rem', color: 'var(--parchment)' }}>{profile.full_name}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--slate)', letterSpacing: '0.1em', marginBottom: 4 }}>Username</div>
                  <div style={{ fontSize: '1rem', color: 'var(--parchment)' }}>@{profile.username}</div>
                </div>
                {showFields.includes('bio') && (
                  <div>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--slate)', letterSpacing: '0.1em', marginBottom: 4 }}>Bio</div>
                    <div style={{ fontSize: '1rem', color: 'var(--parchment)' }}>{profile.bio || 'No bio set'}</div>
                  </div>
                )}
                {showFields.includes('employee_id') && (
                  <div>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--slate)', letterSpacing: '0.1em', marginBottom: 4 }}>Employee ID</div>
                    <div style={{ fontSize: '1rem', color: 'var(--parchment)' }}>{profile.employee_id || 'Not set'}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--slate)', letterSpacing: '0.1em', marginBottom: 4 }}>Member Since</div>
                  <div style={{ fontSize: '1rem', color: 'var(--parchment)' }}>
                    {new Date(profile.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" onClick={() => setEditMode(true)}>Edit Profile</button>
              <button className="btn btn-secondary" onClick={() => setPwMode(true)}>Change Password</button>
            </div>
          </div>
        )}

        {/* Edit Profile Form */}
        {editMode && (
          <div className="card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input className="form-input" value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              {showFields.includes('bio') && (
                <div className="form-group">
                  <label className="form-label">Bio</label>
                  <textarea className="form-textarea" rows={3} value={form.bio}
                    onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} />
                </div>
              )}
              {showFields.includes('employee_id') && (
                <div className="form-group">
                  <label className="form-label">Employee ID</label>
                  <input className="form-input" value={form.employee_id}
                    onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Current Password (required to save)</label>
                <input className="form-input" type="password" value={form.current_password}
                  onChange={e => setForm(f => ({ ...f, current_password: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-primary" onClick={handleSaveProfile}>Save Changes</button>
                <button className="btn btn-ghost" onClick={() => { setEditMode(false); setError(''); }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Change Password Form */}
        {pwMode && (
          <div className="card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input className="form-input" type="password" value={pwForm.current_password}
                  onChange={e => setPwForm(f => ({ ...f, current_password: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input className="form-input" type="password" value={pwForm.new_password}
                  onChange={e => setPwForm(f => ({ ...f, new_password: e.target.value }))} />
                <PasswordStrength password={pwForm.new_password} />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input className="form-input" type="password" value={pwForm.confirm_password}
                  onChange={e => setPwForm(f => ({ ...f, confirm_password: e.target.value }))} />
                {pwForm.confirm_password && pwForm.new_password !== pwForm.confirm_password && (
                  <span className="form-error">Passwords do not match</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-primary" onClick={handleChangePassword}
                  disabled={!pwForm.current_password || !pwForm.new_password || pwForm.new_password !== pwForm.confirm_password}>
                  Change Password
                </button>
                <button className="btn btn-ghost" onClick={() => { setPwMode(false); setError(''); }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
