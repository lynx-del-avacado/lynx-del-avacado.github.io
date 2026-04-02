// ============================================================================
// CEDAR FORUM SERVER - Express.js Backend
// ============================================================================
// Handles authentication, forum posts, comments, replies, file uploads,
// and session management

const express = require("express");
const bcrypt = require("bcrypt");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const SqliteStore = require("connect-sqlite3")(session);

const app = express();
const PORT = 5000;

// ============================================================================
// DATABASE SETUP
// ============================================================================
const db = new Database("cedar.db");

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    forum_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    parent_id INTEGER DEFAULT NULL,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ============================================================================
// FILE UPLOAD CONFIGURATION
// ============================================================================
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    // Generate unique filename using timestamp and random number
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max file size
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// ============================================================================
// MIDDLEWARE SETUP
// ============================================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(".")); // Serve static files from root
app.use("/uploads", express.static("uploads")); // Serve uploaded images

// Session configuration with SQLite store
app.use(
  session({
    store: new SqliteStore({ db: "sessions.db" }),
    secret: "cedar-secret-key-2026",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
  })
);

// ============================================================================
// AUTH ROUTES
// ============================================================================

// GET /api/session - Get current user session
app.get("/api/session", (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true, username: req.session.username, userId: req.session.userId });
  } else {
    res.json({ loggedIn: false });
  }
});

// POST /api/register - Create a new user account
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;

  // Validate input
  if (!username || !password)
    return res.status(400).json({ error: "Username and password are required" });
  if (username.length < 3 || username.length > 20)
    return res.status(400).json({ error: "Username must be 3–20 characters" });
  if (password.length < 6)
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  if (!/^[a-zA-Z0-9_]+$/.test(username))
    return res.status(400).json({ error: "Username may only contain letters, numbers, and underscores" });

  try {
    // Hash password with bcrypt (10 rounds)
    const hash = await bcrypt.hash(password, 10);

    // Insert user into database
    const stmt = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)");
    const result = stmt.run(username, hash);

    // Create session for new user
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    res.json({ success: true, username });
  } catch (err) {
    // Handle duplicate username error
    if (err.message.includes("UNIQUE")) {
      res.status(409).json({ error: "Username already taken" });
    } else {
      res.status(500).json({ error: "Server error" });
    }
  }
});

// POST /api/login - Log in with username and password
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: "Username and password are required" });

  // Look up user by username
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user) return res.status(401).json({ error: "Invalid username or password" });

  // Verify password with bcrypt
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: "Invalid username or password" });

  // Create session for user
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ success: true, username: user.username });
});

// POST /api/logout - Clear user session
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ============================================================================
// POST ROUTES
// ============================================================================

// GET /api/forum/:id/posts - Get all posts for a forum
app.get("/api/forum/:id/posts", (req, res) => {
  const forumId = parseInt(req.params.id);

  // Validate forum ID (only 1, 2, 3 are valid)
  if (![1, 2, 3].includes(forumId))
    return res.status(404).json({ error: "Forum not found" });

  // Get posts ordered by newest first, with comment count
  const posts = db
    .prepare(`
      SELECT posts.*,
        (SELECT COUNT(*) FROM comments WHERE post_id = posts.id) AS comment_count
      FROM posts
      WHERE forum_id = ?
      ORDER BY created_at DESC
    `)
    .all(forumId);
  res.json(posts);
});

