# BiblioVault — E-Book Library Management System

A full-stack digital library system with role-based portals for Students, Staff, Authors, and Librarians. Features include book borrowing with PDF reading, bookmarks, highlights, notification boards, profile management, user administration, crash recovery, and more.

---

## Architecture

```
library-system/
├── backend/                  # Node.js + Express REST API
│   ├── server.js             # Entry point & middleware setup
│   ├── database.js           # SQLite schema, migrations & helpers
│   ├── middleware/
│   │   └── auth.js           # JWT authentication middleware
│   ├── routes/
│   │   ├── auth.js           # Registration & login routes
│   │   ├── books.js          # Book CRUD, borrowing, bookmarks, highlights
│   │   ├── users.js          # Profile management & user administration
│   │   ├── notifications.js  # Notification CRUD & announcements
│   │   └── recovery.js       # Crash recovery state persistence
│   ├── data/                 # SQLite database file (auto-created)
│   └── uploads/
│       ├── books/            # Uploaded book files
│       ├── covers/           # Book cover images
│       └── avatars/          # Profile pictures
│
└── frontend/                 # React + Vite SPA
    └── src/
        ├── App.jsx            # Routing, role redirects & crash recovery
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
        │   ├── BookModal.jsx
        │   ├── PDFReader.jsx          # In-browser PDF viewer
        │   ├── NotificationBoard.jsx  # Shared notification UI
        │   ├── ProfileEditor.jsx      # Shared profile management
        │   └── CrashRecovery.jsx      # Crash test & recovery system
        ├── utils/
        │   └── api.js         # Axios instance with auth interceptor
        └── styles/
            └── global.css
```

---

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | React 18, React Router v6, Axios  |
| Build     | Vite 5                            |
| Backend   | Node.js, Express.js               |
| Database  | SQLite (via better-sqlite3)       |
| Auth      | JWT (jsonwebtoken) + bcrypt       |
| Files     | Multer (multipart upload)         |

---

## Setup & Installation

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

## Running the App (Windows — Batch Files)

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

## Manual Start (alternative)

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

## User Roles & Portals

| Role      | Portal             | Key Features                                    |
|-----------|--------------------|-------------------------------------------------|
| Student   | Student Portal     | Browse, borrow, read PDF, bookmarks, highlights |
| Staff     | Student Portal     | Same as student                                 |
| Author    | Author Portal      | Submit books, edit/delete, cover images, drafts  |
| Librarian | Librarian Portal   | Approve/reject, manage users, borrow records    |

### Role Routing
After login, users are automatically redirected:
- Student / Staff → `/student`
- Author → `/author`
- Librarian → `/librarian`

---

## Authentication

- Unified registration and login for all roles
- Passwords are hashed with **bcrypt** (cost factor 12)
- Sessions use **JWT tokens** (24-hour expiry)
- Password requirements: 8+ chars, uppercase, lowercase, digit, special char

---

## Feature Overview

### System-Wide Features
- **Crash Recovery**: "Crash Test" button on every portal simulates a crash; on reload, a recovery dialog offers to restore the last screen and state
- **Notification Board**: All portals have a Notifications tab with filtering, priority levels, search, mark-as-read, archive, and delete
- **Profile Management**: All portals have a Profile tab to edit full name, change password (with strength meter), and upload a profile picture
- **Password Re-authentication**: Profile changes require current password confirmation

### Student / Staff Portal
- Browse all approved books with search & filter (title, author, genre, availability, publish date)
- View book summary in popup modal before borrowing
- Borrow books with duration slider (1-14 days)
- **Borrow limit**: Maximum 5 active borrows per user
- **Multi-borrow**: Select multiple available books and borrow them all at once
- Confirmation dialog showing due date before confirming
- View borrow history with overdue detection
- **PDF Reader**: Open borrowed books in-browser with an inline PDF viewer
- **Bookmarks**: Save page-level bookmarks per book (page number + optional label)
- **Highlights**: Store text highlights per book with color choices
- **Auto-return**: Overdue books are automatically returned and availability is restored
- **Due reminders**: Notifications generated 24 hours before due date
- Book recommendations (top 3 most borrowed)

### Author Portal
- Submit books with title, multi-genre, description, file upload
- **Cover image upload**: Attach a JPG/PNG cover image (max 2MB)
- **Book preview**: Preview card shown before submission
- Drag-and-drop file upload (PDF, TXT, DOC, DOCX, max 50MB)
- Author name auto-filled from account
- Auto-save draft every 3 seconds of inactivity
- Resume drafts from the Drafts tab
- Track submission status (Pending / Approved / Rejected)
- **Rejection reasons**: View librarian feedback on rejected books
- **Edit book**: Modify pending books or approved books that aren't currently borrowed
- **Delete book**: Remove own books (with confirmation dialog)
- **Bulk delete**: Select and delete multiple books at once

