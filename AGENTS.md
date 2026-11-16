# Shared project context

This repository is developed on both macOS and Windows. Keep durable context in
Git so agents on either computer can resume from the same information.

- Read `PROJECT_CONTEXT.md` when starting work or resuming on another computer.
- User standing instruction: keep `PROJECT_CONTEXT.md` updated as project changes
  are made, including the current task, decisions, remaining work, and validation.
  Include relevant context updates with code commits so both computers can resume.
- Treat the current code and `package.json` as authoritative when older README
  sections disagree with them.
- After meaningful work, update the handoff in `PROJECT_CONTEXT.md` with relevant
  decisions, remaining work, and validation actually performed. Keep it concise;
  do not copy chat transcripts or secrets into it.
- Inspect the working tree before editing and preserve unrelated changes.
- Use repository-relative paths in shared documentation and cross-platform Node
  scripts where practical. Verify platform-specific behavior on its target OS.
- Never commit `.env`, provider keys, credentials, session data, or private audio.

