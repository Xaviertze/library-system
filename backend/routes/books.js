/**
 * Books Routes
 * Handles book browsing, submission, approval, and file serving
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const BORROW_LIMIT = 5; // Maximum active borrows per user
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'books');

// Resolve a stored file_path to an actual path on disk
// Handles both absolute paths and cases where the project was moved
function resolveFilePath(filePath) {
  if (!filePath) return null;
  if (fs.existsSync(filePath)) return filePath;
  // Fallback: extract filename and look in uploads/books
  const filename = path.basename(filePath);
  const fallback = path.join(UPLOADS_DIR, filename);
  return fs.existsSync(fallback) ? fallback : null;
}

// Configure multer for book file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'books');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    cb(null, uniqueName);
  }
});

// Configure multer for book cover image uploads
const coverStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'covers');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const allowedMimetypes = [
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'cover_image') {
      if (['image/jpeg', 'image/png', 'image/jpg'].includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Cover image must be JPG or PNG'));
      }
    } else if (allowedMimetypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, TXT, DOC, and DOCX files are allowed'));
    }
  }
});

const uploadFields = upload.fields([
  { name: 'book_file', maxCount: 1 },
  { name: 'cover_image', maxCount: 1 }
]);

/* =============================================
   STUDENT / STAFF ROUTES
   ============================================= */

/**
 * GET /api/books
 * Fetch all approved books (for students/staff browsing)
 */
router.get('/', authenticate, (req, res) => {
  const books = db.prepare(`
    SELECT b.id, b.title, b.author_name, b.genre, b.description,
           b.availability, b.publish_date, b.times_borrowed, b.cover_image
    FROM books b
    WHERE b.status = 'approved'
    ORDER BY b.publish_date DESC
  `).all();

  res.json(books);
});

/**
 * GET /api/books/recommendations
 * Get the top 3 most borrowed approved books
 */
router.get('/recommendations', authenticate, authorize('student', 'staff'), (req, res) => {
  const books = db.prepare(`
    SELECT b.id, b.title, b.author_name, b.genre, b.description,
           b.availability, b.publish_date, b.times_borrowed, b.cover_image
    FROM books b
    WHERE b.status = 'approved'
    ORDER BY b.times_borrowed DESC
    LIMIT 3
  `).all();

  res.json(books);
});

/**
 * POST /api/books/:id/borrow
 * Borrow a book (students and staff only)
 */
router.post('/:id/borrow', authenticate, authorize('student', 'staff'), (req, res) => {
  const { id } = req.params;
  const { duration_days } = req.body;
  const userId = req.user.id;

  // Process auto-returns first
  if (db.processAutoReturns) db.processAutoReturns();

  // Validate borrow duration (1-14 days)
  const duration = parseInt(duration_days);
  if (!duration || duration < 1 || duration > 14) {
    return res.status(400).json({ error: 'Borrow duration must be between 1 and 14 days' });
  }

  // Check borrow limit
  const activeCount = db.prepare(
    "SELECT COUNT(*) as count FROM borrow_records WHERE user_id = ? AND status = 'active'"
  ).get(userId);
  if (activeCount.count >= BORROW_LIMIT) {
    return res.status(400).json({ error: `You have reached the maximum borrow limit of ${BORROW_LIMIT} books` });
  }

  // Check book exists and is approved
  const book = db.prepare('SELECT * FROM books WHERE id = ? AND status = ?').get(id, 'approved');
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  // Check availability
  if (book.availability !== 'available') {
    return res.status(400).json({ error: 'Book is currently not available' });
  }

  // Check if user already has an active borrow of this book
  const existingBorrow = db.prepare(`
    SELECT id FROM borrow_records
    WHERE book_id = ? AND user_id = ? AND status = 'active'
  `).get(id, userId);

  if (existingBorrow) {
    return res.status(400).json({ error: 'You have already borrowed this book' });
  }

  // Calculate due date
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + duration);

  // Execute borrowing in a transaction
  const borrow = db.transaction(() => {
    const borrowId = uuidv4();

    db.prepare(`
      INSERT INTO borrow_records (id, book_id, user_id, due_date)
      VALUES (?, ?, ?, ?)
    `).run(borrowId, id, userId, dueDate.toISOString());

    db.prepare(`
      UPDATE books SET availability = 'borrowed', times_borrowed = times_borrowed + 1
      WHERE id = ?
    `).run(id);

    return borrowId;
  });

  const borrowId = borrow();

  res.json({
    message: 'Book borrowed successfully!',
    borrow_id: borrowId,
    due_date: dueDate.toISOString(),
    book_title: book.title
  });
});