### Librarian Portal
- View all pending submissions in a sortable table
- Full submission history (all statuses)
- Approve or reject individual submissions with confirmation
- **Rejection reason**: Add feedback when rejecting a book (sent as notification to author)
- **Book preview**: Preview/download book files before approval
- Bulk select and bulk approve/reject
- Filter by title, author, genre, status, and date range
- Approval auto-sets publish date and makes book available
- **User Management**: View all users, add new users (any role), edit user details, deactivate/activate accounts, role-based filtering
- **Borrow Records**: View all borrowing transactions, search by book/borrower, filter by status (active/returned/overdue) and date range, export to CSV
- **Notifications**: Automatic alerts for new submissions, user updates, and the ability to send announcements to all users or specific roles

---

## Data Model

### Users
| Field           | Type    | Notes                              |
|-----------------|---------|------------------------------------|
| id              | UUID    | Primary key                        |
| username        | TEXT    | Unique across all roles            |
| full_name       | TEXT    | Required                           |
| password_hash   | TEXT    | bcrypt hash                        |
| role            | TEXT    | student / staff / author / librarian |
| bio             | TEXT    | Authors only (optional)            |
| employee_id     | TEXT    | Librarians only (optional)         |
| profile_picture | TEXT    | Path to uploaded avatar image      |
| active          | INTEGER | 1 = active, 0 = deactivated       |

### Books
| Field            | Type     | Notes                          |
|------------------|----------|--------------------------------|
| id               | UUID     | Primary key                    |
| title            | TEXT     | Required                       |
| author_id        | UUID     | FK → users                     |
| author_name      | TEXT     | Denormalized for display       |
| genre            | TEXT     | Comma-separated genres         |
| description      | TEXT     | Abstract / summary             |
| file_path        | TEXT     | Server path to uploaded file   |
| status           | TEXT     | pending / approved / rejected / draft |
| availability     | TEXT     | available / borrowed           |
| publish_date     | DATETIME | Set on librarian approval      |
| times_borrowed   | INTEGER  | Borrowing count for popularity |
| cover_image      | TEXT     | Path to cover image            |
| rejection_reason | TEXT     | Librarian feedback on rejection|

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

### Bookmarks
| Field       | Type     | Notes                       |
|-------------|----------|-----------------------------|
| id          | UUID     | Primary key                 |
| user_id     | UUID     | FK → users                  |
| book_id     | UUID     | FK → books                  |
| page_number | INTEGER  | Bookmarked page             |
| label       | TEXT     | Optional label              |

### Highlights
| Field        | Type     | Notes                      |
|--------------|----------|----------------------------|
| id           | UUID     | Primary key                |
| user_id      | UUID     | FK → users                 |
| book_id      | UUID     | FK → books                 |
| page_number  | INTEGER  | Page of highlight          |
| text_content | TEXT     | Highlighted text           |
| color        | TEXT     | Highlight color (hex)      |

### Notifications
| Field       | Type     | Notes                                  |
|-------------|----------|----------------------------------------|
| id          | UUID     | Primary key                            |
| user_id     | UUID     | FK → users                             |
| type        | TEXT     | due_reminder / auto_return / approval / rejection / announcement / etc. |
| title       | TEXT     | Notification title                     |
| message     | TEXT     | Notification body                      |
| priority    | TEXT     | normal / urgent                        |
| category    | TEXT     | borrow / submissions / users / general / announcement |
| is_read     | INTEGER  | 0 = unread, 1 = read                  |
| is_archived | INTEGER  | 0 = active, 1 = archived              |
| related_id  | TEXT     | ID of related book/user                |

### Crash Recovery
| Field      | Type     | Notes                         |
|------------|----------|-------------------------------|
| id         | UUID     | Primary key                   |
| user_id    | UUID     | FK → users (unique)           |
| screen     | TEXT     | Last active tab/screen        |
| portal     | TEXT     | student / author / librarian  |
| state_data | TEXT     | JSON blob of saved state      |

---

## API Endpoints

### Auth
| Method | Path               | Description            |
|--------|--------------------|------------------------|
| POST   | /api/auth/register | Register new user      |
| POST   | /api/auth/login    | Login, get JWT token   |

