# UNYON project context

## Project

UNYON is an Electron desktop overlay for Windows and macOS, with a Node backend
for authentication, AI proxying, transcription, payments, and usage tracking.
Desktop entry points are `main.js` and `renderer.js`; the backend starts at
`server/index.js`. A website also exists in `website/`.

The current README opening describes cloud-only builds: Gemini answers and
Cloudflare or Groq Whisper transcription. Older README sections describe local
models and removed setup commands; check current code and package scripts before
using those instructions.

## Development commands

- Install dependencies: `npm install` (separately on each machine).
- Desktop: `npm start`.
- Backend: `npm run start:auth`; configure secrets locally using `.env.example`.
- Tests: `npm test`; use focused tests for the files being changed.
- Windows package: `npm run build:win`.
- macOS package: `npm run build:mac` (includes native audio helper build).

## Switching computers

1. Update the handoff below before switching.
2. Commit the intended code changes together with these context files and push
   the working branch to the shared Git remote.
3. On the other computer, preserve any local work, then fetch and pull the branch.
4. Open the repository in Codex and ask it to continue from `PROJECT_CONTEXT.md`.

These files share written project context through Git. They do not synchronize
live chats, uncommitted files, local configuration, or installed dependencies.
When working simultaneously, use separate branches and reconcile changes through
Git; avoid editing the same files on both machines at once.

## Latest handoff — 2026-11-22

- User requested pushing pending code, rebuilding macOS ARM64/Windows x64 apps,
  and publishing website downloads on the existing Netlify site myunyon.com.
- Pending changes remove experimental streaming transcription; answer streaming
  remains enabled. Cloudflare/Groq transcription configuration follows current code.
- Validation: all 174 tests passed. Release packaging/deployment in progress;
  use `npm run build:all`, `npm run release:stage`, then website build and Netlify deploy.
- Keep generated media and credentials out of the release commit.

## Previous handoff — 2026-11-16

- User wants project context available to Codex on both Mac and Windows.
- Added `AGENTS.md` and this file as the shared context mechanism.
- User requested pushing these context files and keeping this handoff updated
  whenever project changes are made; this is recorded in `AGENTS.md`.
- Existing working tree contains substantial uncommitted desktop, backend,
  website, dependency, policy, and transcription changes plus generated media.
  Those predate this setup; their completeness and validation are unknown.
- No application code changed and no tests run for this documentation setup.
- Context setup is being committed separately from the existing application work.
  On Windows, pull `main` to obtain the context files, then record the active
  development task here when it is known.
