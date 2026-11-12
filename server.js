const express = require('express');
const multer = require('multer');
const mammoth = require('mammoth');
const sanitizeHtml = require('sanitize-html');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const SEED_USERS = ['alice', 'bob', 'carol'];
const ALLOWED_UPLOADS = ['.txt', '.md', '.docx'];
const MAX_UPLOAD = 2 * 1024 * 1024;
const SANITIZE = {
  allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'blockquote', 'div', 'span'],
  allowedAttributes: {},
};
const clean = (html) => sanitizeHtml(String(html || ''), SANITIZE);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Minimal markdown -> HTML (headings, lists, bold, italic, paragraphs).
function markdownToHtml(md) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of md.replace(/\r/g, '').split('\n')) {
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) { close(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = line.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^\s*\d+\.\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if (line.trim()) { close(); out.push(`<p>${inline(line)}</p>`); }
    else close();
  }
  close();
  return out.join('');
}

function createApp(dbPath = process.env.DB_PATH || 'data.db') {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(username),
      title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shares (
      doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      username TEXT NOT NULL REFERENCES users(username),
      role TEXT NOT NULL CHECK (role IN ('view','edit')),
      PRIMARY KEY (doc_id, username));
  `);
  for (const u of SEED_USERS) db.prepare('INSERT OR IGNORE INTO users VALUES (?)').run(u);

  const now = () => new Date().toISOString();
  const getDoc = (id) => db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  // Returns 'owner' | 'edit' | 'view' | null
  const roleFor = (doc, user) => {
    if (!doc) return null;
    if (doc.owner === user) return 'owner';
    const s = db.prepare('SELECT role FROM shares WHERE doc_id = ? AND username = ?').get(doc.id, user);
    return s ? s.role : null;
  };
  const createDoc = (owner, title, content) => {
    const id = crypto.randomUUID(); const t = now();
    db.prepare('INSERT INTO documents VALUES (?,?,?,?,?,?)').run(id, owner, title, content, t, t);
    return getDoc(id);
  };
  const cleanTitle = (t) => String(t ?? '').trim().slice(0, 120);

  const app = express();
  app.use(express.json({ limit: '2mb' }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD } });

  const auth = (req, res, next) => {
    const m = (req.headers.cookie || '').match(/(?:^|;\s*)user=([a-z]+)/);
    if (!m || !SEED_USERS.includes(m[1])) return res.status(401).json({ error: 'Sign in to continue.' });
    req.user = m[1]; next();
  };
  const withDoc = (need) => (req, res, next) => {
    const doc = getDoc(req.params.id);
    const role = roleFor(doc, req.user);
    if (!role) return res.status(404).json({ error: 'Document not found.' }); // don't leak existence
    const ok = need === 'owner' ? role === 'owner' : need === 'edit' ? role !== 'view' : true;
    if (!ok) return res.status(403).json({ error: need === 'owner' ? 'Only the owner can do this.' : 'You have view-only access.' });
    req.doc = doc; req.role = role; next();
  };
  const shape = (d, role) => ({ id: d.id, owner: d.owner, title: d.title, updatedAt: d.updated_at, role });

  app.post('/api/login', (req, res) => {
    const u = String(req.body.username || '').toLowerCase();
    if (!SEED_USERS.includes(u)) return res.status(400).json({ error: `Unknown user. Try: ${SEED_USERS.join(', ')}.` });
    res.setHeader('Set-Cookie', `user=${u}; Path=/; HttpOnly; SameSite=Lax`);
    res.json({ username: u });
  });
  app.post('/api/logout', (_req, res) => { res.setHeader('Set-Cookie', 'user=; Path=/; Max-Age=0'); res.json({ ok: true }); });
  app.get('/api/me', auth, (req, res) => res.json({ username: req.user, users: SEED_USERS }));

  app.get('/api/docs', auth, (req, res) => {
    const owned = db.prepare('SELECT * FROM documents WHERE owner = ? ORDER BY updated_at DESC').all(req.user).map((d) => shape(d, 'owner'));
    const shared = db.prepare(`SELECT d.*, s.role AS srole FROM documents d JOIN shares s ON s.doc_id = d.id
      WHERE s.username = ? ORDER BY d.updated_at DESC`).all(req.user).map((d) => shape(d, d.srole));
    res.json({ owned, shared });
  });

  app.post('/api/docs', auth, (req, res) => {
    const title = cleanTitle(req.body.title) || 'Untitled document';
    res.status(201).json(shape(createDoc(req.user, title, ''), 'owner'));
  });

  app.get('/api/docs/:id', auth, withDoc('view'), (req, res) => {
    const shares = req.role === 'owner' ? db.prepare('SELECT username, role FROM shares WHERE doc_id = ?').all(req.doc.id) : undefined;
    res.json({ ...shape(req.doc, req.role), content: req.doc.content, shares });
  });

  app.patch('/api/docs/:id', auth, withDoc('edit'), (req, res) => {
    const { title, content } = req.body;
    let t = req.doc.title, c = req.doc.content;
    if (title !== undefined) { t = cleanTitle(title); if (!t) return res.status(400).json({ error: 'Title cannot be empty.' }); }
    if (content !== undefined) { if (typeof content !== 'string') return res.status(400).json({ error: 'Content must be HTML text.' }); c = clean(content); }
    db.prepare('UPDATE documents SET title=?, content=?, updated_at=? WHERE id=?').run(t, c, now(), req.doc.id);
    res.json(shape(getDoc(req.doc.id), req.role));
  });

  app.delete('/api/docs/:id', auth, withDoc('owner'), (req, res) => {
    db.prepare('DELETE FROM shares WHERE doc_id = ?').run(req.doc.id);
    db.prepare('DELETE FROM documents WHERE id = ?').run(req.doc.id);
    res.json({ ok: true });
  });

  app.post('/api/docs/:id/shares', auth, withDoc('owner'), (req, res) => {
    const u = String(req.body.username || '').toLowerCase(); const role = req.body.role || 'edit';
    if (!SEED_USERS.includes(u)) return res.status(400).json({ error: `No such user. Available: ${SEED_USERS.join(', ')}.` });
    if (u === req.user) return res.status(400).json({ error: 'You already own this document.' });
    if (!['view', 'edit'].includes(role)) return res.status(400).json({ error: 'Role must be view or edit.' });
    db.prepare('INSERT INTO shares VALUES (?,?,?) ON CONFLICT(doc_id, username) DO UPDATE SET role = excluded.role').run(req.doc.id, u, role);
    res.status(201).json({ username: u, role });
  });
  app.delete('/api/docs/:id/shares/:username', auth, withDoc('owner'), (req, res) => {
    db.prepare('DELETE FROM shares WHERE doc_id = ? AND username = ?').run(req.doc.id, req.params.username);
    res.json({ ok: true });
  });

  app.post('/api/upload', auth, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!ALLOWED_UPLOADS.includes(ext)) return res.status(400).json({ error: `Unsupported file type. Use ${ALLOWED_UPLOADS.join(', ')}.` });
    try {
      let html;
      if (ext === '.docx') html = (await mammoth.convertToHtml({ buffer: req.file.buffer })).value;
      else if (ext === '.md') html = markdownToHtml(req.file.buffer.toString('utf8'));
      else html = req.file.buffer.toString('utf8').split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
      const title = cleanTitle(path.basename(req.file.originalname, ext)) || 'Imported document';
      res.status(201).json(shape(createDoc(req.user, title, clean(html)), 'owner'));
    } catch {
      res.status(422).json({ error: 'Could not read that file. It may be corrupted.' });
    }
  });

  app.use((err, _req, res, _next) => {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is larger than 2 MB.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    console.error(err); res.status(500).json({ error: 'Something went wrong.' });
  });
  app.use(express.static(path.join(__dirname, 'public')));
  app.close = () => db.close();
  return app;
}

module.exports = { createApp, markdownToHtml };
if (require.main === module) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`Listening on http://localhost:${port}`));
}
