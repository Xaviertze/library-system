/**
 * User Management Routes
 * Handles profile management, user CRUD (librarian), and profile picture uploads
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate, authorize, generateToken } = require('../middleware/auth');

const router = express.Router();

// Configure multer for profile picture uploads
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'avatars');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/jpg'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG and PNG images are allowed'));
    }
  }
});

/* =============================================
   PROFILE MANAGEMENT (all roles)
   ============================================= */

/**
 * GET /api/users/profile
 * Get current user's full profile
 */
router.get('/profile', authenticate, (req, res) => {
  const user = db.prepare(`
    SELECT id, username, full_name, role, bio, employee_id, profile_picture, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);

  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

/**
 * PUT /api/users/profile
 * Update current user's profile (full_name, bio, employee_id)
 * Requires password re-authentication
 */
router.put('/profile', authenticate, (req, res) => {
  const { full_name, bio, employee_id, current_password } = req.body;

  // Re-authenticate with current password
  if (!current_password) {
    return res.status(400).json({ error: 'Current password is required to update profile' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(403).json({ error: 'Current password is incorrect' });
  }

  const errors = {};
  if (!full_name || full_name.trim().length === 0) {
    errors.full_name = 'Full name cannot be empty';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  const oldName = user.full_name;

  db.prepare(`
    UPDATE users SET full_name = ?, bio = ?, employee_id = ? WHERE id = ?
  `).run(
    full_name.trim(),
    user.role === 'author' ? (bio || null) : user.bio,
    user.role === 'librarian' ? (employee_id || null) : user.employee_id,
    req.user.id
  );

  // Notify librarians if user changed their name
  if (full_name.trim() !== oldName) {
    const librarians = db.prepare("SELECT id FROM users WHERE role = 'librarian' AND id != ?").all(req.user.id);
    for (const lib of librarians) {
      db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, message, category, related_id)
        VALUES (?, ?, 'user_update', 'User Profile Changed', ?, 'users', ?)
      `).run(uuidv4(), lib.id, `User ${oldName} has changed their name to ${full_name.trim()}`, req.user.id);
    }
  }

  res.json({ message: 'Profile updated successfully' });
});

/**
 * PUT /api/users/password
 * Change password (requires current password)
 */
router.put('/password', authenticate, (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(403).json({ error: 'Current password is incorrect' });
  }

  // Validate new password strength
  const minLength = new_password.length >= 8;
  const hasUpper = /[A-Z]/.test(new_password);
  const hasLower = /[a-z]/.test(new_password);
  const hasDigit = /\d/.test(new_password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(new_password);

  const pwErrors = [];
  if (!minLength) pwErrors.push('at least 8 characters');
  if (!hasUpper) pwErrors.push('an uppercase letter');
  if (!hasLower) pwErrors.push('a lowercase letter');
  if (!hasDigit) pwErrors.push('a number');
  if (!hasSpecial) pwErrors.push('a special character');

  if (pwErrors.length > 0) {
    return res.status(400).json({ error: `Password must contain: ${pwErrors.join(', ')}` });
  }

  const hash = bcrypt.hashSync(new_password, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);

  res.json({ message: 'Password changed successfully. Please log in again.' });
});

/**
 * POST /api/users/profile-picture
 * Upload profile picture
 */
router.post('/profile-picture', authenticate, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  // Delete old profile picture if exists
  const user = db.prepare('SELECT profile_picture FROM users WHERE id = ?').get(req.user.id);
  if (user.profile_picture) {
    const oldPath = path.join(__dirname, '..', user.profile_picture);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const relativePath = `uploads/avatars/${req.file.filename}`;
  db.prepare('UPDATE users SET profile_picture = ? WHERE id = ?').run(relativePath, req.user.id);

  res.json({ message: 'Profile picture updated', profile_picture: relativePath });
});

/* =============================================
   LIBRARIAN: USER MANAGEMENT
   ============================================= */

/**
 * GET /api/users
 * List all users (librarian only) with optional role filter
 */
router.get('/', authenticate, authorize('librarian'), (req, res) => {
  const { role, search } = req.query;

  let query = `SELECT id, username, full_name, role, bio, employee_id, profile_picture, active, created_at FROM users WHERE 1=1`;
  const params = [];

  if (role) {
    query += ' AND role = ?';
    params.push(role);
  }
  if (search) {
    query += ' AND (username LIKE ? OR full_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY created_at DESC';
  const users = db.prepare(query).all(...params);
  res.json(users);
});

/**
 * POST /api/users
 * Create a new user (librarian only)
 */
router.post('/', authenticate, authorize('librarian'), (req, res) => {
  const { username, full_name, password, role, bio, employee_id } = req.body;

  const errors = {};
  if (!username || username.trim().length < 3) {
    errors.username = 'Username must be at least 3 characters';
  } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errors.username = 'Username can only contain letters, numbers, and underscores';
  }
  if (!full_name || full_name.trim().length === 0) {
    errors.full_name = 'Full name cannot be empty';
  }
  if (!password || password.length < 8) {
    errors.password = 'Password must be at least 8 characters';
  }
  const validRoles = ['student', 'staff', 'author', 'librarian'];
  if (!role || !validRoles.includes(role)) {
    errors.role = 'Please select a valid role';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) {
    return res.status(400).json({ errors: { username: 'Username already taken' } });
  }

  const id = uuidv4();
  const password_hash = bcrypt.hashSync(password, 12);

  db.prepare(`
    INSERT INTO users (id, username, full_name, password_hash, role, bio, employee_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, username.trim(), full_name.trim(), password_hash, role,
    role === 'author' ? (bio || null) : null,
    role === 'librarian' ? (employee_id || null) : null
  );

  // Notify librarians about new user
  const librarians = db.prepare("SELECT id FROM users WHERE role = 'librarian'").all();
  for (const lib of librarians) {
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, category, related_id)
      VALUES (?, ?, 'user_update', 'New User Created', ?, 'users', ?)
    `).run(uuidv4(), lib.id, `New ${role} account "${username}" has been created.`, id);
  }

  res.status(201).json({ message: 'User created successfully', user_id: id });
});

/**
 * PUT /api/users/:id
 * Edit a user (librarian only)
 */
router.put('/:id', authenticate, authorize('librarian'), (req, res) => {
  const { full_name, role, bio, employee_id } = req.body;
  const targetId = req.params.id;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const errors = {};
  if (!full_name || full_name.trim().length === 0) {
    errors.full_name = 'Full name cannot be empty';
  }
  const validRoles = ['student', 'staff', 'author', 'librarian'];
  if (role && !validRoles.includes(role)) {
    errors.role = 'Invalid role';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  db.prepare(`
    UPDATE users SET full_name = ?, role = ?, bio = ?, employee_id = ? WHERE id = ?
  `).run(
    full_name.trim(),
    role || user.role,
    bio !== undefined ? bio : user.bio,
    employee_id !== undefined ? employee_id : user.employee_id,
    targetId
  );

  res.json({ message: 'User updated successfully' });
});

/**
 * PATCH /api/users/:id/deactivate
 * Deactivate a user account (librarian only)
 */
router.patch('/:id/deactivate', authenticate, authorize('librarian'), (req, res) => {
  const targetId = req.params.id;

  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'Cannot deactivate your own account' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const newStatus = user.active ? 0 : 1;
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(newStatus, targetId);

  res.json({
    message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`,
    active: newStatus
  });
});

module.exports = router;
