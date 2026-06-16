# ⚡ Distributed Web Scraper

[![Build iOS Worker](https://github.com/kostyabelousov001-hue/krnl-worker/actions/workflows/ios-build.yml/badge.svg)](https://github.com/kostyabelousov001-hue/krnl-worker/actions/workflows/ios-build.yml)
[![Desktop](https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS-lightgrey)]()
[![Mobile](https://img.shields.io/badge/Mobile-iOS-blue)]()

Distributed Google Maps scraper with remote iOS worker. Collects B2B contacts in parallel across multiple machines.

---

## Quick Start

```bash
cd browser-automation
npm install
PORT=9090 node distributed-app.js --auto --query "real estate Dubai" --passes 3
```

---

## Architecture

```
server/
├── distributed-app.js    # Main server
├── worker-script.js      # Scraping logic (updatable)
├── ui-config.json        # iOS layout (updatable)
└── design.json           # Theme colors

ios-worker/
├── KRNLWorker/           # iOS app source
└── project.yml           # XcodeGen project spec
```

---

## iOS Worker

1. Download `.ipa` from [GitHub Actions](https://github.com/kostyabelousov001-hue/krnl-worker/actions)
2. Install via AltStore or Sideloadly
3. Open app → enter host:port → Connect

No reinstall needed for updates — just change files on the server.

---

## License

MIT