/**
 * POST /api/books/bulk-borrow
 * Borrow multiple books at once (students and staff only)
 */
router.post('/bulk-borrow', authenticate, authorize('student', 'staff'), (req, res) => {
  const { book_ids, duration_days } = req.body;
  const userId = req.user.id;

  if (db.processAutoReturns) db.processAutoReturns();

  if (!Array.isArray(book_ids) || book_ids.length === 0) {
    return res.status(400).json({ error: 'No books selected' });
  }

  const duration = parseInt(duration_days);
  if (!duration || duration < 1 || duration > 14) {
    return res.status(400).json({ error: 'Borrow duration must be between 1 and 14 days' });
  }

  // Check borrow limit
  const activeCount = db.prepare(
    "SELECT COUNT(*) as count FROM borrow_records WHERE user_id = ? AND status = 'active'"
  ).get(userId);
  if (activeCount.count + book_ids.length > BORROW_LIMIT) {
    return res.status(400).json({
      error: `Cannot borrow ${book_ids.length} book(s). You have ${activeCount.count} active borrow(s) and the limit is ${BORROW_LIMIT}.`
    });
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + duration);
  const borrowed = [];
  const errors = [];

  const bulkBorrow = db.transaction(() => {
    for (const bookId of book_ids) {
      const book = db.prepare("SELECT * FROM books WHERE id = ? AND status = 'approved'").get(bookId);
      if (!book) { errors.push(`Book not found: ${bookId}`); continue; }
      if (book.availability !== 'available') { errors.push(`"${book.title}" is not available`); continue; }

      const existing = db.prepare(
        "SELECT id FROM borrow_records WHERE book_id = ? AND user_id = ? AND status = 'active'"
      ).get(bookId, userId);
      if (existing) { errors.push(`Already borrowed: "${book.title}"`); continue; }

      const borrowId = uuidv4();
      db.prepare('INSERT INTO borrow_records (id, book_id, user_id, due_date) VALUES (?, ?, ?, ?)')
        .run(borrowId, bookId, userId, dueDate.toISOString());
      db.prepare("UPDATE books SET availability = 'borrowed', times_borrowed = times_borrowed + 1 WHERE id = ?")
        .run(bookId);
      borrowed.push(book.title);
    }
  });

  bulkBorrow();

  res.json({
    message: `${borrowed.length} book(s) borrowed successfully!`,
    borrowed,
    errors,
    due_date: dueDate.toISOString()
  });
});

/**
 * GET /api/books/my-borrows
 * Get current user's borrow history
 */
router.get('/my-borrows', authenticate, authorize('student', 'staff'), (req, res) => {
  // Process auto-returns
  if (db.processAutoReturns) db.processAutoReturns();
  if (db.generateDueReminders) db.generateDueReminders();

  const borrows = db.prepare(`
    SELECT br.id, br.borrow_date, br.due_date, br.return_date, br.status,
           b.id as book_id, b.title, b.author_name, b.genre, b.file_path, b.file_name
    FROM borrow_records br
    JOIN books b ON br.book_id = b.id
    WHERE br.user_id = ?
    ORDER BY br.borrow_date DESC
  `).all(req.user.id);

  const activeCount = db.prepare(
    "SELECT COUNT(*) as count FROM borrow_records WHERE user_id = ? AND status = 'active'"
  ).get(req.user.id);

  res.json({ borrows, active_count: activeCount.count, borrow_limit: BORROW_LIMIT });
});

/**
 * POST /api/books/:id/return
 * Return a borrowed book (students and staff only)
 */