### Books
| Method | Path                           | Role          | Description                    |
|--------|--------------------------------|---------------|--------------------------------|
| GET    | /api/books                     | All           | List approved books            |
| GET    | /api/books/recommendations     | Student/Staff | Top 3 most borrowed            |
| POST   | /api/books/:id/borrow          | Student/Staff | Borrow a book                  |
| POST   | /api/books/bulk-borrow         | Student/Staff | Borrow multiple books          |
| GET    | /api/books/my-borrows          | Student/Staff | Borrow history + limit info    |
| POST   | /api/books/:id/return          | Student/Staff | Return a borrowed book         |
| GET    | /api/books/view/:id            | All           | View book file inline (PDF)    |
| GET    | /api/books/download/:id        | All           | Download book file             |
| GET    | /api/books/:id/bookmarks       | All           | Get bookmarks for a book       |
| POST   | /api/books/:id/bookmarks       | All           | Add a bookmark                 |
| DELETE | /api/books/bookmarks/:id       | All           | Remove a bookmark              |
| GET    | /api/books/:id/highlights      | All           | Get highlights for a book      |
| POST   | /api/books/:id/highlights      | All           | Add a highlight                |
| DELETE | /api/books/highlights/:id      | All           | Remove a highlight             |
| POST   | /api/books/submit              | Author        | Submit new book (with cover)   |
| POST   | /api/books/draft               | Author        | Save/update draft              |
| GET    | /api/books/my-submissions      | Author        | Author's submissions           |
| GET    | /api/books/my-drafts           | Author        | Author's drafts                |
| PUT    | /api/books/:id/edit            | Author        | Edit own book                  |
| DELETE | /api/books/:id                 | Author        | Delete own book                |
| POST   | /api/books/bulk-delete         | Author        | Bulk delete own books          |
| GET    | /api/books/pending             | Librarian     | All submissions + filters      |
| PATCH  | /api/books/:id/approve         | Librarian     | Approve a submission           |
| PATCH  | /api/books/:id/reject          | Librarian     | Reject with optional reason    |
| POST   | /api/books/bulk-action         | Librarian     | Bulk approve/reject            |
| GET    | /api/books/preview/:id         | Librarian     | Preview book file              |
| GET    | /api/books/borrow-records      | Librarian     | All borrow records + filters   |
| GET    | /api/books/borrow-records/export | Librarian   | Export borrow records as CSV   |

### Users
| Method | Path                         | Role      | Description                  |
|--------|------------------------------|-----------|------------------------------|
| GET    | /api/users/profile           | All       | Get own profile              |
| PUT    | /api/users/profile           | All       | Update own profile           |
| PUT    | /api/users/password          | All       | Change password              |
| POST   | /api/users/profile-picture   | All       | Upload profile picture       |
| GET    | /api/users                   | Librarian | List all users               |
| POST   | /api/users                   | Librarian | Create new user              |
| PUT    | /api/users/:id               | Librarian | Edit a user                  |
| PATCH  | /api/users/:id/deactivate    | Librarian | Toggle user active status    |

### Notifications
| Method | Path                             | Role      | Description                  |
|--------|----------------------------------|-----------|------------------------------|
| GET    | /api/notifications               | All       | Get notifications + filters  |
| GET    | /api/notifications/unread-count  | All       | Get unread count             |
| PATCH  | /api/notifications/:id/read      | All       | Mark as read                 |
| PATCH  | /api/notifications/read-all      | All       | Mark all as read             |
| PATCH  | /api/notifications/:id/archive   | All       | Archive a notification       |
| DELETE | /api/notifications/:id           | All       | Delete a notification        |
| POST   | /api/notifications/announcement  | Librarian | Send announcement            |

### Crash Recovery
| Method | Path                  | Role | Description                |
|--------|-----------------------|------|----------------------------|
| POST   | /api/recovery/save    | All  | Save current state         |
| GET    | /api/recovery/state   | All  | Get saved recovery state   |
| DELETE | /api/recovery/clear   | All  | Clear recovery state       |

---

## Security Notes

- Passwords are never stored in plain text
- JWT tokens expire after 24 hours
- File uploads are validated by MIME type and size
- Role-based middleware prevents cross-portal access
- SQLite uses parameterized queries (no SQL injection)
- Profile changes require password re-authentication
- User accounts can be deactivated by librarians

---

## Design

- **Aesthetic**: Dark academic / library noir
- **Fonts**: Cormorant Garamond (display) + DM Sans (body)
- **Colors**: Deep ink navy, gold accents, emerald/ruby status indicators
- **Responsive**: Mobile-friendly layout

---

## License

MIT — for educational and personal use.
