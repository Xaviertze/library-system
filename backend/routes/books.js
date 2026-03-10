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

// Configure multer for book file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'books');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename and add unique prefix
    const uniqueName = `${uuidv4()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    cb(null, uniqueName);
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
    if (allowedMimetypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, TXT, DOC, and DOCX files are allowed'));
    }
  }
});

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
           b.availability, b.publish_date, b.times_borrowed
    FROM books b
    WHERE b.status = 'approved'
    ORDER BY b.publish_date DESC
  `).all();

  res.json(books);
});

/**
 * GET /api/books/recommendations
 * Get book recommendations based on borrowing history and popularity
 */
router.get('/recommendations', authenticate, authorize('student', 'staff'), (req, res) => {
  const userId = req.user.id;

  // Get genres from user's borrowing history
  const userGenres = db.prepare(`
    SELECT DISTINCT b.genre
    FROM borrow_records br
    JOIN books b ON br.book_id = b.id
    WHERE br.user_id = ?
  `).all(userId);

  let recommended = [];

  if (userGenres.length > 0) {
    // Recommend books in genres the user has read before
    const genreList = userGenres.map(g => g.genre).join(',');
    recommended = db.prepare(`
      SELECT b.id, b.title, b.author_name, b.genre, b.description,
             b.availability, b.publish_date, b.times_borrowed
      FROM books b
      WHERE b.status = 'approved'
        AND b.id NOT IN (
          SELECT book_id FROM borrow_records WHERE user_id = ?
        )
        AND (${userGenres.map(() => "b.genre LIKE ?").join(' OR ')})
      ORDER BY b.times_borrowed DESC
      LIMIT 6
    `).all(userId, ...userGenres.map(g => `%${g.genre.split(',')[0]}%`));
  }

  // Fill remainder with most popular books
  if (recommended.length < 6) {
    const excluded = recommended.map(b => b.id);
    const excludeClause = excluded.length > 0 
      ? `AND b.id NOT IN (${excluded.map(() => '?').join(',')})` 
      : '';
    
    const popular = db.prepare(`
      SELECT b.id, b.title, b.author_name, b.genre, b.description,
             b.availability, b.publish_date, b.times_borrowed
      FROM books b
      WHERE b.status = 'approved'
        AND b.id NOT IN (SELECT book_id FROM borrow_records WHERE user_id = ?)
        ${excludeClause}
      ORDER BY b.times_borrowed DESC
      LIMIT ?
    `).all(userId, ...excluded, 6 - recommended.length);

    recommended = [...recommended, ...popular];
  }

  res.json(recommended);
});

/**
 * POST /api/books/:id/borrow
 * Borrow a book (students and staff only)
 */
router.post('/:id/borrow', authenticate, authorize('student', 'staff'), (req, res) => {
  const { id } = req.params;
  const { duration_days } = req.body;
  const userId = req.user.id;

  // Validate borrow duration (1-14 days)
  const duration = parseInt(duration_days);
  if (!duration || duration < 1 || duration > 14) {
    return res.status(400).json({ error: 'Borrow duration must be between 1 and 14 days' });
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
 * GET /api/books/my-borrows
 * Get current user's borrow history
 */
router.get('/my-borrows', authenticate, authorize('student', 'staff'), (req, res) => {
  const borrows = db.prepare(`
    SELECT br.id, br.borrow_date, br.due_date, br.return_date, br.status,
           b.id as book_id, b.title, b.author_name, b.genre
    FROM borrow_records br
    JOIN books b ON br.book_id = b.id
    WHERE br.user_id = ?
    ORDER BY br.borrow_date DESC
  `).all(req.user.id);

  res.json(borrows);
});

/* =============================================
   AUTHOR ROUTES
   ============================================= */

/**
 * POST /api/books/submit
 * Author submits a new book for approval
 */
router.post('/submit', authenticate, authorize('author'), upload.single('book_file'), (req, res) => {
  const { title, genre, description, draft_id } = req.body;
  const authorId = req.user.id;

  // Validate required fields
  const errors = {};
  if (!title || title.trim().length === 0) errors.title = 'Title is required';
  if (!genre || genre.trim().length === 0) errors.genre = 'At least one genre is required';
  if (!description || description.trim().length < 20) {
    errors.description = 'Description must be at least 20 characters';
  }
  if (!req.file) errors.file = 'Book file is required';

  if (Object.keys(errors).length > 0) {
    // Remove uploaded file if validation fails
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ errors });
  }

  // Fetch author's full name
  const author = db.prepare('SELECT full_name FROM users WHERE id = ?').get(authorId);

  const bookId = uuidv4();

  db.prepare(`
    INSERT INTO books (id, title, author_id, author_name, genre, description, file_path, file_name, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    bookId,
    title.trim(),
    authorId,
    author.full_name,
    genre.trim(),
    description.trim(),
    req.file.path,
    req.file.originalname
  );

  // Delete draft if this was submitted from a draft
  if (draft_id) {
    db.prepare('UPDATE books SET draft_data = NULL WHERE id = ? AND author_id = ?')
      .run(draft_id, authorId);
  }

  res.status(201).json({
    message: 'Book submitted for approval successfully!',
    book_id: bookId
  });
});

/**
 * POST /api/books/draft
 * Auto-save book submission draft
 */
router.post('/draft', authenticate, authorize('author'), (req, res) => {
  const { title, genre, description, draft_id } = req.body;
  const authorId = req.user.id;
  const author = db.prepare('SELECT full_name FROM users WHERE id = ?').get(authorId);

  const draftData = JSON.stringify({ title, genre, description, saved_at: new Date().toISOString() });

  if (draft_id) {
    // Update existing draft
    db.prepare('UPDATE books SET draft_data = ? WHERE id = ? AND author_id = ?')
      .run(draftData, draft_id, authorId);
    return res.json({ message: 'Draft saved', draft_id });
  }

  // Create new draft record
  const draftId = uuidv4();
  db.prepare(`
    INSERT INTO books (id, title, author_id, author_name, genre, description, status, draft_data)
    VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
  `).run(draftId, title || 'Untitled Draft', authorId, author.full_name, genre || '', description || '', draftData);

  res.json({ message: 'Draft saved', draft_id: draftId });
});

/**
 * GET /api/books/my-submissions
 * Get all books submitted by the logged-in author
 */
router.get('/my-submissions', authenticate, authorize('author'), (req, res) => {
  const books = db.prepare(`
    SELECT id, title, genre, description, status, submitted_date, publish_date, file_name, draft_data
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
           b.submitted_date, b.status, b.file_name,
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

  res.json({ message: 'Book approved and published successfully', publish_date: publishDate });
});

/**
 * PATCH /api/books/:id/reject
 * Reject a book submission
 */
router.patch('/:id/reject', authenticate, authorize('librarian'), (req, res) => {
  const { id } = req.params;

  const book = db.prepare('SELECT * FROM books WHERE id = ? AND status = ?').get(id, 'pending');
  if (!book) {
    return res.status(404).json({ error: 'Pending book submission not found' });
  }

  db.prepare("UPDATE books SET status = 'rejected' WHERE id = ?").run(id);
  res.json({ message: 'Book submission rejected' });
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
  
  if (!book || !book.file_path || !fs.existsSync(book.file_path)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(book.file_path, book.file_name);
});

module.exports = router;
