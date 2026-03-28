/**
 * Crash Recovery Routes
 * Saves and restores application state for crash recovery
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'library-system-secret-key-2024';

const router = express.Router();

/**
 * Middleware that tries standard auth first, then falls back to _token in body
 * (needed for sendBeacon which cannot set custom headers)
 */
function authenticateWithFallback(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticate(req, res, next);
  }
  // Fallback: check _token in request body (for sendBeacon)
  const bodyToken = req.body?._token;
  if (bodyToken) {
    try {
      const decoded = jwt.verify(bodyToken, JWT_SECRET);
      req.user = decoded;
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }
  return res.status(401).json({ error: 'Authentication required' });
}

/**
 * POST /api/recovery/save
 * Save current application state for crash recovery
 */
router.post('/save', authenticateWithFallback, (req, res) => {
  const { screen, portal, state_data } = req.body;

  if (!screen || !portal) {
    return res.status(400).json({ error: 'Screen and portal are required' });
  }

  const existing = db.prepare('SELECT id FROM crash_recovery WHERE user_id = ?').get(req.user.id);

  if (existing) {
    db.prepare(`
      UPDATE crash_recovery SET screen = ?, portal = ?, state_data = ?, updated_at = ?
      WHERE user_id = ?
    `).run(screen, portal, JSON.stringify(state_data || {}), new Date().toISOString(), req.user.id);
  } else {
    db.prepare(`
      INSERT INTO crash_recovery (id, user_id, screen, portal, state_data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), req.user.id, screen, portal, JSON.stringify(state_data || {}), new Date().toISOString());
  }

  res.json({ message: 'State saved' });
});

/**
 * GET /api/recovery/state
 * Get saved crash recovery state
 */
router.get('/state', authenticate, (req, res) => {
  const state = db.prepare('SELECT * FROM crash_recovery WHERE user_id = ?').get(req.user.id);

  if (!state) {
    return res.json({ has_recovery: false });
  }

  res.json({
    has_recovery: true,
    screen: state.screen,
    portal: state.portal,
    state_data: JSON.parse(state.state_data || '{}'),
    updated_at: state.updated_at
  });
});

/**
 * DELETE /api/recovery/clear
 * Clear crash recovery state
 */
router.delete('/clear', authenticate, (req, res) => {
  db.prepare('DELETE FROM crash_recovery WHERE user_id = ?').run(req.user.id);
  res.json({ message: 'Recovery state cleared' });
});

module.exports = router;
