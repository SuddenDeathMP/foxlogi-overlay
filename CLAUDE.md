# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A transparent, always-on-top Electron overlay for the game Foxhole. It surfaces three panels (Logistics tasks, Bunker Supply, Pilot Missions) on top of the game and talks to the existing FoxholeLogistics Django backend over HTTPS with a personal API key (`fxl_…`). Stack: electron-vite + React 19 + Ant Design v6 + Zustand.

## Commands

```bash
npm run dev              # run the overlay with hot reload
npm run typecheck        # tsc for both processes (typecheck:node + typecheck:web)
npm run typecheck:node   # main + preload only (tsconfig.node.json)
npm run typecheck:web    # renderer only (tsconfig.web.json)
npm run build            # electron-vite build to out/
npm run pack:win|mac|linux  # build + electron-builder package
```

There are no tests and no linter; `npm run typecheck` is the verification step.

## Architecture

Three Electron contexts built separately by electron-vite (`src/main`, `src/preload`, `src/renderer`), plus `src/shared/` imported by all of them via the `@shared` alias (`@renderer` aliases `src/renderer/src`). Main and preload compile under `tsconfig.node.json`; the renderer under `tsconfig.web.json` — a shared file must typecheck under both.

### Security model: all backend HTTP lives in the main process

This is the load-bearing design decision; don't route requests through the renderer.

- The raw API key never enters the renderer/DOM. It is held in memory in main and persisted encrypted via `safeStorage` at `userData/auth.bin` (`src/main/auth/store.ts`). If no encryption backend exists (Linux without keyring), it is deliberately kept memory-only, never written as plaintext.
- The renderer reaches the backend only through an **enumerated** set of operations: `window.api.call(op, ...args)` where `op` is an `ApiOp` union member — never a raw URL.
- Main runs axios with a Bearer interceptor (`src/main/api/client.ts`). A 401 anywhere emits an `unauthorized` event → main clears auth state → pushes `push:unauthorized` to the renderer. All handlers return a uniform `ApiResult<T>` (`{ok, status, data|error}`) instead of throwing.
- Exception: item icons load directly in the renderer as `<img src="HOST/stockpile/64/...">` — they are unauthenticated, so no secret is involved.

**To add a new backend operation**, touch three places:
1. `src/shared/ipc-contract.ts` — add the op name to the `ApiOp` union
2. `src/main/api/endpoints.ts` — add the handler mapping the op to an HTTP call (mirror the web app's `frontend/src/api/*.js` call shapes)
3. Call it from the renderer via `call()`/`callOrThrow()` in `src/renderer/src/lib/api.ts`

### IPC contract

All channel names live in the `IPC` const in `src/shared/ipc-contract.ts` — both preload and main import it so they can't drift. Preload (`src/preload/index.ts`) exposes a narrow `window.api` bridge (typed in `src/preload/index.d.ts`); `invoke` channels are request/response, `push:*` channels are main → renderer events (auth loss, zone geometry, interactivity, updates, clipboard ingest results, hotkey warnings).

### Overlay window & interactivity

One frameless transparent window covers the target display at `screen-saver` always-on-top level (`src/main/overlay/window.ts`). It is **click-through by default** (`setIgnoreMouseEvents(true, {forward: true})`); forwarded mousemove still hit-tests the DOM, and `App.tsx` flips interactivity on hover: cursor over any UI element → `setInteractive(true)`; off UI → back to click-through after a 150ms grace period. Anything that calls `setBounds` may reset the OS pass-through state, so geometry changes must re-assert it (`applyMouseState`).

Layout uses three "safe zones" (top banner / left / bottom strip) defined as display-size fractions in `src/shared/zones.ts`, resolved to logical pixels in main and pushed to the renderer via `push:zones`. The `Zone` component positions its children absolutely from those rects; the screen center stays clear for the game's own UI.

### Other main-process pieces

- **Settings** (`src/main/settings.ts`): persisted to `userData/config.json`. The backend host is **fixed per build** (`https://foxlogi.com` packaged, `http://localhost:5173` dev) and force-overrides anything persisted — not user-configurable.
- **Global hotkeys** (`src/main/hotkeys.ts`): toggle UI collapse (default `Alt+Z`) and clipboard ingest (default `Alt+Shift+S`). Registration can fail if the game owns the combo; failures are pushed to the renderer as a warning, never silently ignored.
- **Clipboard ingest** (`src/main/clipboard/ingest.ts`): parses the game's stockpile clipboard export (TSV, tolerates CSV), detects the source type by row count, and pushes the parsed result to the renderer's `IngestSheet`.
- **Auto-update** (`src/main/updater.ts`): electron-updater against the `publish` target in `electron-builder.yml`.

### Renderer

Single Zustand store (`src/renderer/src/stores/appStore.ts`) holds auth status, settings, zones, interactivity, and a cached item catalog (loaded once after auth, with `itemsByCode`/`itemsById` lookup maps for icons/names). Feature panels live under `src/renderer/src/features/`; all three bottom panels stay mounted (hidden with `display: none`) so in-progress task state survives tab switches. Theme tokens are in `src/renderer/src/theme/graphite.ts`.

## Platform constraints worth knowing

- The game must run in **borderless windowed** mode — exclusive fullscreen bypasses the compositor and the overlay won't draw.
- Windows: some GPUs render transparent windows as black; the `disableHardwareAcceleration` setting is applied before `app.whenReady()` as a fallback.
- Linux: requires X11/XWayland; pure Wayland breaks always-on-top, click-through, and global shortcuts.
