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
own amount. Default packs are 100 minutes for ₹499, 300 minutes for ₹1,399,
and 1,000 minutes for ₹3,999. Custom purchases cost ₹6/minute (minimum 10).
Prices are calculated again on the server when creating an order; clients never supply amounts.

Backend catalog management (requires the backend MongoDB credentials):

```sh
# Apply the agreed pricing to an existing database; preserve other custom packs.
npm run pricing:manage -- defaults
# Change custom-minute rate to ₹6/min, minimum 10 and maximum 10,000 minutes.
npm run pricing:manage -- set 600 10 10000
npm run pricing:manage -- disable
npm run pricing:manage -- show
# Add or edit a pack: ID, duration in seconds, price in paise, optional sort order.
npm run plan:add -- weekend_pack 12000 89900 4
npm run plan:remove -- weekend_pack
```

Reopen Recharge & Offers to fetch catalog changes without a desktop release.
Fresh databases receive the defaults once. Existing databases retain their catalog
until you explicitly apply `defaults`. Removing every pack does not reseed it.
Existing payment orders keep their original amount and purchased duration.

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

Transcription is English-only and uses `tiny.en`. Two-second overlapping audio
windows produce captions sooner. Silence is skipped before inference, and a single
decoder avoids repeated decoding and language-detection work. Waiting audio is
merged by speaker with an eight-second limit per speaker; if a device cannot keep
up, older audio is skipped with a warning instead of building an unlimited delay.

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


## Cloud interview mode (Groq + Gemini)

Settings → AI & Models now offers optional cloud transcription and answering.
Local mode remains available and does not require provider keys.

1. Create a Groq key in https://console.groq.com/ and a Gemini key in
   https://aistudio.google.com/. Use the providers' Free plans for testing;
   this app does not change provider billing plans or guarantee free usage.
2. Enter both keys in Cloud providers and save. Keys are encrypted with
   Electron safeStorage in the app's local user-data directory. Blank fields
   keep saved keys; Remove saved keys deletes both and restores local transcription.
3. Select Groq transcription and either Whisper Large V3 Turbo (budget) or
   Large V3 (accuracy). Automatic language detection supports mixed-language
   testing; Hindi and English can also be selected explicitly.
4. Select Gemini 3.5 Flash-Lite in the answering-model picker. It powers typed
   answers, interview answers, suggestions, and ambiguous-question classification.
   All answers are written in English, regardless of the spoken or typed question language.
5. Start listening normally. Microphone and system transcripts retain separate
   speaker labels and use the existing echo filter and recent-session dialogue.

Enabled audio sources are uploaded to Groq. Questions and selected transcript /
reference excerpts are sent to Google. Typed cloud questions retrieve bounded
reference excerpts instead of uploading every document. This integration is
text-only for answering; attached images are not sent to Gemini.

Capture overlap is removed before cloud upload. Four-second segments favor
responsiveness; ten-second segments reduce billing overhead. Groq bills a
minimum of ten seconds per request, so shorter segments can cost substantially
more than the advertised hourly audio rate. Both sources consume provider quotas.
Silence is skipped when no utterance is pending. Stop aborts in-flight cloud
requests and discards buffered audio; the final unfinished utterance can be lost.
Network errors and quota exhaustion appear in the app without automatic provider
switching or retries. Free-tier Gemini quota may also be consumed by suggestions.
Existing app login and wallet/session requirements still apply separately from
provider free-tier quotas.

Validation: `npm test` includes mocked provider tests for Hindi UTF-8 streaming,
request cancellation, encrypted keys, speaker attribution, capture overlap,
silence suppression, and quota errors. Live quality and latency must be evaluated
with real keys and interview recordings; no provider calls are made by the tests.


## Floating interview session

Create a session from Home with company details, optional extra context, and a
resume. Once audio permissions are ready, the app starts listening and switches
to a compact floating toolbar and live interviewer question strip. Drag the
UNYON icon or toolbar background to move it. When a question finishes, a detailed
answer appears below it; longer answers scroll inside the panel.

The home icon opens the dashboard without ending the session. Floating view
returns to the overlay. Pause retains session context, Resume starts listening
again, and End clears session-only details and restores the dashboard. Global
context remains saved across sessions. The chevron collapses or expands the
latest answer. Existing hide/show and quit shortcuts remain available.


## Session history (MongoDB)

The Session history sidebar tab lists recorded sessions newest first, with company,
extra context, resume filename, date, and billed minutes. The compact list shows session details directly, with long text available on hover. New sessions also store original resume files in MongoDB GridFS (`session_resumes`).
The Download button saves the original file through a native Save dialog. Older
records that did not save original bytes cannot recover the file from extracted text.
The app checks backend storage support before saving a new resume session, so an
outdated backend cannot silently create a text-only record. New sessions are saved to the authenticated account in the
`interview_sessions` collection before listening starts. Global context is not
uploaded into session history.

The updated authentication server must be restarted/deployed with its existing
`MONGODB_URI` and `MONGODB_DB` configuration. It creates history indexes on startup.
Authenticated `/session-history` create/list/detail/end/download endpoints restrict access
to the signed-in owner. Duration is computed from linked `usage_sessions`
`chargedSeconds`; paused time is excluded, and expired audio leases cap charges
and mark interrupted sessions. End removes active session context while retaining
the account history. Historical sessions created before this feature cannot be
reconstructed because their company, context, and resume were not recorded.

### Pack original prices and direct checkout

Each pack has its own Buy button. Custom minutes have a separate live total and
Continue to payment button. In MongoDB `recharge_plans`, `amountPaise` is the actual
sale price; optional `originalAmountPaise` is the crossed-out display price. It is
shown only when it is an integer greater than the sale price. Removing it hides
the crossed-out price. Checkout never charges the original price.

```sh
# 100 minutes: display ₹699 crossed out, sell for ₹499.
npm run plan:add -- minutes_100_pack 6000 49900 1 69900
# Remove the crossed-out display price.
npm run plan:add -- minutes_100_pack 6000 49900 1 0
```

You can edit both fields directly in MongoDB and reopen Recharge & Offers to load
the changes. Existing payment orders retain their checkout price.

### Global configuration and pack names

`app_config` holds one settings document with `_id: "global"`:

```json
{
  "_id": "global",
  "enabled": true,
  "amountPaisePerMinute": 600,
  "minMinutes": 10,
  "maxMinutes": 10000
}
```

Edit these values directly in MongoDB; `600` means ₹6 per minute. Backend startup
migrates existing custom-minute settings from `payment_catalog` once, preserving
an existing `app_config` document. Checkout reads current config for each order.
`recharge_plans.name` is the editable pack title shown on its card.

```sh
npm run plan:add -- minutes_100_pack 6000 49900 1 69900 "Starter Pack"
```
