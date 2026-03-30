/**
 * Authentication Routes
 * Handles user registration and login for all roles
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { generateToken } = require('../middleware/auth');

/**
 * Notify all librarians about an event
 */
function notifyLibrarians(type, title, message, category, relatedId) {
  const librarians = db.prepare("SELECT id FROM users WHERE role = 'librarian'").all();
  for (const lib of librarians) {
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, category, related_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), lib.id, type, title, message, category, relatedId || null);
  }
}

const router = express.Router();

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

/**
 * POST /api/auth/register
 * Register a new user (any role)
 */
router.post('/register', (req, res) => {
  const { username, full_name, password, role, bio, employee_id } = req.body;

  // --- Input Validation ---
  const errors = {};

  if (!username || username.trim().length < 3) {
    errors.username = 'Username must be at least 3 characters';
  } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errors.username = 'Username can only contain letters, numbers, and underscores';
  }

  if (!full_name || full_name.trim().length === 0) {
    errors.full_name = 'Full name cannot be empty';
  }

  const passwordErrors = validatePassword(password || '');
  if (passwordErrors.length > 0) {
    errors.password = `Password must contain: ${passwordErrors.join(', ')}`;
  }

  const validRoles = ['student', 'staff', 'author', 'librarian'];
  if (!role || !validRoles.includes(role)) {
    errors.role = 'Please select a valid role';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  // Check username uniqueness
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) {
    return res.status(400).json({ errors: { username: 'Username already taken' } });
  }

  // Hash password with bcrypt (cost factor 12)
  const password_hash = bcrypt.hashSync(password, 12);

  const id = uuidv4();
  
  db.prepare(`
    INSERT INTO users (id, username, full_name, password_hash, role, bio, employee_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    username.trim(),
    full_name.trim(),
    password_hash,
    role,
    role === 'author' ? (bio || null) : null,
    role === 'librarian' ? (employee_id || null) : null
  );

  // Notify librarians about new registration
  notifyLibrarians(
    'user_update',
    'New User Registered',
    `New user registered: ${username.trim()} (${role})`,
    'users',
    id
  );

  res.status(201).json({ message: 'Account created successfully! Please log in.' });
});

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Fetch user from database
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());

  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Verify password
  const validPassword = bcrypt.compareSync(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Check if account is deactivated
  if (user.active === 0) {
    return res.status(403).json({ error: 'Unable to login. Account deactivated by librarian.' });
  }

  // Generate JWT token
  const token = generateToken(user);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      bio: user.bio,
      employee_id: user.employee_id,
      profile_picture: user.profile_picture
    }
  });
});

module.exports = router;
