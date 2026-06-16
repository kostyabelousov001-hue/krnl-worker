# ⚡ KRNL — Distributed Web Scraper

[![Build iOS Worker](https://github.com/kostyabelousov001-hue/krnl-worker/actions/workflows/ios-build.yml/badge.svg)](https://github.com/kostyabelousov001-hue/krnl-worker/actions/workflows/ios-build.yml)
[![Platform](https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS-lightgrey)]()
[![Platform](https://img.shields.io/badge/Mobile-iOS-blue)]()
[![Language](https://img.shields.io/badge/language-Node.js%20%7C%20Swift-blue)]()

Distributed Google Maps scraper with hot-swappable iOS worker app. Scrapes B2B contacts (name, rating, phone, website, email) from Google Maps in parallel across multiple machines.

---

## 🚀 Quick Start

```bash
npm install
PORT=8000 node browser-automation/distributed-app.js --auto --query "real estate Dubai" --passes 3
```

iOS workers connect via `lol.krnlcamel.space`.

---

## 📦 Architecture

```
krn-worker/
├── browser-automation/       # Core scraper (Node.js + Playwright)
│   ├── distributed-app.js    # Multi-pass host + WebSocket server
│   ├── worker-script.js      # Hot-swappable JS scraping logic
│   ├── design.json           # Hot-swappable design config
│   └── ui-config.json        # Hot-swappable iOS UI definition
├── ios-worker/               # iOS app (SwiftUI)
│   ├── KRNLWorker/           # Source files
│   └── project.yml           # XcodeGen project spec
└── .github/workflows/        # GitHub Actions CI/CD
```

### How it works

```
┌──────────┐   WebSocket    ┌──────────┐
│  Host     │◄─────────────►│  Worker   │
│ (Server)  │               │ (iPhone)  │
└──────────┘               └──────────┘
     │                            │
     │ Serves:                    │ Downloads:
     │  • /health (status)        │  • ui-config.json (UI layout)
     │  • /script/worker.js       │  • worker-script.js (scraping logic)
     │  • /config/ui.json         │
     └────────────────────────────┘
```

---

## 🔄 Hot-Swap

Update the server files — iOS app picks them up automatically, no reinstall:

| File | Changes without .ipa update |
|---|---|
| `worker-script.js` | Scraping logic (selectors, parsing) |
| `ui-config.json` | Full iOS UI (sections, colors, icons) |
| `design.json` | Visual theme |

---

## 📱 iOS Worker

Connect your iPhone as a distributed worker node:

1. Download `.ipa` from [GitHub Actions](https://github.com/kostyabelousov001-hue/krnl-worker/actions)
2. Sideload with **AltStore** or **Sideloadly**
3. Open → enter `lol.krnlcamel.space` → Connect

The app renders UI from server `ui-config.json` and runs scraping logic from `worker-script.js`. Built once, updates forever.

---

## ⚙️ Server Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Server status, worker count, phase |
| `GET /script/worker.js` | Scraping JS for iOS hot-swap |
| `GET /config/ui.json` | iOS UI definition |

---

## 📄 License

MIT