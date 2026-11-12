# Submission: Draftroom

## Live product
- **URL:** https://draftroom-qzt2.onrender.com
- Free tier: the first load after idle can take ~30 s. Data may reset on redeploy.
- **Test accounts (no password):** `alice`, `bob`, `carol`. Click a name on the sign-in screen.
- **To test sharing:** sign in as alice in one window, create a document, click Share, grant `bob` access. Open a private window, sign in as bob, and look under "Shared with me". Try both "Can edit" and "Can view".

## Walkthrough video
Link is in ``.

## What is included
- `server.js`, `public/index.html`, `test/app.test.js`: source code
- `package.json`, `Dockerfile`, `render.yaml`: setup and deployment
- `README.md`: local setup and run instructions
- `ARCHITECTURE.md`: architecture note
- `AI_WORKFLOW.md`: AI workflow note
- `VIDEO_URL.txt`: walkthrough video link

## Status
**Working end to end:** create, rename, edit with bold/italic/underline/headings/lists, autosave, reopen after refresh; upload .txt/.md/.docx into a new document; share with edit or view access, change or revoke it; owned vs shared distinction; SQLite persistence; input validation and error messages; automated tests.

**Partial / known limits:** mocked auth; no live collaboration (last write wins); markdown import is a minimal converter; .docx import drops images; deployed data is not durable on the free tier; no automated UI tests.

**Next, with another 2-4 hours:** swap in TipTap for a more robust editor; real auth (email magic link or OAuth); share by email with pending invites; version history with restore; Markdown/PDF export; Playwright test covering the share flow; persistent database (Postgres) for the deployment.