// POST /api/forum/:id/posts - Create a new post (requires auth)
app.post("/api/forum/:id/posts", upload.single("image"), (req, res) => {
  const forumId = parseInt(req.params.id);

  // Validate forum ID
  if (![1, 2, 3].includes(forumId))
    return res.status(404).json({ error: "Forum not found" });

  // Require authentication
  if (!req.session.userId)
    return res.status(401).json({ error: "You must be logged in to post" });

  const { title, content } = req.body;

  // Validate post content
  if (!title || !content)
    return res.status(400).json({ error: "Title and content are required" });
  if (title.length > 120)
    return res.status(400).json({ error: "Title must be under 120 characters" });

  // Get image path if one was uploaded
  const imagePath = req.file ? "/uploads/" + req.file.filename : null;

  // Insert post into database
  const stmt = db.prepare(
    "INSERT INTO posts (forum_id, user_id, username, title, content, image_path) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const result = stmt.run(forumId, req.session.userId, req.session.username, title, content, imagePath);

  // Return the created post with comment count
  const post = db
    .prepare(`
      SELECT posts.*, 0 AS comment_count
      FROM posts WHERE id = ?
    `)
    .get(result.lastInsertRowid);
  res.json(post);
});

// DELETE /api/posts/:id - Delete a post (requires auth and ownership)
app.delete("/api/posts/:id", (req, res) => {
  // Require authentication
  if (!req.session.userId)
    return res.status(401).json({ error: "Not logged in" });

  // Get the post
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "Post not found" });

  // Only allow user to delete their own posts
  if (post.user_id !== req.session.userId)
    return res.status(403).json({ error: "You can only delete your own posts" });

  // Delete uploaded image file if it exists
  if (post.image_path) {
    const filePath = "." + post.image_path;
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  // Delete comments for this post, then delete the post
  db.prepare("DELETE FROM comments WHERE post_id = ?").run(req.params.id);
  db.prepare("DELETE FROM posts WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ============================================================================
// COMMENT ROUTES
// ============================================================================

// GET /api/posts/:id/comments - Get all comments and replies for a post
app.get("/api/posts/:id/comments", (req, res) => {
  const postId = parseInt(req.params.id);

  // Verify the post exists
  const post = db.prepare("SELECT id FROM posts WHERE id = ?").get(postId);
  if (!post) return res.status(404).json({ error: "Post not found" });

  // Fetch all top-level comments (parent_id IS NULL)
  const topLevel = db
    .prepare("SELECT * FROM comments WHERE post_id = ? AND parent_id IS NULL ORDER BY created_at ASC")
    .all(postId);

  // Fetch replies for each top-level comment
  const result = topLevel.map((comment) => {
    const replies = db
      .prepare("SELECT * FROM comments WHERE parent_id = ? ORDER BY created_at ASC")
      .all(comment.id);
    return { ...comment, replies };
  });

  res.json(result);
});

// POST /api/posts/:id/comments - Create a comment or reply (requires auth)
app.post("/api/posts/:id/comments", (req, res) => {
  const postId = parseInt(req.params.id);

  // Require authentication
  if (!req.session.userId)
    return res.status(401).json({ error: "You must be logged in to comment" });

  // Verify the post exists
  const post = db.prepare("SELECT id FROM posts WHERE id = ?").get(postId);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const { content, parent_id } = req.body;

  // Validate content
  if (!content || !content.trim())
    return res.status(400).json({ error: "Comment cannot be empty" });
  if (content.length > 2000)
    return res.status(400).json({ error: "Comment must be under 2000 characters" });

  // If replying, verify parent comment exists and belongs to the same post
  let parentId = null;
  if (parent_id) {
    const parent = db.prepare("SELECT * FROM comments WHERE id = ?").get(parent_id);
    if (!parent || parent.post_id !== postId)
      return res.status(400).json({ error: "Invalid parent comment" });
    // Only allow one level of replies — reply to the top-level comment if parent is already a reply
    parentId = parent.parent_id !== null ? parent.parent_id : parent.id;
  }

  // Insert comment into database
  const stmt = db.prepare(
    "INSERT INTO comments (post_id, parent_id, user_id, username, content) VALUES (?, ?, ?, ?, ?)"
  );
  const result = stmt.run(postId, parentId, req.session.userId, req.session.username, content.trim());

  // Return the created comment
  const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(result.lastInsertRowid);
  res.json(comment);
});

// DELETE /api/comments/:id - Delete a comment or reply (requires auth and ownership)
app.delete("/api/comments/:id", (req, res) => {
  // Require authentication
  if (!req.session.userId)
    return res.status(401).json({ error: "Not logged in" });

  // Get the comment
  const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.id);
  if (!comment) return res.status(404).json({ error: "Comment not found" });

  // Only allow user to delete their own comments
  if (comment.user_id !== req.session.userId)
    return res.status(403).json({ error: "You can only delete your own comments" });

  // Delete any replies to this comment first, then the comment itself
  db.prepare("DELETE FROM comments WHERE parent_id = ?").run(req.params.id);
  db.prepare("DELETE FROM comments WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ============================================================================
// START SERVER
// ============================================================================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Cedar running on http://0.0.0.0:${PORT}`);
});
