# Architecture note

**Stack:** Express + built-in `node:sqlite` + one static HTML page using a `contenteditable` editor. No build step and four runtime dependencies (express, multer, mammoth, sanitize-html), so reviewers can run it with `npm install && npm start`. Nothing requires a paid service.

**What I prioritized**
1. **Access logic.** Every document route goes through one `withDoc(need)` middleware that resolves the caller's role (owner / edit / view). Users with no access get 404 rather than 403 so document ids don't leak. Only owners can share, revoke, or delete.
2. **Data safety.** All HTML is sanitized server-side with an allowlist on save and on import, so a shared document can't carry script to another user.
3. **A coherent editing flow.** Autosave with a visible status, Ctrl/Cmd+S, read-only mode for view-only users, URL hash so a refresh reopens the same document.
4. **Product-relevant upload.** Importing .txt/.md/.docx creates a new editable document, which is the most common real workflow for a docs tool.

**Data model:** `users`, `documents` (owner, title, sanitized HTML content, timestamps), `shares` (doc_id, username, role: view|edit).

**Deliberate scope cuts**
- Real auth (seeded users and an unsigned cookie stand in; fine for a demo, not for production).
- Real-time collaboration (last save wins).
- Version history, comments, export.
- An editor framework: `document.execCommand` is deprecated but universally supported and kept the scope small. TipTap/ProseMirror is the first thing I would swap in.
- Image handling in .docx import (images are dropped).

**Deployment:** Docker on Render's free tier. Free tier has no persistent disk, so data lives in `/tmp` and can reset on redeploy or restart. It persists across page refreshes, which is what the demo needs.
