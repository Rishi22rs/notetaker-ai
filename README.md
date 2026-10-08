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

On Windows, install both the local AI runtime and transcription worker before
starting a development build:

```powershell
npm run setup:windows
```

For a normal development launch:

```bash
npm install
npm start
```

## Google sign-in and MongoDB

Authentication uses Google OAuth in the system browser. The Node authentication
server verifies the Google identity, creates or updates the user in MongoDB, and
issues an opaque 30-day session. Only a hash of that session is stored in MongoDB;
the desktop copy is stored in Electron's per-user data directory.

1. In Google Cloud Console, create an OAuth 2.0 **Web application** client.
2. Add `http://127.0.0.1:8787/auth/google/callback` as an authorized redirect URI.
3. Copy `.env.example` to `.env` and fill in the MongoDB URI and Google credentials.
4. Start the authentication server and Electron app in separate terminals:

```bash
npm run start:auth
npm start
```

For a deployed backend, set `AUTH_PUBLIC_URL` to its HTTPS origin and add the exact
`<origin>/auth/google/callback` URI in Google Cloud. Start Electron with
`AUTH_SERVER_URL` set to the same origin. Never bundle `.env` or the Google client
secret with the desktop app; the build explicitly excludes `.env`.

The authentication collections are created automatically:

- `users`: Google account identity and profile details.
- `sessions`: hashed, revocable app sessions with automatic expiry.
- `auth_exchanges`: single-use, two-minute desktop handoff codes.

## Coupons

Create coupons from the backend environment. A code can grant free usage minutes
or save a percentage discount for the user's next recharge:

```bash
npm run coupon:create -- WELCOME30 --minutes 30 --max 100
npm run coupon:create -- HALFPRICE --percent 50 --max 25
```

`--max` is optional; omit it for unlimited redemptions. Codes are stored as hashes,
can be redeemed only once per user, and are applied idempotently. Free time is stored
as integer seconds. Percentage discounts are stored as single-use entitlements for
the future payment checkout flow.

## Razorpay test payments

Recharge plans are defined on the backend so the desktop client cannot choose its
own amount: 10 minutes for ₹50, 30 minutes for ₹150, and 60 minutes for ₹300.
Add Razorpay **Test Mode** credentials to `.env`:

```dotenv
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
RAZORPAY_WEBHOOK_SECRET=choose_a_separate_webhook_secret
```

Configure the Razorpay `payment.captured` webhook to:

```text
https://your-public-backend.example/webhooks/razorpay
```

Razorpay cannot deliver webhooks to `127.0.0.1`; use a deployed HTTPS staging
backend when testing webhook delivery. Checkout success is also verified against
Razorpay's API for immediate confirmation. Wallet credits are idempotent, so a
checkout callback and webhook cannot grant the same minutes twice. Keep all secret
keys on the backend and use separate Test and Live Mode credentials.

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
`npm run setup:windows`; it installs the audio dependencies, downloads the Whisper
model, builds the standalone transcription worker, and downloads the Windows local
AI runtime. On macOS, the in-app permission screen requests
microphone and system-audio access separately. System audio is captured with a
native Core Audio tap, so no screen/window picker or screen video capture is used.
After granting macOS permission, fully quit and reopen the app if macOS requests it.