router.post('/:id/return', authenticate, authorize('student', 'staff'), (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  // Find the active borrow record for this book and user
  const borrowRecord = db.prepare(`
    SELECT br.id, br.due_date FROM borrow_records br
    WHERE br.book_id = ? AND br.user_id = ? AND br.status = 'active'
  `).get(id, userId);

  if (!borrowRecord) {
    return res.status(404).json({ error: 'No active borrow record found for this book' });
  }

  const returnDate = new Date().toISOString();

  // Execute return in a transaction
  const returnBook = db.transaction(() => {
    // Update borrow record with return date and status
    db.prepare(`
      UPDATE borrow_records
      SET status = 'returned', return_date = ?
      WHERE id = ?
    `).run(returnDate, borrowRecord.id);

    // Set book back to available
    db.prepare(`
      UPDATE books SET availability = 'available'
      WHERE id = ?
    `).run(id);

    // Archive due-date and auto-return notifications for this book
    db.prepare(`
      UPDATE notifications
      SET is_read = 1, is_archived = 1
      WHERE user_id = ? AND related_id = ? AND type IN ('due_reminder', 'auto_return')
    `).run(userId, id);
  });

  returnBook();

  res.json({ message: 'Book returned successfully!' });
});

/* =============================================
   AUTHOR ROUTES
   ============================================= */

/**
 * POST /api/books/submit
 * Author submits a new book for approval (supports cover image)
 */
router.post('/submit', authenticate, authorize('author'), uploadFields, (req, res) => {
  const { title, genre, description, draft_id } = req.body;
  const authorId = req.user.id;
  const bookFile = req.files?.book_file?.[0];
  const coverFile = req.files?.cover_image?.[0];

  // Validate required fields
  const errors = {};
  if (!title || title.trim().length === 0) errors.title = 'Title is required';
  if (!genre || genre.trim().length === 0) errors.genre = 'At least one genre is required';
  if (!description || description.trim().length < 20) {
    errors.description = 'Description must be at least 20 characters';
  }
  if (!bookFile) errors.file = 'Book file is required';

  // Validate cover image size (max 2MB)
  if (coverFile && coverFile.size > 2 * 1024 * 1024) {
    errors.cover = 'Cover image must be under 2MB';
  }

  if (Object.keys(errors).length > 0) {
    if (bookFile) fs.unlinkSync(bookFile.path);
    if (coverFile) fs.unlinkSync(coverFile.path);
    return res.status(400).json({ errors });
  }

  const author = db.prepare('SELECT full_name FROM users WHERE id = ?').get(authorId);
  const bookId = uuidv4();
  const coverPath = coverFile ? `uploads/covers/${coverFile.filename}` : null;

  db.prepare(`
    INSERT INTO books (id, title, author_id, author_name, genre, description, file_path, file_name, status, cover_image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    bookId, title.trim(), authorId, author.full_name,
    genre.trim(), description.trim(),
    path.join(UPLOADS_DIR, bookFile.filename), bookFile.originalname, coverPath
  );

  // Delete draft if this was submitted from a draft
  if (draft_id) {
    db.prepare('UPDATE books SET draft_data = NULL WHERE id = ? AND author_id = ?')
      .run(draft_id, authorId);
  }

  // Notify librarians about new submission
  const librarians = db.prepare("SELECT id FROM users WHERE role = 'librarian'").all();
  for (const lib of librarians) {
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, category, related_id)
      VALUES (?, ?, 'new_submission', 'New Book Submission', ?, 'submissions', ?)
    `).run(uuidv4(), lib.id, `"${title}" by ${author.full_name} has been submitted for review.`, bookId);
  }

  res.status(201).json({
    message: 'Book submitted for approval successfully!',
    book_id: bookId
  });
});

/**
 * POST /api/books/draft
 * Save book submission draft (text-only auto-save or manual save with optional file)
 */
router.post('/draft', authenticate, authorize('author'), uploadFields, (req, res) => {
  const { title, genre, description, draft_id } = req.body;
  const authorId = req.user.id;
  const author = db.prepare('SELECT full_name FROM users WHERE id = ?').get(authorId);

  const bookFile = req.files?.book_file?.[0];
  const draftData = JSON.stringify({ title, genre, description, saved_at: new Date().toISOString() });

  if (draft_id) {
    // Update existing draft
    if (bookFile) {
      db.prepare(`
        UPDATE books
        SET draft_data = ?, title = ?, genre = ?, description = ?,
            file_path = ?, file_name = ?
        WHERE id = ? AND author_id = ?
      `).run(
        draftData, title || 'Untitled Draft', genre || '', description || '',
        path.join(UPLOADS_DIR, bookFile.filename), bookFile.originalname, draft_id, authorId
      );
    } else {
      db.prepare(`
        UPDATE books
        SET draft_data = ?, title = ?, genre = ?, description = ?
        WHERE id = ? AND author_id = ?
      `).run(draftData, title || 'Untitled Draft', genre || '', description || '', draft_id, authorId);
    }
    return res.json({ message: 'Draft saved', draft_id });
  }

  // Create new draft record
  const draftId = uuidv4();
  db.prepare(`
    INSERT INTO books
      (id, title, author_id, author_name, genre, description, status, draft_data, file_path, file_name)
    VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
  `).run(
    draftId,
    title || 'Untitled Draft',
    authorId,
    author.full_name,
    genre || '',
    description || '',
    draftData,
    bookFile ? path.join(UPLOADS_DIR, bookFile.filename) : null,
    bookFile ? bookFile.originalname : null
  );

  res.json({ message: 'Draft saved', draft_id: draftId });
});

