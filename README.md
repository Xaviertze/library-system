# 📚 BiblioVault — E-Book Library Management System

A full-stack digital library system with role-based portals for Students, Staff, Authors, and Librarians.

---

## 🗂️ Architecture

```
library-system/
├── backend/              # Node.js + Express REST API
│   ├── server.js         # Entry point & middleware setup
│   ├── database.js       # SQLite schema & initialization
│   ├── middleware/
│   │   └── auth.js       # JWT authentication middleware
│   ├── routes/
│   │   ├── auth.js       # Registration & login routes
│   │   └── books.js      # All book-related routes
│   ├── data/             # SQLite database file (auto-created)
│   └── uploads/          # Uploaded book files (auto-created)
│
└── frontend/             # React + Vite SPA
    └── src/
        ├── App.jsx        # Routing & role-based redirects
        ├── context/
        │   └── AuthContext.jsx  # Global auth state
        ├── pages/
        │   ├── LoginPage.jsx
        │   ├── RegisterPage.jsx
        │   ├── StudentPortal.jsx
        │   ├── AuthorPortal.jsx
        │   └── LibrarianPortal.jsx
        ├── components/
        │   ├── Sidebar.jsx
        │   └── BookModal.jsx
        ├── utils/
        │   └── api.js     # Axios instance with auth interceptor
        └── styles/
            └── global.css
```

---

## ⚙️ Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | React 18, React Router v6, Axios  |
| Build     | Vite 5                            |
| Backend   | Node.js, Express.js               |
| Database  | SQLite (via better-sqlite3)       |
| Auth      | JWT (jsonwebtoken) + bcrypt       |
| Files     | Multer (multipart upload)         |

---

## 🚀 Setup & Installation

### Prerequisites
- **Node.js** v18 or higher
- **npm** v8 or higher

### 1. Install dependencies

Before running the app for the first time, install dependencies for both the backend and frontend:

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment (first run only)

```bash
cd backend
copy .env.example .env
```

Open `backend/.env` and set a value for `JWT_SECRET` if desired. The defaults work fine for local development.

---

## ▶️ Running the App (Windows — Batch Files)

Three `.bat` files in the project root handle everything. **Double-click or run them from any terminal.**

### `start.bat` — Start both servers

```bat
start.bat
```

- Launches the **backend** (`http://localhost:5000`) in its own console window titled **BiblioVault - Backend**.
- Waits 3 seconds, then launches the **frontend** (`http://localhost:3000`) in a second window titled **BiblioVault - Frontend**.
- Warns instead of double-starting if a port is already in use.
- Open **http://localhost:3000** in your browser once both windows are running.

### `stop.bat` — Stop both servers

```bat
stop.bat
```

- Closes the **BiblioVault - Backend** and **BiblioVault - Frontend** console windows.
- Also kills any remaining Node.js process still holding ports 5000 or 3000.

### `status.bat` — Check whether servers are running

```bat
status.bat
```

Prints a quick status line for each server, for example:

```
[RUNNING]  Backend   http://localhost:5000
[STOPPED]  Frontend  http://localhost:3000
```

---

## 🛠️ Manual Start (alternative)

If you prefer to run each server without the `.bat` files, open two terminals:

**Backend:**

```bash
cd backend
npm start
```

**Frontend:**

```bash
cd frontend
npm run dev
```

Backend: **http://localhost:5000** · Frontend: **http://localhost:3000**

The SQLite database and upload directories are created automatically on first run.

---

## 👥 User Roles & Portals

| Role      | Portal             | Key Features                                    |
|-----------|--------------------|-------------------------------------------------|
| Student   | Student Portal     | Browse, search, and borrow approved books       |
| Staff     | Student Portal     | Same as student                                 |
| Author    | Author Portal      | Submit books, auto-save drafts, track status    |
| Librarian | Librarian Portal   | Review, approve/reject, bulk actions, filter    |

### Role Routing
After login, users are automatically redirected:
- Student / Staff → `/student`
- Author → `/author`
- Librarian → `/librarian`

---

## 🔐 Authentication

- Unified registration and login for all roles
- Passwords are hashed with **bcrypt** (cost factor 12)
- Sessions use **JWT tokens** (24-hour expiry)
- Password requirements: 8+ chars, uppercase, lowercase, digit, special char

---

## 📖 Feature Overview

