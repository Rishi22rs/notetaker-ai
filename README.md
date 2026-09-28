# Local Ollama overlay

A native Windows and macOS chat overlay for local Ollama models. The window uses Electron's
capture protection, stays on top, and no longer embeds ChatGPT, Claude, Grok, or
another website. Prompts and responses go only to Ollama at `127.0.0.1:11434`.
Conversation history is stored in the app's local browser storage.

The overlay remains available above every application window. On macOS it also
appears across every desktop/Space and over full-screen applications.

## Setup

Install Ollama, pull at least one model, then run the app:

```powershell
ollama pull llama3.2
npm install
npm start
```

The same commands work in macOS Terminal. On macOS, drag the title area to move
the overlay and drag a window edge or corner to resize it.

Ollama normally runs in the background after installation. If the overlay says
it is unavailable, run `ollama serve` and reopen the app.

## Controls

- Choose any locally installed model from the model picker.
- The model picker also lists recommended downloadable models with their sizes and vision support. Downloads show live byte and percentage progress, then become immediately selectable.
- Use the fixed left activity bar to switch between local AI chat and Notepad.
- Notepad saves automatically to `notes.md` inside the app's local user-data directory.
- Context accepts pasted instructions, images, PDFs, DOCX, and common text/code files. It is saved locally and included automatically with Ollama chat requests.
- Up to 20 context files can be selected together or accumulated across multiple selections.
- New context uploads append to existing files; they do not replace earlier attachments.
- Files that cannot be parsed remain visible as error cards when more files are added.
- Context shows image thumbnails plus file-type cards, sizes, and text previews for uploaded reference files.
- Prompt suggestion bubbles are generated locally by the selected Ollama model from the saved context and the current draft.
- Press Enter to send and Shift+Enter for a new line.
- Press Stop while a response is generating to cancel it.
- New clears the locally stored conversation.
- The overlay is click-through by default, so apps behind it remain fully usable.
- Press Ctrl+Shift+I on Windows or Command+Shift+I on macOS to unlock the overlay.
- While unlocked, use its controls or drag the title area to move it anywhere.
- Press the same shortcut again to restore click-through mode.
- Ctrl+Shift+Q on Windows or Command+Shift+Q on macOS quits.

Windows capture exclusion is best-effort OS protection, not a complete DLP or anti-capture security boundary.

## Tests

```powershell
npm test
```

## Live transcription

The right-side activity button opens low-latency local transcription. It captures
computer audio and microphone audio separately and labels caption bubbles as
Computer and You. Install the fast local model once before first use:

On Apple Silicon macOS, install CMake (`brew install cmake`) and build the
Metal-accelerated `whisper.cpp` backend plus its `base.en` model:

```bash
npm run setup:transcription:mac
```

The macOS backend keeps the model loaded, uses three-second speech windows, and
filters silence/repeated output to reduce hallucinations. On Windows use
`npm run setup:transcription:win`. macOS will request Microphone
and Screen & System Audio Recording permission the first time Start listening is
used. After granting macOS permission, fully quit and reopen the app.