/**
 * GET /api/books/my-submissions
 * Get all books submitted by the logged-in author
 */
router.get('/my-submissions', authenticate, authorize('author'), (req, res) => {
  const books = db.prepare(`
    SELECT id, title, genre, description, status, submitted_date, publish_date, file_name, draft_data, cover_image, rejection_reason, availability
    FROM books
    WHERE author_id = ? AND status != 'draft'
    ORDER BY submitted_date DESC
  `).all(req.user.id);

  res.json(books);
});

/**
 * GET /api/books/my-drafts
 * Get all drafts by the logged-in author
 */
router.get('/my-drafts', authenticate, authorize('author'), (req, res) => {
  const drafts = db.prepare(`
    SELECT id, title, genre, description, draft_data, submitted_date
    FROM books
    WHERE author_id = ? AND status = 'draft'
    ORDER BY submitted_date DESC
  `).all(req.user.id);

  res.json(drafts);
});

/* =============================================
   LIBRARIAN ROUTES
   ============================================= */

/**
 * GET /api/books/pending
 * Get all pending book submissions (librarian only)
 */
router.get('/pending', authenticate, authorize('librarian'), (req, res) => {
  const { title, author, genre, status, date_from, date_to } = req.query;

  let query = `
    SELECT b.id, b.title, b.author_name, b.genre, b.description,
           b.submitted_date, b.status, b.file_name, b.cover_image,
           u.username as author_username
    FROM books b
    JOIN users u ON b.author_id = u.id
    WHERE b.status NOT IN ('draft')
  `;
  const params = [];

  // Apply filters
  if (title) { query += ' AND b.title LIKE ?'; params.push(`%${title}%`); }
  if (author) { query += ' AND (b.author_name LIKE ? OR u.username LIKE ?)'; params.push(`%${author}%`, `%${author}%`); }
  if (genre) { query += ' AND b.genre LIKE ?'; params.push(`%${genre}%`); }
  if (status) { query += ' AND b.status = ?'; params.push(status); }
  if (date_from) { query += ' AND b.submitted_date >= ?'; params.push(date_from); }
  if (date_to) { query += ' AND b.submitted_date <= ?'; params.push(date_to); }

  query += ' ORDER BY b.submitted_date DESC';

  const books = db.prepare(query).all(...params);
  res.json(books);
});

/**
 * PATCH /api/books/:id/approve
 * Approve a book submission
 */
router.patch('/:id/approve', authenticate, authorize('librarian'), (req, res) => {
  const { id } = req.params;

  const book = db.prepare('SELECT * FROM books WHERE id = ? AND status = ?').get(id, 'pending');
  if (!book) {
    return res.status(404).json({ error: 'Pending book submission not found' });
  }

  const publishDate = new Date().toISOString();
  db.prepare(`
    UPDATE books SET status = 'approved', availability = 'available', publish_date = ?
    WHERE id = ?
  `).run(publishDate, id);

  // Notify author
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, category, related_id)
    VALUES (?, ?, 'approval', 'Book Approved!', ?, 'submissions', ?)
  `).run(
    uuidv4(), book.author_id,
    `Your book "${book.title}" has been approved and published!`,
    id
  );

  res.json({ message: 'Book approved and published successfully', publish_date: publishDate });
});

/**
 * PATCH /api/books/:id/reject
 * Reject a book submission (with optional reason)
 */
router.patch('/:id/reject', authenticate, authorize('librarian'), (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const book = db.prepare('SELECT * FROM books WHERE id = ? AND status = ?').get(id, 'pending');
  if (!book) {
    return res.status(404).json({ error: 'Pending book submission not found' });
  }

  db.prepare("UPDATE books SET status = 'rejected', rejection_reason = ? WHERE id = ?")
    .run(reason || null, id);

  // Notify author
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
    VALUES (?, ?, 'rejection', 'Book Rejected', ?, 'urgent', 'submissions', ?)
  `).run(
    uuidv4(), book.author_id,
    `Your book "${book.title}" has been rejected.${reason ? ` Reason: ${reason}` : ''}`,
    id
  );

  res.json({ message: 'Book submission rejected' });
});

