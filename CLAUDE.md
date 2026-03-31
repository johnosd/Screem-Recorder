# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Extension (Manifest V3) for recording screen and audio. No build system, no dependencies — pure vanilla JavaScript loaded directly as an unpacked extension.

## Loading the Extension

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this directory
4. After any code change, click the **reload icon** on the extension card

There are no build, lint, or test commands.

## Architecture

```
User clicks icon → popup.html/popup.js → opens recorder.html in a new tab
                                              ↓
                                        recorder.js sends "request-desktop-capture" message
                                              ↓
                                        background.js (Service Worker) calls Chrome desktopCapture API
                                              ↓
                                        recorder.js gets streamId → getUserMedia → Web Audio API mixing → MediaRecorder → WebM download
```

### File Roles

| File | Role |
|------|------|
| `popup.html/js` | Extension entry point — opens recorder tab and closes itself |
| `background.js` | Service Worker; handles `desktopCapture.chooseDesktopMedia()` (must run in service worker context) |
| `recorder.html` | Main UI — contains all CSS (CSS variables, dark theme) and HTML states |
| `recorder.js` | Core logic: stream capture, audio mixing, MediaRecorder lifecycle, timer, download |

### Recording Pipeline

1. `background.js` receives `request-desktop-capture` message, opens Chrome's native picker
2. `recorder.js` receives `streamId`, calls `getUserMedia` with `chromeMediaSource: 'desktop'`
3. Optionally mixes microphone via Web Audio API (`AudioContext` + `createGain`)
4. `MediaRecorder` records the final stream into `chunks[]`
5. On stop: creates a Blob, triggers download as `.webm`

### UI States (controlled by `data-view` on `<body>`)

- `v-idle` — mode selection (Video+Audio or Audio-only)
- `v-rec` — active recording (live timer, pause/stop)
- `v-done` — post-recording (download or discard)

## Key Technical Constraints

- **desktopCapture API** requires a service worker context — this is why `background.js` exists; `recorder.js` cannot call it directly.
- Output format is always **WebM** (VP9 video, Opus audio). Use ffmpeg to convert to MP4 if needed.
- Recording specs: 5 Mbps video, 128 kbps audio, up to 1920×1080 @ 30fps.
- Microphone is optional — silently falls back to system audio only if unavailable.
