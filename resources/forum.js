// Track the currently logged-in user (set during initForum)
let currentUser = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize the forum page: load session, setup UI, and load posts
async function initForum() {
  // Fetch the current session to determine login status
  const sessionRes = await fetch("/api/session");
  const session = await sessionRes.json();
  currentUser = session.loggedIn ? session : null;

  const authLink = document.getElementById("nav-auth-link");

  // If user is logged in, show username and logout option
  if (session.loggedIn) {
    authLink.innerHTML = `<span style="font-size:15px;font-weight:600;color:#666">${session.username}</span>
      &nbsp;<a href="#" id="logout-nav" style="font-size:14px">Logout</a>`;

    // Handle logout click
    document.getElementById("logout-nav").addEventListener("click", async (e) => {
      e.preventDefault();
      await fetch("/api/logout", { method: "POST" });
      window.location.reload();
    });

    // Show new post button for logged-in users
    document.getElementById("new-post-btn").style.display = "inline-block";
    document.getElementById("login-prompt").style.display = "none";
  } else {
    // Show login link for anonymous users
    authLink.innerHTML = '<a href="../login.html">Login</a>';
    document.getElementById("new-post-btn").style.display = "none";
    document.getElementById("login-prompt").style.display = "inline";
  }

  // Load all posts for this forum
  await loadPosts();

  // Handle new post button click: show form and hide button
  document.getElementById("new-post-btn").addEventListener("click", () => {
    document.getElementById("new-post-section").style.display = "block";
    document.getElementById("new-post-btn").style.display = "none";
    document.getElementById("title").focus();
  });

  // Handle cancel post button: hide form and show button again
  document.getElementById("cancel-post").addEventListener("click", () => {
    document.getElementById("new-post-section").style.display = "none";
    document.getElementById("new-post-btn").style.display = "inline-block";
    document.getElementById("post-form").reset();
    const err = document.getElementById("post-error");
    err.style.display = "none";
  });

  // Handle post form submission
  document.getElementById("post-form").addEventListener("submit", submitPost);
}

// ============================================================================
// POSTS
// ============================================================================

// Load all posts for the current forum from the server
async function loadPosts() {
  const res = await fetch(`/api/forum/${FORUM_ID}/posts`);
  const posts = await res.json();

  const list = document.getElementById("posts-list");
  const countEl = document.getElementById("post-count");

  // Show empty state if no posts exist
  if (!Array.isArray(posts) || posts.length === 0) {
    list.innerHTML = '<p class="no-posts">No posts yet. Be the first to post!</p>';
    countEl.textContent = "0 posts";
    return;
  }

  // Update post count with proper pluralization
  countEl.textContent = `${posts.length} post${posts.length !== 1 ? "s" : ""}`;

  // Render all posts into the DOM
  list.innerHTML = posts.map(renderPost).join("");

  // Attach delete handlers to post delete buttons
  list.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", () => deletePost(parseInt(btn.dataset.id)));
  });

  // Attach comment toggle handlers
  list.querySelectorAll(".btn-toggle-comments").forEach((btn) => {
    btn.addEventListener("click", () => toggleComments(parseInt(btn.dataset.postid)));
  });
}

// Render a single post card as HTML
function renderPost(post) {
  // Format the creation date
  const date = new Date(post.created_at + " UTC").toLocaleString();

  // Only show delete button if current user owns this post
  const canDelete = currentUser && currentUser.userId === post.user_id;
  const deleteBtn = canDelete
    ? `<button class="btn-delete" data-id="${post.id}">Delete</button>`
    : "";

  // Include image if post has one
  const image = post.image_path
    ? `<img src="${post.image_path}" class="post-image" alt="Post image" />`
    : "";

  // Comment count label
  const count = post.comment_count || 0;
  const commentLabel = `💬 ${count} Comment${count !== 1 ? "s" : ""}`;

  return `
    <div class="post-card" id="post-${post.id}">
      ${deleteBtn}
      <div class="post-header">
        <h2 class="post-title">${escapeHtml(post.title)}</h2>
      </div>
      <div>
        <span class="post-author">@${escapeHtml(post.username)}</span>
        <span class="post-meta"> &middot; ${date}</span>
      </div>
      <p class="post-content">${escapeHtml(post.content)}</p>
      ${image}
      <div class="post-footer">
        <button class="btn-toggle-comments" data-postid="${post.id}" id="toggle-btn-${post.id}">
          ${commentLabel}
        </button>
      </div>
      <div class="comments-section" id="comments-section-${post.id}" style="display:none">
        <p class="comments-loading">Loading comments...</p>
      </div>
    </div>
  `;
}