/**
 * PATCH /api/books/:id/approve-delete
 * Librarian approves a deletion request — physically removes the book
 */
router.patch('/:id/approve-delete', authenticate, authorize('librarian'), (req, res) => {
  const { id } = req.params;

  const book = db.prepare("SELECT * FROM books WHERE id = ? AND status = 'pending_deletion'").get(id);
  if (!book) {
    return res.status(404).json({ error: 'No pending deletion request found for this book' });
  }

  // Auto-return any active borrows before deletion
  const activeBorrows = db.prepare(
    "SELECT id, user_id FROM borrow_records WHERE book_id = ? AND status = 'active'"
  ).all(id);
  const now = new Date().toISOString();
  for (const borrow of activeBorrows) {
    db.prepare("UPDATE borrow_records SET status = 'returned', return_date = ? WHERE id = ?")
      .run(now, borrow.id);
  }

  // Notify affected users (anyone who ever borrowed)
  const affectedUsers = db.prepare(
    'SELECT DISTINCT user_id FROM borrow_records WHERE book_id = ?'
  ).all(id);
  for (const u of affectedUsers) {
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
      VALUES (?, ?, 'book_deleted', 'Book Removed', ?, 'normal', 'general', ?)
    `).run(uuidv4(), u.user_id, `"${book.title}" has been removed from the library.`, id);
  }

  // Notify the author
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, category, related_id)
    VALUES (?, ?, 'approval', 'Deletion Approved', ?, 'submissions', ?)
  `).run(uuidv4(), book.author_id, `Your deletion request for "${book.title}" has been approved.`, id);

  // Delete related records and the book
  db.prepare('DELETE FROM bookmarks WHERE book_id = ?').run(id);
  db.prepare('DELETE FROM highlights WHERE book_id = ?').run(id);
  db.prepare('DELETE FROM notifications WHERE related_id = ? AND type = ?').run(id, 'delete_request');
  db.prepare('DELETE FROM borrow_records WHERE book_id = ?').run(id);
  db.prepare('DELETE FROM books WHERE id = ?').run(id);

  // Clean up files
  const resolved = resolveFilePath(book.file_path);
  if (resolved) fs.unlinkSync(resolved);
  if (book.cover_image) {
    const coverPath = path.join(__dirname, '..', book.cover_image);
    if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
  }

  res.json({ message: 'Book deletion approved and removed' });
});

/**
 * PATCH /api/books/:id/reject-delete
 * Librarian rejects a deletion request — restores book to approved status
 */
