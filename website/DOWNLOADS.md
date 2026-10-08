# Production downloads

The website detects macOS and Windows and selects the matching installer. By
default, installers are served directly from this website—visitors are never
redirected to GitHub.

Place release assets in `public/downloads` before the production website build:

- `UNYON-1.0.0-arm64.dmg`
- `UNYON-Setup-1.0.0.exe`

The default same-origin paths are configured in `src/platform.js`. For another
host, copy `.env.example` to `.env.production` and set the public URLs there.
Keep a platform disabled until its signed installer has been uploaded; the UI
will show a waitlist button instead of sending visitors to a missing file.
