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
  `);

  // Migrate existing database if the books table was created without 'draft' in its constraint
  migrateAddDraftStatus();

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

initializeDatabase();

module.exports = db;