router.patch('/:id/reject-delete', authenticate, authorize('librarian'), (req, res) => {
  const { id } = req.params;

  const book = db.prepare("SELECT * FROM books WHERE id = ? AND status = 'pending_deletion'").get(id);
  if (!book) {
    return res.status(404).json({ error: 'No pending deletion request found for this book' });
  }

  db.prepare("UPDATE books SET status = 'approved' WHERE id = ?").run(id);

  // Notify author
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, category, related_id)
    VALUES (?, ?, 'rejection', 'Deletion Request Rejected', ?, 'submissions', ?)
  `).run(uuidv4(), book.author_id, `Your deletion request for "${book.title}" has been rejected. The book remains published.`, id);

  res.json({ message: 'Deletion request rejected, book restored' });
});

/**
 * POST /api/books/bulk-action
 * Perform bulk approve or reject on multiple books
 */
router.post('/bulk-action', authenticate, authorize('librarian'), (req, res) => {
  const { book_ids, action } = req.body;

  if (!Array.isArray(book_ids) || book_ids.length === 0) {
    return res.status(400).json({ error: 'No books selected' });
  }
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  const placeholders = book_ids.map(() => '?').join(',');
  
  const bulkAction = db.transaction(() => {
    if (action === 'approve') {
      const publishDate = new Date().toISOString();
      db.prepare(`
        UPDATE books SET status = 'approved', availability = 'available', publish_date = ?
        WHERE id IN (${placeholders}) AND status = 'pending'
      `).run(publishDate, ...book_ids);
    } else {
      db.prepare(`
        UPDATE books SET status = 'rejected'
        WHERE id IN (${placeholders}) AND status = 'pending'
      `).run(...book_ids);
    }
  });

  bulkAction();

  res.json({ message: `${book_ids.length} book(s) ${action}d successfully` });
});

/**
 * GET /api/books/download/:id
 * Download book file (authenticated users only)
 */
router.get('/download/:id', authenticate, (req, res) => {
  const book = db.prepare('SELECT file_path, file_name FROM books WHERE id = ?').get(req.params.id);
  const resolved = resolveFilePath(book?.file_path);

  if (!book || !resolved) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(resolved, book.file_name);
});

/**
 * GET /api/books/view/:id
 * View book file inline (for PDF reader)
 */
router.get('/view/:id', authenticate, (req, res) => {
  const book = db.prepare('SELECT file_path, file_name FROM books WHERE id = ?').get(req.params.id);
  const resolved = resolveFilePath(book?.file_path);

  if (!book || !resolved) {
    return res.status(404).json({ error: 'File not found' });
  }

  const ext = path.extname(book.file_name || '').toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };

  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${book.file_name}"`);
  fs.createReadStream(resolved).pipe(res);
});

/* =============================================
   AUTHOR: EDIT & DELETE BOOKS
   ============================================= */

/**
 * PUT /api/books/:id/edit
 * Author edits their own book (only pending or approved+available)
 */
router.put('/:id/edit', authenticate, authorize('author'), uploadFields, (req, res) => {
  const { id } = req.params;
  const { title, genre, description } = req.body;
  const bookFile = req.files?.book_file?.[0];
  const coverFile = req.files?.cover_image?.[0];

  const book = db.prepare('SELECT * FROM books WHERE id = ? AND author_id = ?').get(id, req.user.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });

  // Only allow edit if pending OR (approved and not currently borrowed)
  if (book.status === 'pending' || (book.status === 'approved' && book.availability !== 'borrowed')) {
    const errors = {};
    if (title !== undefined && title.trim().length === 0) errors.title = 'Title cannot be empty';
    if (description !== undefined && description.trim().length < 20) {
      errors.description = 'Description must be at least 20 characters';
    }
    if (Object.keys(errors).length > 0) {
      if (bookFile) fs.unlinkSync(bookFile.path);
      if (coverFile) fs.unlinkSync(coverFile.path);
      return res.status(400).json({ errors });
    }

    let updateQuery = 'UPDATE books SET ';
    const updates = [];
    const params = [];

    if (title !== undefined) { updates.push('title = ?'); params.push(title.trim()); }
    if (genre !== undefined) { updates.push('genre = ?'); params.push(genre.trim()); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description.trim()); }
    if (bookFile) {
      updates.push('file_path = ?, file_name = ?');
      params.push(path.join(UPLOADS_DIR, bookFile.filename), bookFile.originalname);
    }
    if (coverFile) {
      updates.push('cover_image = ?');
      params.push(`uploads/covers/${coverFile.filename}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // If editing an approved book, set status back to pending for re-approval
    const wasApproved = book.status === 'approved';
    if (wasApproved) {
      updates.push("status = 'pending'");
      updates.push("availability = 'available'");
    }

    updateQuery += updates.join(', ') + ' WHERE id = ?';
    params.push(id);
    db.prepare(updateQuery).run(...params);

    // Notify librarians if an approved book was edited and needs re-approval
    if (wasApproved) {
      const librarians = db.prepare("SELECT id FROM users WHERE role = 'librarian'").all();
      for (const lib of librarians) {
        db.prepare(`
          INSERT INTO notifications (id, user_id, type, title, message, category, related_id)
          VALUES (?, ?, 'new_submission', 'Book Re-Submitted for Review', ?, 'submissions', ?)
        `).run(uuidv4(), lib.id, `"${title || book.title}" by ${book.author_name} has been edited and requires re-approval.`, id);
      }
    }

    res.json({ message: wasApproved ? 'Book updated and sent for re-approval' : 'Book updated successfully' });
  } else {
    if (bookFile) fs.unlinkSync(bookFile.path);
    if (coverFile) fs.unlinkSync(coverFile.path);
    return res.status(400).json({ error: 'Cannot edit this book. It must be pending or approved and not currently borrowed.' });
  }
});

/**
 * DELETE /api/books/:id
 * Author requests deletion of their own book (sends to librarian for approval)
 */
router.delete('/:id', authenticate, authorize('author'), (req, res) => {
  const { id } = req.params;

  const book = db.prepare('SELECT * FROM books WHERE id = ? AND author_id = ?').get(id, req.user.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });

  if (book.status === 'pending_deletion') {
    return res.status(400).json({ error: 'Deletion request already pending' });
  }

  // Mark book as pending deletion instead of hard deleting
  db.prepare("UPDATE books SET status = 'pending_deletion' WHERE id = ?").run(id);

  // Notify librarians about the deletion request
  const librarians = db.prepare("SELECT id FROM users WHERE role = 'librarian'").all();
  for (const lib of librarians) {
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
      VALUES (?, ?, 'delete_request', 'Book Deletion Request', ?, 'normal', 'submissions', ?)
    `).run(uuidv4(), lib.id, `Author "${book.author_name}" has requested deletion of "${book.title}".`, id);
  }

  res.json({ message: 'Deletion request sent to librarian for approval' });
});

