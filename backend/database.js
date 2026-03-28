/**
 * Database initialization and schema setup
 * Uses better-sqlite3 for synchronous SQLite access
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'library.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Initialize all database tables
 */
function initializeDatabase() {
  db.exec(`
    -- Users table: stores all user accounts regardless of role
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'staff', 'author', 'librarian')),
      bio TEXT,                    -- Author-specific field
      employee_id TEXT,            -- Librarian-specific field
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Books table: stores all book records
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      genre TEXT NOT NULL,          -- Comma-separated genres
      description TEXT NOT NULL,
      file_path TEXT,               -- Path to uploaded book file
      file_name TEXT,               -- Original filename
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'approved', 'rejected', 'draft')),
      availability TEXT NOT NULL DEFAULT 'available'
        CHECK(availability IN ('available', 'borrowed')),
      publish_date DATETIME,        -- Set when librarian approves
      submitted_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      draft_data TEXT,              -- JSON string for auto-save drafts
      times_borrowed INTEGER DEFAULT 0,
      FOREIGN KEY (author_id) REFERENCES users(id)
    );

    -- Borrow records table: tracks all borrowing transactions
    CREATE TABLE IF NOT EXISTS borrow_records (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      borrow_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      due_date DATETIME NOT NULL,
      return_date DATETIME,         -- NULL if not yet returned
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active', 'returned', 'overdue')),
      FOREIGN KEY (book_id) REFERENCES books(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Bookmarks table: saves reading progress per user/book
    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      label TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (book_id) REFERENCES books(id)
    );

    -- Highlights table: stores text highlights per user/book
    CREATE TABLE IF NOT EXISTS highlights (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      text_content TEXT NOT NULL,
      color TEXT DEFAULT '#c9a84c',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (book_id) REFERENCES books(id)
    );

    -- Notifications table: system-wide notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      priority TEXT DEFAULT 'normal',
      category TEXT DEFAULT 'general',
      is_read INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      related_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Crash recovery state table
    CREATE TABLE IF NOT EXISTS crash_recovery (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      screen TEXT NOT NULL,
      portal TEXT NOT NULL,
      state_data TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Migrate existing database if the books table was created without 'draft' in its constraint
  migrateAddDraftStatus();
  // Migrate books table to support 'pending_deletion' status
  migrateAddPendingDeletion();
  // Run new column migrations
  migrateAddNewColumns();

  console.log('\u2705 Database initialized successfully');
}

/**
 * Migration: recreate books table to include 'draft' in the status CHECK constraint.
 * Only runs when the existing table is missing the 'draft' value.
 */
function migrateAddDraftStatus() {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='books'"
  ).get();

  // Table doesn't exist yet, or already has 'draft' — nothing to do
  if (!row || row.sql.includes("'draft'")) return;

  // Disable FK enforcement for the restructure — we are only changing a CHECK
  // constraint, not any relationships, so this is safe. The pragma must be set
  // outside of a transaction in SQLite.
  db.pragma('foreign_keys = OFF');
  try {
    const migrate = db.transaction(() => {
      db.prepare(`
        CREATE TABLE books_v2 (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          author_id TEXT NOT NULL,
          author_name TEXT NOT NULL,
          genre TEXT NOT NULL,
          description TEXT NOT NULL,
          file_path TEXT,
          file_name TEXT,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK(status IN ('pending', 'approved', 'rejected', 'draft')),
          availability TEXT NOT NULL DEFAULT 'available'
            CHECK(availability IN ('available', 'borrowed')),
          publish_date DATETIME,
          submitted_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          draft_data TEXT,
          times_borrowed INTEGER DEFAULT 0,
          FOREIGN KEY (author_id) REFERENCES users(id)
        )
      `).run();
      db.prepare('INSERT INTO books_v2 SELECT * FROM books').run();
      db.prepare('DROP TABLE books').run();
      db.prepare('ALTER TABLE books_v2 RENAME TO books').run();
    });
    migrate();
    console.log('\u2705 Migrated books table: added draft status support');
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

/**
 * Migration: add 'pending_deletion' to books status CHECK constraint.
 * Only runs when the existing table is missing the value.
 */
function migrateAddPendingDeletion() {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='books'"
  ).get();

  if (!row || row.sql.includes("'pending_deletion'")) return;

  // Check which optional columns already exist
  const hasColumn = (table, column) => {
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    return info.some(col => col.name === column);
  };
  const hasCover = hasColumn('books', 'cover_image');
  const hasRejection = hasColumn('books', 'rejection_reason');

  db.pragma('foreign_keys = OFF');
  try {
    const migrate = db.transaction(() => {
      db.prepare(`
        CREATE TABLE books_v3 (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          author_id TEXT NOT NULL,
          author_name TEXT NOT NULL,
          genre TEXT NOT NULL,
          description TEXT NOT NULL,
          file_path TEXT,
          file_name TEXT,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK(status IN ('pending', 'approved', 'rejected', 'draft', 'pending_deletion')),
          availability TEXT NOT NULL DEFAULT 'available'
            CHECK(availability IN ('available', 'borrowed')),
          publish_date DATETIME,
          submitted_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          draft_data TEXT,
          times_borrowed INTEGER DEFAULT 0,
          cover_image TEXT,
          rejection_reason TEXT,
          FOREIGN KEY (author_id) REFERENCES users(id)
        )
      `).run();
      // Build column list based on what exists in the old table
      const baseCols = 'id, title, author_id, author_name, genre, description, file_path, file_name, status, availability, publish_date, submitted_date, draft_data, times_borrowed';
      const extraCols = [
        hasCover ? 'cover_image' : "NULL as cover_image",
        hasRejection ? 'rejection_reason' : "NULL as rejection_reason",
      ].join(', ');
      db.prepare(`INSERT INTO books_v3 SELECT ${baseCols}, ${extraCols} FROM books`).run();
      db.prepare('DROP TABLE books').run();
      db.prepare('ALTER TABLE books_v3 RENAME TO books').run();
    });
    migrate();
    console.log('\u2705 Migrated books table: added pending_deletion status support');
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

/**
 * Migration: add new columns to users and books tables for extended features.
 * Uses ALTER TABLE which is safe — columns are added only if missing.
 */
function migrateAddNewColumns() {
  // Helper: check if column exists
  const hasColumn = (table, column) => {
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    return info.some(col => col.name === column);
  };

  // Users: profile_picture, active status
  if (!hasColumn('users', 'profile_picture')) {
    db.prepare('ALTER TABLE users ADD COLUMN profile_picture TEXT').run();
    console.log('  ↳ Added users.profile_picture column');
  }
  if (!hasColumn('users', 'active')) {
    db.prepare('ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1').run();
    console.log('  ↳ Added users.active column');
  }

  // Books: cover_image, rejection_reason
  if (!hasColumn('books', 'cover_image')) {
    db.prepare('ALTER TABLE books ADD COLUMN cover_image TEXT').run();
    console.log('  ↳ Added books.cover_image column');
  }
  if (!hasColumn('books', 'rejection_reason')) {
    db.prepare('ALTER TABLE books ADD COLUMN rejection_reason TEXT').run();
    console.log('  ↳ Added books.rejection_reason column');
  }
}

/**
 * Auto-return overdue books and create notifications.
 * Called periodically or on relevant API requests.
 */
function processAutoReturns() {
  const now = new Date().toISOString();
  const overdue = db.prepare(`
    SELECT br.id, br.book_id, br.user_id, b.title
    FROM borrow_records br
    JOIN books b ON br.book_id = b.id
    WHERE br.status = 'active' AND br.due_date < ?
  `).all(now);

  if (overdue.length === 0) return [];

  const { v4: uuidv4 } = require('uuid');
  const autoReturn = db.transaction(() => {
    for (const record of overdue) {
      db.prepare(`UPDATE borrow_records SET status = 'returned', return_date = ? WHERE id = ?`)
        .run(now, record.id);
      db.prepare(`UPDATE books SET availability = 'available' WHERE id = ?`)
        .run(record.book_id);
      // Create notification for user
      db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
        VALUES (?, ?, 'auto_return', 'Book Auto-Returned', ?, 'urgent', 'borrow', ?)
      `).run(
        uuidv4(), record.user_id,
        `"${record.title}" has been automatically returned because the due date has passed.`,
        record.book_id
      );
    }
  });
  autoReturn();
  return overdue;
}

