# Cedar

A forum-based website with user accounts and three discussion boards.

## Project Structure

- `server.js` — Express backend (auth, posts API, file uploads, session management)
- `cedar.db` — SQLite database (users + posts, auto-created on first run)
- `sessions.db` — Session store (auto-created)
- `uploads/` — User-uploaded images
- `index.html` — Entry point; redirects to `web/home.html`
- `web/` — All HTML pages:
  - `home.html` — Landing page with forum cards
  - `forum1.html` — General Discussion forum
  - `forum2.html` — Technology forum
  - `forum3.html` — Creative Corner forum
  - `login.html` — Login page
  - `register.html` — Account creation page
  - `about.html` — About page
- `resources/` — Shared assets:
  - `styles.css` — Site-wide styles
  - `forum.css` — Forum-specific styles
  - `forum.js` — Shared forum logic (posts, auth state, delete)
  - `script.js`, `style.js` — Original utility scripts
  - `images/` — favicon, purple-tree image

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite via `better-sqlite3`
- **Sessions:** `express-session` + `connect-sqlite3`
- **Auth:** `bcrypt` for password hashing
- **File uploads:** `multer` (images up to 5 MB)
- **Frontend:** HTML5, CSS3, vanilla JavaScript

## API Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/session` | Get current session |
| POST | `/api/register` | Register new user |
| POST | `/api/login` | Log in |
| POST | `/api/logout` | Log out |
| GET | `/api/forum/:id/posts` | Get posts for forum 1, 2, or 3 |
| POST | `/api/forum/:id/posts` | Create post (auth required) |
| DELETE | `/api/posts/:id` | Delete own post (auth required) |

## Running

```bash
npm start
```

Runs on port 5000.

## Deployment

Configured as an autoscale deployment running `node server.js`.