/**
 * POST /api/books/bulk-delete
 * Author bulk-requests deletion of their own books (sends to librarian)
 */
router.post('/bulk-delete', authenticate, authorize('author'), (req, res) => {
  const { book_ids } = req.body;
  if (!Array.isArray(book_ids) || book_ids.length === 0) {
    return res.status(400).json({ error: 'No books selected' });
  }

  const requested = [];
  const errors = [];

  const bulkDelete = db.transaction(() => {
    for (const bookId of book_ids) {
      const book = db.prepare('SELECT * FROM books WHERE id = ? AND author_id = ?').get(bookId, req.user.id);
      if (!book) { errors.push(`Book not found: ${bookId}`); continue; }
      if (book.status === 'pending_deletion') { errors.push(`"${book.title}" already pending deletion`); continue; }

      db.prepare("UPDATE books SET status = 'pending_deletion' WHERE id = ?").run(bookId);
      requested.push(book.title);
    }

    // Notify librarians about bulk deletion requests
    if (requested.length > 0) {
      const librarians = db.prepare("SELECT id FROM users WHERE role = 'librarian'").all();
      const author = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.user.id);
      for (const lib of librarians) {
        db.prepare(`
          INSERT INTO notifications (id, user_id, type, title, message, priority, category)
          VALUES (?, ?, 'delete_request', 'Bulk Deletion Request', ?, 'normal', 'submissions')
        `).run(uuidv4(), lib.id, `Author "${author.full_name}" has requested deletion of ${requested.length} book(s).`);
      }
    }
  });

  bulkDelete();
  res.json({ message: `${requested.length} book(s) deletion requested`, deleted: requested, errors });
});

/* =============================================
   BOOKMARKS (Student/Staff)
   ============================================= */

/**
 * GET /api/books/:id/bookmarks
 * Get bookmarks for a book by the current user
 */
router.get('/:id/bookmarks', authenticate, (req, res) => {
  const bookmarks = db.prepare(
    'SELECT * FROM bookmarks WHERE book_id = ? AND user_id = ? ORDER BY page_number ASC'
  ).all(req.params.id, req.user.id);
  res.json(bookmarks);
});

/**
 * POST /api/books/:id/bookmarks
 * Add a bookmark
 */
router.post('/:id/bookmarks', authenticate, (req, res) => {
  const { page_number, label } = req.body;
  if (!page_number || page_number < 1) {
    return res.status(400).json({ error: 'Valid page number is required' });
  }

  const id = uuidv4();
  db.prepare(
    'INSERT INTO bookmarks (id, user_id, book_id, page_number, label) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.user.id, req.params.id, page_number, label || null);

  res.status(201).json({ message: 'Bookmark added', id });
});

/**
 * DELETE /api/books/bookmarks/:id
 * Remove a bookmark
 */
router.delete('/bookmarks/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  res.json({ message: 'Bookmark removed' });
});

/* =============================================
   HIGHLIGHTS (Student/Staff)
   ============================================= */

