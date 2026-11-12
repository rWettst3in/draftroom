# AI workflow note

**Tools:** Claude (chat with a code sandbox). <!-- EDIT: add any other tools you used -->

**Where AI materially sped me up**
- Scaffolding the API and the permission matrix, the sanitizer and upload pipeline, and a first draft of the UI and tests in one pass.
- Running tests and a server smoke test immediately in the sandbox, which shortened the feedback loop.

**What I changed or rejected**
- A shell brace-expansion bug created no directories, so the first test run executed 0 tests. The empty result exposed it and it was fixed.
- Chose `node:sqlite` over `better-sqlite3` to avoid native build problems on deploy.
- Kept `execCommand` instead of adding an editor framework, to protect scope.
- <!-- EDIT: add things YOU changed after reviewing the generated code, e.g. UI copy, styling, validation rules, rejected suggestions -->

**How I verified**
- Automated tests (3 passing): auth, view/edit/owner enforcement, sanitization, markdown upload, unsupported file type rejection.
- Server smoke test: login, document listing, static page.
- Manual checks on the deployed URL: create, format, refresh, share to a second user, upload .md and .docx. <!-- EDIT: only keep this line once you have actually done it -->
- Known gap: no automated browser/UI tests.