// Handle form submission: send post data to server
async function submitPost(e) {
  e.preventDefault();
  const errorEl = document.getElementById("post-error");
  errorEl.style.display = "none";

  const form = document.getElementById("post-form");
  const formData = new FormData(form);

  // Send post with title, content, and optional image
  const res = await fetch(`/api/forum/${FORUM_ID}/posts`, {
    method: "POST",
    body: formData,
  });
  const data = await res.json();

  if (data.id) {
    // Post created successfully: reset form and reload posts
    form.reset();
    document.getElementById("new-post-section").style.display = "none";
    document.getElementById("new-post-btn").style.display = "inline-block";
    await loadPosts();
  } else {
    // Show error message if submission failed
    errorEl.textContent = data.error || "Failed to post";
    errorEl.style.display = "block";
  }
}

// Delete a post after user confirms
async function deletePost(postId) {
  if (!confirm("Delete this post and all its comments?")) return;

  const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
  const data = await res.json();

  if (data.success) {
    // Remove post from DOM and reload list
    document.getElementById(`post-${postId}`).remove();
    await loadPosts();
  } else {
    alert(data.error || "Could not delete post");
  }
}

// ============================================================================
// COMMENTS
// ============================================================================

// Track which post comment sections have already been loaded
const loadedComments = new Set();

// Show or hide the comments section for a post
async function toggleComments(postId) {
  const section = document.getElementById(`comments-section-${postId}`);
  const btn = document.getElementById(`toggle-btn-${postId}`);

  if (section.style.display === "none") {
    // Show the comments section
    section.style.display = "block";

    // Load comments from server if not already loaded
    if (!loadedComments.has(postId)) {
      await loadComments(postId);
    }
  } else {
    // Hide the comments section
    section.style.display = "none";
  }
}

// Fetch comments for a post and render them
async function loadComments(postId) {
  const section = document.getElementById(`comments-section-${postId}`);
  section.innerHTML = '<p class="comments-loading">Loading comments...</p>';

  const res = await fetch(`/api/posts/${postId}/comments`);
  const comments = await res.json();

  // Mark this post's comments as loaded
  loadedComments.add(postId);

  // Build the comment section HTML
  let html = "";

  if (comments.length === 0) {
    html += '<p class="no-comments">No comments yet.</p>';
  } else {
    comments.forEach((comment) => {
      html += renderComment(comment);
    });
  }

  // Add the comment input form (or login prompt)
  if (currentUser) {
    html += `
      <div class="comment-input-area" id="comment-input-${postId}">
        <textarea id="comment-text-${postId}" placeholder="Write a comment..." rows="2"></textarea>
        <div class="comment-form-actions">
          <button class="btn-submit-comment" data-postid="${postId}">Comment</button>
          <span class="comment-error" id="comment-error-${postId}"></span>
        </div>
      </div>
    `;
  } else {
    html += `<p class="comments-login-prompt"><a href="../login.html">Log in</a> to leave a comment.</p>`;
  }

  section.innerHTML = html;

  // Update the toggle button with the correct comment count
  updateCommentToggleBtn(postId, comments.length);

  // Attach event listeners for this comment section
  attachCommentListeners(postId);
}

// Update the toggle button's label with the current comment count
function updateCommentToggleBtn(postId, count) {
  const btn = document.getElementById(`toggle-btn-${postId}`);
  if (btn) {
    btn.textContent = `💬 ${count} Comment${count !== 1 ? "s" : ""}`;
  }
}

// Attach all event listeners inside a loaded comment section
function attachCommentListeners(postId) {
  // Submit top-level comment
  const submitBtn = document.querySelector(`.btn-submit-comment[data-postid="${postId}"]`);
  if (submitBtn) {
    submitBtn.addEventListener("click", () => submitComment(postId));
  }

  // Reply toggle buttons
  document.querySelectorAll(`.btn-reply-toggle[data-postid="${postId}"]`).forEach((btn) => {
    btn.addEventListener("click", () => toggleReplyForm(postId, parseInt(btn.dataset.commentid)));
  });

  // Comment delete buttons
  document.querySelectorAll(`.btn-comment-delete[data-postid="${postId}"]`).forEach((btn) => {
    btn.addEventListener("click", () => deleteComment(postId, parseInt(btn.dataset.commentid)));
  });
}

