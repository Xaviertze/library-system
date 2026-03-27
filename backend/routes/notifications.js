/**
 * Notification Routes
 * Handles notification CRUD, marking as read, archiving, and filtering
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/notifications
 * Fetch notifications for the current user with filtering
 */
router.get('/', authenticate, (req, res) => {
  const { category, type, is_read, is_archived, search, priority } = req.query;

  // Process auto-returns and due reminders on notification check
  if (db.processAutoReturns) db.processAutoReturns();
  if (db.generateDueReminders) db.generateDueReminders();

  let query = `SELECT * FROM notifications WHERE user_id = ?`;
  const params = [req.user.id];

  if (category) { query += ' AND category = ?'; params.push(category); }
  if (type) { query += ' AND type = ?'; params.push(type); }
  if (is_read !== undefined) { query += ' AND is_read = ?'; params.push(Number(is_read)); }
  if (is_archived !== undefined) { query += ' AND is_archived = ?'; params.push(Number(is_archived)); }
  if (priority) { query += ' AND priority = ?'; params.push(priority); }
  if (search) {
    query += ' AND (title LIKE ? OR message LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  // Default: hide archived unless specifically requested
  if (is_archived === undefined) {
    query += ' AND is_archived = 0';
  }

  query += ' ORDER BY created_at DESC';
  const notifications = db.prepare(query).all(...params);
  res.json(notifications);
});

/**
 * GET /api/notifications/unread-count
 * Get unread notification count for the current user
 */
router.get('/unread-count', authenticate, (req, res) => {
  const count = db.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0 AND is_archived = 0'
  ).get(req.user.id);
  res.json({ count: count.count });
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a notification as read
 */
router.patch('/:id/read', authenticate, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  res.json({ message: 'Notification marked as read' });
});

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read
 */
router.patch('/read-all', authenticate, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
    .run(req.user.id);
  res.json({ message: 'All notifications marked as read' });
});

/**
 * PATCH /api/notifications/:id/archive
 * Archive a notification
 */
router.patch('/:id/archive', authenticate, (req, res) => {
  db.prepare('UPDATE notifications SET is_archived = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  res.json({ message: 'Notification archived' });
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
router.delete('/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  res.json({ message: 'Notification deleted' });
});

/**
 * POST /api/notifications/announcement
 * Create an announcement (librarian only — notifies all users of a given role or all)
 */
router.post('/announcement', authenticate, (req, res) => {
  if (req.user.role !== 'librarian') {
    return res.status(403).json({ error: 'Only librarians can create announcements' });
  }

  const { title, message, target_role, priority } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required' });
  }

  let query = 'SELECT id FROM users WHERE active = 1';
  const params = [];
  if (target_role) {
    query += ' AND role = ?';
    params.push(target_role);
  }

  const users = db.prepare(query).all(...params);
  const createNotifications = db.transaction(() => {
    for (const user of users) {
      db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, message, priority, category)
        VALUES (?, ?, 'announcement', ?, ?, ?, 'announcement')
      `).run(uuidv4(), user.id, title, message, priority || 'normal');
    }
  });
  createNotifications();

  res.json({ message: `Announcement sent to ${users.length} user(s)` });
});

module.exports = router;