/**
 * Generate due date reminder notifications for books due within 24 hours.
 */
function generateDueReminders() {
  const { v4: uuidv4 } = require('uuid');
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const dueSoon = db.prepare(`
    SELECT br.id, br.book_id, br.user_id, br.due_date, b.title
    FROM borrow_records br
    JOIN books b ON br.book_id = b.id
    WHERE br.status = 'active' AND br.due_date <= ? AND br.due_date > ?
  `).all(tomorrow.toISOString(), now.toISOString());

  const createReminders = db.transaction(() => {
    for (const record of dueSoon) {
      // Check if reminder already sent
      const exists = db.prepare(`
        SELECT id FROM notifications
        WHERE user_id = ? AND type = 'due_reminder' AND related_id = ? AND created_at > ?
      `).get(record.user_id, record.book_id, new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());

      if (!exists) {
        db.prepare(`
          INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
          VALUES (?, ?, 'due_reminder', 'Return Reminder', ?, 'urgent', 'borrow', ?)
        `).run(
          uuidv4(), record.user_id,
          `"${record.title}" is due on ${new Date(record.due_date).toLocaleDateString()}. Please return it soon.`,
          record.book_id
        );
      }
    }
  });
  createReminders();
}

initializeDatabase();

module.exports = db;
module.exports.processAutoReturns = processAutoReturns;
module.exports.generateDueReminders = generateDueReminders;