/**
 * GET /api/books/:id/highlights
 * Get highlights for a book by the current user
 */
router.get('/:id/highlights', authenticate, (req, res) => {
  const highlights = db.prepare(
    'SELECT * FROM highlights WHERE book_id = ? AND user_id = ? ORDER BY page_number ASC, created_at ASC'
  ).all(req.params.id, req.user.id);
  res.json(highlights);
});

/**
 * POST /api/books/:id/highlights
 * Add a highlight
 */
router.post('/:id/highlights', authenticate, (req, res) => {
  const { page_number, text_content, color } = req.body;
  if (!page_number || !text_content) {
    return res.status(400).json({ error: 'Page number and text content are required' });
  }

  const id = uuidv4();
  db.prepare(
    'INSERT INTO highlights (id, user_id, book_id, page_number, text_content, color) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, req.user.id, req.params.id, page_number, text_content, color || '#c9a84c');

  res.status(201).json({ message: 'Highlight added', id });
});

/**
 * DELETE /api/books/highlights/:id
 * Remove a highlight
 */
router.delete('/highlights/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM highlights WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  res.json({ message: 'Highlight removed' });
});

/* =============================================
   LIBRARIAN: BORROW RECORDS
   ============================================= */

/**
 * GET /api/books/borrow-records
 * Get all borrow records (librarian only) with filtering
 */
router.get('/borrow-records', authenticate, authorize('librarian'), (req, res) => {
  // Process auto-returns first
  if (db.processAutoReturns) db.processAutoReturns();

  const { search, status, date_from, date_to } = req.query;

  let query = `
    SELECT br.id, br.borrow_date, br.due_date, br.return_date, br.status,
           b.id as book_id, b.title, b.author_name,
           u.username as borrower_username, u.full_name as borrower_name
    FROM borrow_records br
    JOIN books b ON br.book_id = b.id
    JOIN users u ON br.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ' AND (b.title LIKE ? OR u.username LIKE ? OR u.full_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) {
    if (status === 'overdue') {
      query += " AND br.status = 'active' AND br.due_date < ?";
      params.push(new Date().toISOString());
    } else {
      query += ' AND br.status = ?';
      params.push(status);
    }
  }
  if (date_from) { query += ' AND br.borrow_date >= ?'; params.push(date_from); }
  if (date_to) { query += ' AND br.borrow_date <= ?'; params.push(date_to); }

  query += ' ORDER BY br.borrow_date DESC';

  const records = db.prepare(query).all(...params);
  res.json(records);
});

/**
 * GET /api/books/borrow-records/export
 * Export borrow records as CSV (librarian only)
 */
router.get('/borrow-records/export', authenticate, authorize('librarian'), (req, res) => {
  if (db.processAutoReturns) db.processAutoReturns();

  const records = db.prepare(`
    SELECT b.title as "Book Title", u.username as "Borrower Username",
           u.full_name as "Borrower Name", br.borrow_date as "Borrow Date",
           br.due_date as "Due Date", br.return_date as "Return Date", br.status as "Status"
    FROM borrow_records br
    JOIN books b ON br.book_id = b.id
    JOIN users u ON br.user_id = u.id
    ORDER BY br.borrow_date DESC
  `).all();

  const headers = ['Book Title', 'Borrower Username', 'Borrower Name', 'Borrow Date', 'Due Date', 'Return Date', 'Status'];
  const csvRows = [headers.join(',')];
  for (const r of records) {
    csvRows.push(headers.map(h => `"${(r[h] || '').toString().replace(/"/g, '""')}"`).join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="borrow_records.csv"');
  res.send(csvRows.join('\n'));
});

/* =============================================
   LIBRARIAN: PREVIEW BOOK FILE
   ============================================= */

/**
 * GET /api/books/preview/:id
 * Librarian can preview/download book file before approval
 */
router.get('/preview/:id', authenticate, authorize('librarian'), (req, res) => {
  const book = db.prepare('SELECT file_path, file_name FROM books WHERE id = ?').get(req.params.id);
  const resolved = resolveFilePath(book?.file_path);

  if (!book || !resolved) {
    return res.status(404).json({ error: 'File not found' });
  }

  const ext = path.extname(book.file_name || '').toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };

  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${book.file_name}"`);
  fs.createReadStream(resolved).pipe(res);
});

module.exports = router;
