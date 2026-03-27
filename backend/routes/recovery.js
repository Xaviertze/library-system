/**
 * Crash Recovery Routes
 * Saves and restores application state for crash recovery
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/recovery/save
 * Save current application state for crash recovery
 */
router.post('/save', authenticate, (req, res) => {
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
