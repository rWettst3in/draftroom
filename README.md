# Draftroom

A small full-stack collaborative document editor: rich-text editing, file import, per-document sharing, SQLite persistence.

## Run locally
Requires Node 22.5+ (uses the built-in `node:sqlite`).

    npm install
    npm start          # http://localhost:3000
    npm test           # automated tests (node:test, in-memory DB)

Sign in as `alice`, `bob`, or `carol` (mocked auth, cookie-based). To demo sharing, sign in as alice in one browser profile and bob in another (or sign out and switch). Data lives in `data.db` (override with `DB_PATH`).

## Features
- **Documents:** create, rename (title field), edit with bold / italic / underline / heading / subheading / bullet and numbered lists, autosave (800 ms debounce, Ctrl/Cmd+S), reopen from the sidebar or URL hash.
- **Upload:** `.txt`, `.md`, `.docx` (max 2 MB) become a new editable document. Stated in the UI. Markdown support is a minimal converter (headings, lists, bold, italic, paragraphs); docx goes through `mammoth`.
- **Sharing:** owner grants `edit` or `view` access to another user, can change or revoke it. Sidebar separates "My documents" from "Shared with me", with an amber marker and a "Shared by X, can edit / view only" label. View-only users get a read-only editor.
- **Persistence:** SQLite tables `users`, `documents`, `shares`. Content stored as sanitized HTML.

## Deploy
A `Dockerfile` and `render.yaml` are included (Render web service with a 1 GB persistent disk mounted at `/data`). Any Docker host works; mount a volume at `/data` or documents are lost on redeploy.
**Live URL: 

## Architecture note
- **Stack:** Express + `node:sqlite` + one static HTML page with a `contenteditable` editor. No build step, 4 runtime dependencies, so a reviewer can run it in two commands.
- **Prioritized:** correct permission logic and data safety over editor polish. Every document route goes through one `withDoc(need)` middleware (owner / edit / view). Users without access get 404, not 403, so document ids don't leak.
- **Sanitization:** all HTML is sanitized server-side with an allowlist (`sanitize-html`) on save and on import, so shared documents can't carry script (XSS) to another user. Tested.
- **Formatting:** HTML round-trips cleanly and keeps structure. The tradeoff is `document.execCommand`, which is deprecated but universally supported; a production editor would use TipTap/ProseMirror.
- **Known limits (deliberate):** no real authentication (seeded users, unsigned cookie), no real-time collaboration (last write wins), no version history, shares only by username among seeded users, docx import keeps basic structure but drops images.

## AI-native workflow note
- **Tools:** Claude (via chat with a code sandbox) for scaffolding, implementation, and test execution.
- **Where it sped things up:** the API/permission matrix, the sanitizer + upload pipeline, and the first draft of the UI and tests in one pass, plus fast iteration because the sandbox could run the tests and a smoke test immediately.
- **What I changed or rejected:** the shell's `mkdir -p {a,b}` brace expansion silently failed, which the test run exposed (0 tests ran) and I fixed. Also chose `node:sqlite` over `better-sqlite3` to avoid native build issues, and kept execCommand rather than adding an editor framework to keep scope small. Reviewer TODO: replace this paragraph with your own account of edits you made.
- **Verification:** automated tests cover auth, view/edit/owner enforcement, sanitization, markdown upload, and type rejection (3 passing). The server was smoke-tested for login, listing, and static serving. **Not yet verified:** the browser UI was not clicked through in a real browser, so manually test create, format, reload, share-as-bob, and upload before submitting.
