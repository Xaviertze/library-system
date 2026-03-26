/**
 * Registration Page
 * Single registration form for all roles with dynamic fields
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLES = [
  { value: 'student', label: 'Student', icon: '🎓' },
  { value: 'staff', label: 'Staff', icon: '💼' },
  { value: 'author', label: 'Author', icon: '✍️' },
  { value: 'librarian', label: 'Librarian', icon: '📚' },
];

export default function RegisterPage() {
  const [form, setForm] = useState({
    username: '', full_name: '', password: '', confirmPassword: '',
    role: '', bio: '', employee_id: ''
  });
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const e = {};
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    return e;
  };

  const handleSubmit = async (evt) => {
    evt.preventDefault();
    const localErrors = validate();
    if (Object.keys(localErrors).length) { setErrors(localErrors); return; }

    setErrors({});
    setLoading(true);
    try {
      const data = await register(form);
      setSuccess(data.message);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setErrors(err.response?.data?.errors || { general: 'Registration failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg" />
      <div className="auth-card" style={{ maxWidth: 540 }}>
        <div className="auth-logo">
          <h1>Biblio<span>Vault</span></h1>
          <p>Create your account</p>
        </div>

        {errors.general && <div className="alert alert-error mb-4">⚠ {errors.general}</div>}
        {success && <div className="alert alert-success mb-4">✓ {success}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {/* Role Selection */}
          <div className="form-group">
            <label className="form-label">I am a…</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {ROLES.map(role => (
                <button
                  key={role.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, role: role.value }))}
                  style={{
                    padding: '10px 6px',
                    borderRadius: 8,
                    border: `1px solid ${form.role === role.value ? 'var(--gold)' : 'var(--parchment-border)'}`,
                    background: form.role === role.value ? 'var(--gold-dim)' : 'transparent',
                    color: form.role === role.value ? 'var(--gold-light)' : 'var(--slate-light)',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    transition: 'all 0.2s'
                  }}
                >
                  <span style={{ fontSize: '1.4rem' }}>{role.icon}</span>
                  {role.label}
                </button>
              ))}
            </div>
            {errors.role && <span className="form-error">⚠ {errors.role}</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input className="form-input" placeholder="unique_username" value={form.username} onChange={set('username')} required />
              {errors.username && <span className="form-error">⚠ {errors.username}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" placeholder="Jane Doe" value={form.full_name} onChange={set('full_name')} required />
              {errors.full_name && <span className="form-error">⚠ {errors.full_name}</span>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="Strong password" value={form.password} onChange={set('password')} required />
              {errors.password && <span className="form-error">⚠ {errors.password}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input className="form-input" type="password" placeholder="Repeat password" value={form.confirmPassword} onChange={set('confirmPassword')} required />
              {errors.confirmPassword && <span className="form-error">⚠ {errors.confirmPassword}</span>}
            </div>
          </div>

          {/* Password requirements hint */}
          <div style={{ fontSize: '0.75rem', color: 'var(--slate)', background: 'var(--parchment-dim)', padding: '10px 14px', borderRadius: 6 }}>
            🔒 Password must be 8+ characters with uppercase, lowercase, number, and special character
          </div>

          {/* Author-specific field */}
          {form.role === 'author' && (
            <div className="form-group">
              <label className="form-label">Bio (optional)</label>
              <textarea className="form-textarea" placeholder="Tell readers about yourself…" value={form.bio} onChange={set('bio')} rows={3} />
            </div>
          )}

          {/* Librarian-specific field */}
          {form.role === 'librarian' && (
            <div className="form-group">
              <label className="form-label">Employee ID (optional)</label>
              <input className="form-input" placeholder="EMP-12345" value={form.employee_id} onChange={set('employee_id')} />
            </div>
          )}

          <button className="btn btn-primary btn-lg w-full" type="submit" disabled={loading || !form.role}>
            {loading ? 'Creating Account…' : 'Create Account'}
          </button>

          <div className="auth-divider">
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
