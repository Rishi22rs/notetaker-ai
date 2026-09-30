# Standalone local AI overlay

A native Windows and macOS chat overlay with a bundled `llama.cpp` inference runtime.
Users do not need Ollama, Python, or a separately installed AI service. On first use,
the app offers an in-app download of its GGUF language model. After that download,
prompts and responses remain on the computer and inference works offline. Conversation
history is stored in the app's local browser storage.

The overlay remains available above every application window. On macOS it also
appears across every desktop/Space and over full-screen applications.

## Setup

Prepare the development runtime once, then run the app:

```bash
npm install
npm run setup:llama
npm start
```

`setup:llama` downloads the pinned official `llama.cpp` build for the developer's
current OS and CPU into `vendor/llama/<platform>-<arch>`. The runtime is packaged
with release builds; the language model is deliberately not packaged. A release can
then be created normally:

```bash
npm run build:mac
# or: npm run build:win
```

The installed app offers three optional text models and downloads selected models
into its Electron user-data directory:

- Qwen 2.5 0.5B Q4 (~491 MB): fastest, for basic suggestions and answers.
- Qwen 2.5 1.5B Q4 (~1.12 GB): balanced and recommended for most users.
- Qwen 2.5 3B Q4 (~2.1 GB): better answer quality, recommended with at least 8 GB RAM.

For example:

```text
<userData>/models/qwen2.5-1.5b-instruct-q4_k_m.gguf
```

The app launches the packaged runtime as a hidden child process bound only to a
random `127.0.0.1` port. It starts on demand and is stopped when the app exits.

For a normal development launch:

```bash
npm install
npm start
```

The same commands work in macOS Terminal. On macOS, drag the title area to move
the overlay and drag a window edge or corner to resize it.

## Controls

- Download the recommended model from the model picker on first use. Download progress is shown in the app and the model becomes immediately selectable.
- Use the fixed left activity bar to switch between local AI chat and Notepad.
- Notepad saves automatically to `notes.md` inside the app's local user-data directory.
- Context accepts pasted instructions, images, PDFs, DOCX, and common text/code files. It is saved locally and included automatically with local model requests. The current bundled model is text-only.
- Up to 20 context files can be selected together or accumulated across multiple selections.
- New context uploads append to existing files; they do not replace earlier attachments.
- Files that cannot be parsed remain visible as error cards when more files are added.
- Context shows image thumbnails plus file-type cards, sizes, and text previews for uploaded reference files.
- Prompt suggestion bubbles are generated locally by the downloaded model from the saved context and current draft.
- Press Enter to send and Shift+Enter for a new line.
- Press Stop while a response is generating to cancel it.
- New clears the locally stored conversation.
- The overlay is click-through by default, so apps behind it remain fully usable.
- Press Ctrl+Shift+I on Windows or Command+Shift+I on macOS to unlock the overlay.
- While unlocked, use its controls or drag the title area to move it anywhere.
- Press the same shortcut again to restore click-through mode.
- Press Ctrl+Shift+H on Windows or Command+Shift+H on macOS to hide or show the app without stopping it.
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

On Apple Silicon macOS 14.2 or newer, install CMake (`brew install cmake`) and
build the Metal-accelerated `whisper.cpp` backend, its low-latency `tiny.en` model, and the
native system-audio helper:

```bash
npm run setup:transcription:mac
```

The macOS backend keeps the model loaded and uses Silero voice-activity and
confidence filtering so noise and silence are not decoded as speech. On Windows use
`npm run setup:transcription:win`. On macOS, the in-app permission screen requests
microphone and system-audio access separately. System audio is captured with a
native Core Audio tap, so no screen/window picker or screen video capture is used.
After granting macOS permission, fully quit and reopen the app if macOS requests it.
