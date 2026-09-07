# ChatGPT overlay

The current view embeds https://chatgpt.com using Electron's WebContentsView.
ChatGPT blocks standard iframe embedding. Its normal login and access checks
still apply; some login providers may not support embedded browsers.

Run `npm install` then `npm start`. No Python setup is needed for this view.
Live captions and Ctrl+Shift+S are disabled, and audio capture does not start.
The transcription code and downloaded model remain available for later.

- Browser interaction starts enabled: click and type normally.
- Ctrl+Shift+I toggles between browser interaction and click-through.
- Hold Ctrl+Shift to temporarily interact, drag the header, or resize with the
  bottom-right grip. Ctrl+Shift+wheel scrolls the page.
- Ctrl+Shift+Q quits.

The browser uses its own persistent login session and has no Node.js access.
Microphone access is allowed only for ChatGPT, only while the system-audio bridge
is ready. Camera and other device permissions remain disabled.

## System audio as ChatGPT microphone

Install VB-CABLE from its official vendor and restart Windows. In Windows Sound
settings, keep your normal speakers/headphones as the output. In the classic
Recording tab, set **CABLE Output** as both the default recording and default
communications device. Then restart this app. This recording-device change also
affects other apps that use Windows' default microphone.

The local audio bridge copies the default playback device into **CABLE Input**.
ChatGPT receives it through **CABLE Output** when you activate its microphone.
If ChatGPT offers an input selector, select CABLE Output there too. The bridge
does not open the physical microphone. The website must also use CABLE Output,
not a previously selected physical microphone.

This is online ChatGPT audio input, not local transcription: ChatGPT receives
audio while its mic/voice session is active. The embedded page's audio output is
muted while routing is ready to prevent ChatGPT from hearing its own responses.
Closing the overlay stops the bridge. If routing changes, restart the app.
Run `.venv\Scripts\python.exe system_audio.py --check` to check the devices.

## Retained caption setup

The instructions below apply to the retained, currently disabled caption code.

Windows with Python 3.14 and Node.js installed (tested configuration):

```powershell
npm install
npm run setup:captions
npm start
```

Setup downloads Python dependencies and the multilingual Whisper base model.
After setup, recognition runs offline on the CPU. Audio and captions are held
in memory, not saved or uploaded. No API key is needed.

- Ctrl+Shift+S: pause/resume capture (also retries after an error).
- Hold Ctrl+Shift and drag the header to move the overlay.
- Hold Ctrl+Shift and drag the bottom-right grip to resize (minimum 300 x 220).
- Hold Ctrl+Shift and use the mouse wheel over the overlay to scroll captions.
  Scroll to the bottom to resume following new captions automatically.
- Ctrl+Shift+Q: quit and stop capture.

Captions start automatically and replace the sample discussion text. The
listening indicator names the captured Windows default playback device. To
switch outputs, pause, change the Windows default output, then resume.
Audio routed to a different output device is not captured. The microphone is
not captured unless it is being played back through the selected output.

Recognition uses four-second audio chunks plus processing time. Words at chunk
boundaries can be missed, and music/noise can produce errors. This is a basic
caption demo, not a word-perfect streaming recognizer. Last 30 chunks stay in
memory until the app closes. Use `npm run check:captions` to check the model and
default loopback device without recording audio.