// Render a top-level comment with its replies
function renderComment(comment) {
  const date = new Date(comment.created_at + " UTC").toLocaleString();
  const canDelete = currentUser && currentUser.userId === comment.user_id;

  // Render all replies under this comment
  let repliesHtml = "";
  if (comment.replies && comment.replies.length > 0) {
    repliesHtml = comment.replies.map(renderReply).join("");
  }

  // Reply button only for logged-in users
  const replyBtn = currentUser
    ? `<button class="btn-reply-toggle" data-postid="${comment.post_id}" data-commentid="${comment.id}">Reply</button>`
    : "";

  const deleteBtn = canDelete
    ? `<button class="btn-comment-delete" data-postid="${comment.post_id}" data-commentid="${comment.id}">Delete</button>`
    : "";

  return `
    <div class="comment" id="comment-${comment.id}">
      <div class="comment-body">
        <div class="comment-header">
          <span class="comment-author">@${escapeHtml(comment.username)}</span>
          <span class="comment-date">${date}</span>
        </div>
        <p class="comment-content">${escapeHtml(comment.content)}</p>
        <div class="comment-actions">${replyBtn}${deleteBtn}</div>
      </div>
      <div class="replies-list" id="replies-${comment.id}">
        ${repliesHtml}
      </div>
      <div class="reply-form-container" id="reply-form-container-${comment.id}" style="display:none">
        <textarea id="reply-text-${comment.id}" placeholder="Write a reply..." rows="2"></textarea>
        <div class="comment-form-actions">
          <button class="btn-submit-reply" data-postid="${comment.post_id}" data-commentid="${comment.id}">Reply</button>
          <button class="btn-cancel-reply" data-commentid="${comment.id}">Cancel</button>
          <span class="comment-error" id="reply-error-${comment.id}"></span>
        </div>
      </div>
    </div>
  `;
}

// Render a single reply (nested under a comment)
function renderReply(reply) {
  const date = new Date(reply.created_at + " UTC").toLocaleString();
  const canDelete = currentUser && currentUser.userId === reply.user_id;

  const deleteBtn = canDelete
    ? `<button class="btn-comment-delete" data-postid="${reply.post_id}" data-commentid="${reply.id}">Delete</button>`
    : "";

  return `
    <div class="comment reply" id="comment-${reply.id}">
      <div class="comment-body">
        <div class="comment-header">
          <span class="comment-author">@${escapeHtml(reply.username)}</span>
          <span class="comment-date">${date}</span>
        </div>
        <p class="comment-content">${escapeHtml(reply.content)}</p>
        <div class="comment-actions">${deleteBtn}</div>
      </div>
    </div>
  `;
}

// Show or hide the inline reply form for a comment
function toggleReplyForm(postId, commentId) {
  const container = document.getElementById(`reply-form-container-${commentId}`);
  if (!container) return;

  if (container.style.display === "none") {
    container.style.display = "block";
    document.getElementById(`reply-text-${commentId}`).focus();

    // Attach reply submit listener (once)
    const submitBtn = container.querySelector(".btn-submit-reply");
    if (submitBtn && !submitBtn.dataset.bound) {
      submitBtn.dataset.bound = "1";
      submitBtn.addEventListener("click", () => submitReply(postId, commentId));
    }

    // Attach cancel listener (once)
    const cancelBtn = container.querySelector(".btn-cancel-reply");
    if (cancelBtn && !cancelBtn.dataset.bound) {
      cancelBtn.dataset.bound = "1";
      cancelBtn.addEventListener("click", () => {
        container.style.display = "none";
        document.getElementById(`reply-text-${commentId}`).value = "";
        document.getElementById(`reply-error-${commentId}`).style.display = "none";
      });
    }
  } else {
    container.style.display = "none";
  }
}

// Submit a top-level comment on a post
async function submitComment(postId) {
  const textarea = document.getElementById(`comment-text-${postId}`);
  const errorEl = document.getElementById(`comment-error-${postId}`);
  const content = textarea.value.trim();

  errorEl.style.display = "none";

  if (!content) {
    errorEl.textContent = "Comment cannot be empty";
    errorEl.style.display = "inline";
    return;
  }

  const res = await fetch(`/api/posts/${postId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const data = await res.json();

  if (data.id) {
    // Clear textarea and reload comments
    textarea.value = "";
    loadedComments.delete(postId);
    await loadComments(postId);
  } else {
    errorEl.textContent = data.error || "Failed to comment";
    errorEl.style.display = "inline";
  }
}

// Submit a reply to a comment
async function submitReply(postId, commentId) {
  const textarea = document.getElementById(`reply-text-${commentId}`);
  const errorEl = document.getElementById(`reply-error-${commentId}`);
  const content = textarea.value.trim();

  errorEl.style.display = "none";

  if (!content) {
    errorEl.textContent = "Reply cannot be empty";
    errorEl.style.display = "inline";
    return;
  }

  const res = await fetch(`/api/posts/${postId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, parent_id: commentId }),
  });
  const data = await res.json();

  if (data.id) {
    // Reload comments to show the new reply
    loadedComments.delete(postId);
    await loadComments(postId);
  } else {
    errorEl.textContent = data.error || "Failed to reply";
    errorEl.style.display = "inline";
  }
}

// Delete a comment or reply after confirmation
async function deleteComment(postId, commentId) {
  if (!confirm("Delete this comment?")) return;

  const res = await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
  const data = await res.json();

  if (data.success) {
    // Reload comments to reflect the deletion
    loadedComments.delete(postId);
    await loadComments(postId);
  } else {
    alert(data.error || "Could not delete comment");
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

// Escape HTML special characters to prevent XSS attacks
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================================
// ENTRY POINT
// ============================================================================
initForum();
