/**
 * Authentication Routes
 * Handles user registration and login for all roles
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { generateToken, authenticate } = require('../middleware/auth');

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
      employee_id: user.employee_id
    }
  });
});

/**
 * POST /api/auth/verify-password
 * Verify a user's current password (for profile unlock)
 */
router.post('/verify-password', (req, res) => {
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

  res.json({ message: 'Password verified successfully' });
});

/**
 * PUT /api/auth/profile
 * Update user profile information
 * Requires authentication
 * Note: Username cannot be changed and is not included in updates
 */
router.put('/profile', authenticate, (req, res) => {
  const { full_name, new_password, bio, current_password } = req.body;
  const userId = req.user.id;

  // Fetch current user from database
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // --- Verify current password for security ---
  if (!current_password) {
    return res.status(400).json({ error: 'Current password is required for verification' });
  }

  const validPassword = bcrypt.compareSync(current_password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  // --- Input Validation ---
  const errors = {};

  if (full_name && full_name.trim().length === 0) {
    errors.full_name = 'Full name cannot be empty';
  }

  // Validate bio for authors
  if (user.role === 'author' && bio && bio.trim().length === 0) {
    errors.bio = 'Bio cannot be empty if provided';
  }

  // Validate new password if provided
  if (new_password) {
    const passwordErrors = validatePassword(new_password);
    if (passwordErrors.length > 0) {
      errors.new_password = `Password must contain: ${passwordErrors.join(', ')}`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  // --- Update Database ---
  const updateFields = [];
  const updateValues = [];

  if (full_name) {
    updateFields.push('full_name = ?');
    updateValues.push(full_name.trim());
  }

  if (new_password) {
    const password_hash = bcrypt.hashSync(new_password, 12);
    updateFields.push('password_hash = ?');
    updateValues.push(password_hash);
  }

  if (bio !== undefined && user.role === 'author') {
    updateFields.push('bio = ?');
    updateValues.push(bio.trim() || null);
  }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updateValues.push(userId);

  const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
  db.prepare(query).run(...updateValues);

  // Fetch updated user
  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  res.json({
    message: 'Profile updated successfully',
    user: {
      id: updatedUser.id,
      username: updatedUser.username,
      full_name: updatedUser.full_name,
      role: updatedUser.role,
      bio: updatedUser.bio,
      employee_id: updatedUser.employee_id
    }
  });
});

module.exports = router;