### Student / Staff Portal
- ✅ Browse all approved books with search & filter
- ✅ View book summary in popup modal before borrowing
- ✅ Borrow books with duration slider (1–14 days)
- ✅ Confirmation dialog showing due date before confirming
- ✅ View borrow history with overdue detection
- ✅ Book recommendations (by genre history + popularity)
- ✅ Visual available/unavailable status indicators

### Author Portal
- ✅ Submit books with title, multi-genre, description, file upload
- ✅ Drag-and-drop file upload (PDF, TXT, DOC, DOCX, max 50MB)
- ✅ Author name auto-filled from account
- ✅ Auto-save draft every 3 seconds of inactivity
- ✅ Resume drafts from the Drafts tab
- ✅ Track submission status (Pending / Approved / Rejected)

### Librarian Portal
- ✅ View all pending submissions in a sortable table
- ✅ Full submission history (all statuses)
- ✅ Approve or reject individual submissions with confirmation
- ✅ Bulk select and bulk approve/reject
- ✅ Filter by title, author, genre, status, and date range
- ✅ Approval auto-sets publish date and makes book available

---

## 🗃️ Data Model

### Users
| Field       | Type   | Notes                              |
|-------------|--------|------------------------------------|
| id          | UUID   | Primary key                        |
| username    | TEXT   | Unique across all roles            |
| full_name   | TEXT   | Required                           |
| password_hash | TEXT | bcrypt hash                       |
| role        | TEXT   | student / staff / author / librarian |
| bio         | TEXT   | Authors only (optional)            |
| employee_id | TEXT   | Librarians only (optional)         |

### Books
| Field         | Type     | Notes                          |
|---------------|----------|--------------------------------|
| id            | UUID     | Primary key                    |
| title         | TEXT     | Required                       |
| author_id     | UUID     | FK → users                     |
| author_name   | TEXT     | Denormalized for display       |
| genre         | TEXT     | Comma-separated genres         |
| description   | TEXT     | Abstract / summary             |
| file_path     | TEXT     | Server path to uploaded file   |
| status        | TEXT     | pending / approved / rejected  |
| availability  | TEXT     | available / borrowed           |
| publish_date  | DATETIME | Set on librarian approval      |
| times_borrowed| INTEGER  | Borrowing count for popularity |

### Borrow Records
| Field       | Type     | Notes                       |
|-------------|----------|-----------------------------|
| id          | UUID     | Primary key                 |
| book_id     | UUID     | FK → books                  |
| user_id     | UUID     | FK → users                  |
| borrow_date | DATETIME | When borrowed               |
| due_date    | DATETIME | Calculated from duration    |
| return_date | DATETIME | NULL if not returned        |
| status      | TEXT     | active / returned / overdue |

---

## 🌐 API Endpoints

### Auth
| Method | Path              | Description            |
|--------|-------------------|------------------------|
| POST   | /api/auth/register | Register new user     |
| POST   | /api/auth/login    | Login, get JWT token  |

### Books
| Method | Path                      | Role        | Description                  |
|--------|---------------------------|-------------|------------------------------|
| GET    | /api/books                | Student/Staff | List approved books         |
| GET    | /api/books/recommendations| Student/Staff | Personalized recommendations|
| POST   | /api/books/:id/borrow     | Student/Staff | Borrow a book               |
| GET    | /api/books/my-borrows     | Student/Staff | User's borrow history       |
| POST   | /api/books/submit         | Author      | Submit new book              |
| POST   | /api/books/draft          | Author      | Save/update draft            |
| GET    | /api/books/my-submissions | Author      | Author's submissions         |
| GET    | /api/books/my-drafts      | Author      | Author's drafts              |
| GET    | /api/books/pending        | Librarian   | All submissions + filters    |
| PATCH  | /api/books/:id/approve    | Librarian   | Approve a submission         |
| PATCH  | /api/books/:id/reject     | Librarian   | Reject a submission          |
| POST   | /api/books/bulk-action    | Librarian   | Bulk approve/reject          |
| GET    | /api/books/download/:id   | All         | Download book file           |

---

## 🔒 Security Notes

- Passwords are never stored in plain text
- JWT tokens expire after 24 hours
- File uploads are validated by MIME type
- Role-based middleware prevents cross-portal access
- SQLite uses parameterized queries (no SQL injection)

---

## 🎨 Design

- **Aesthetic**: Dark academic / library noir
- **Fonts**: Cormorant Garamond (display) + DM Sans (body)
- **Colors**: Deep ink navy, gold accents, emerald/ruby status indicators
- **Responsive**: Mobile-friendly layout

---

## 📝 License

MIT — for educational and personal use.
