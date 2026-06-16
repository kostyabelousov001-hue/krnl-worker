# ⚡ Distributed Web Scraper

[![Build iOS Worker](https://github.com/kostyabelousov001-hue/krnl-worker/actions/workflows/ios-build.yml/badge.svg)](https://github.com/kostyabelousov001-hue/krnl-worker/actions/workflows/ios-build.yml)
[![Desktop](https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS-lightgrey)]()
[![Mobile](https://img.shields.io/badge/Mobile-iOS-blue)]()

Distributed Google Maps scraper with hot-swappable iOS worker app. Collects B2B contacts from Google Maps in parallel across multiple machines.

---

## Quick Start

```bash
cd browser-automation
npm install
PORT=9090 node distributed-app.js --auto --query "real estate Dubai" --passes 3
```

Workers connect to the host via WebSocket.

---

## Architecture

```
server/               # Core scraper (Node.js + Playwright)
├── distributed-app.js    # Multi-pass host + WebSocket server
├── worker-script.js      # Hot-swappable JS scraping logic
├── ui-config.json        # Hot-swappable iOS UI definition
└── design.json           # Visual theme config

ios-worker/            # iOS app (SwiftUI)
├── KRNLWorker/        # Source files
└── project.yml        # XcodeGen project spec
```

---

## Hot-Swap

Update server files — iOS app picks them up on next connect, no reinstall:

| File | Changes without .ipa update |
|---|---|
| `worker-script.js` | Scraping logic (selectors, parsing) |
| `ui-config.json` | Full iOS UI (sections, colors, icons) |
| `design.json` | Color theme |

---

## iOS Worker

1. Download `.ipa` from [GitHub Actions](https://github.com/kostyabelousov001-hue/krnl-worker/actions)
2. Install via AltStore or Sideloadly
3. Open app → enter host address → Connect

---

## Server Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Server status |
| `GET /script/worker.js` | Scraping JS for iOS hot-swap |
| `GET /config/ui.json` | iOS UI definition |

---

## License

MIT