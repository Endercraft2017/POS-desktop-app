# POS System

A modern Point of Sale system built with TypeScript. Supports Android (mobile) and Desktop platforms with shared business logic.

## Structure

```
packages/
  core/     → Shared schema, types, services, validators (zero platform deps)
  mobile/   → Expo/React Native Android app
  desktop/  → Electron desktop app
```

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 9+
- Android SDK (for mobile) — should be at `%LOCALAPPDATA%\Android\Sdk`
- Java 21 (for Android builds)

### Install
```bash
pnpm install
pnpm build:core
```

### Run Desktop App
**Important:** Due to VS Code setting `ELECTRON_RUN_AS_NODE=1`, you cannot run Electron from VS Code's terminal directly. Use one of:

```bash
# Option 1: Double-click start.bat
packages/desktop/start.bat

# Option 2: From PowerShell (not VS Code terminal)
cd packages/desktop
$env:ELECTRON_RUN_AS_NODE = ''
npx electron-vite dev

# Option 3: From cmd.exe (not VS Code terminal)
cd packages\desktop
set ELECTRON_RUN_AS_NODE=
npx electron-vite dev
```

### Run Mobile App (Android)
```bash
cd packages/mobile

# Generate Android project (first time only)
npx expo prebuild --platform android

# Build APK
cd android && ./gradlew assembleDebug

# Or run on connected device/emulator
npx expo run:android
```

The APK will be at `packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

### Default Login
- PIN: `1234` (Admin account, created automatically on first launch)

## Key Documents
- [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md) — Architecture, features, design specs
- [CODE_REGISTRY.md](CODE_REGISTRY.md) — Table of contents for all code modules
- [FUTURE_UPDATES.md](FUTURE_UPDATES.md) — Planned features on hold

## Tech Stack
- **TypeScript** end-to-end
- **Drizzle ORM** + **SQLite** (local-first, cloud-ready)
- **React Native / Expo** (mobile)
- **Electron** + **React** + **Vite** (desktop)
- **Zustand** + **TanStack Query** (state)
- **Zod** (validation)
- **pnpm workspaces** + **Turborepo** (monorepo)
