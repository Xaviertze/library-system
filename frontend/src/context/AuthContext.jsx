/**
 * Auth Context
 * Provides authentication state and methods to the entire app
 */
import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on app start
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      if (savedUser && token) {
        const parsed = JSON.parse(savedUser);
        if (parsed && parsed.id && parsed.role) {
          setUser(parsed);
        } else {
          // Corrupted user data — clear session
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      }
    } catch {
      // Corrupted localStorage — clear and start fresh
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    setLoading(false);
  }, []);

  /**
   * Log in a user and persist session
   */
  const login = async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  /**
   * Register a new user
   */
  const register = async (formData) => {
    const { data } = await api.post('/auth/register', formData);
    return data;
  };

  /**
   * Log out current user and clear session
   */
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
