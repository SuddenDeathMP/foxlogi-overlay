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
- **Global hotkeys** (`src/main/hotkeys.ts`): toggle UI collapse (default `Alt+X`), clipboard ingest (default `Alt+Shift+S`) and artillery grid auto-detect (default `Alt+G`). Registration can fail if the game owns the combo; failures are pushed to the renderer as a warning, never silently ignored.
- **Clipboard ingest** (`src/main/clipboard/ingest.ts`): reads the clipboard asynchronously (`clipboard.readText()` returns a Promise since Electron 44), parses the game's stockpile clipboard export (TSV, tolerates CSV), detects the source type by row count, and pushes the parsed result to the renderer's `IngestSheet`.
- **Auto-update** (`src/main/updater.ts`): electron-updater against the `publish` target in `electron-builder.yml`.

### Renderer

Single Zustand store (`src/renderer/src/stores/appStore.ts`) holds auth status, settings, zones, interactivity, and a cached item catalog (loaded once after auth, with `itemsByCode`/`itemsById` lookup maps for icons/names). Feature panels live under `src/renderer/src/features/`; all three bottom panels stay mounted (hidden with `display: none`) so in-progress task state survives tab switches. Theme tokens are in `src/renderer/src/theme/graphite.ts`.

### Artillery calculator (`src/renderer/src/features/Artillery/`)

A renderer-only feature: no backend calls, and it works without an API key. It is a React port of the placement, grid calibration and wind parts of fox-fall; sync, spotters and landing zones were dropped. It has its own persisted Zustand store (`store.ts`, localStorage key `artillery`), because the HUD and the map layer share state.

- **Modes:** `off` / `edit` / `locked`. "Artillery" is the fourth option in the top-bar tab switcher: selecting it turns artillery on in `edit`, and selecting any other tab turns it off. In the HUD, the "Edit mode" switch flips edit↔locked, and turning it on runs Auto-detect.
- **While on:** the bottom zone hides and the HUD (`ArtilleryPanel`) renders in the `left` zone.
- **`ArtilleryLayer`** is a full-screen fixed layer:
  - In `edit` it stays `pointer-events:none` too. Edit mode only draws the grid: it's never dragged or wheel-zoomed, and left clicks, drags and the wheel go to the game.
  - **Map drag following** (`useMapDrag` + main `mapDrag.ts`):
    - Left-drags on the game come from the shared input hook. Main sends the cursor delta in logical px from `screen.getCursorScreenPoint()`, at most once per ~16 ms frame, as `push:mapDrag`. The last step has `end: true`.
    - The renderer pans the viewport by the same amount, so the grid and pins move with the map.
    - A drag of 3 px or more ends with a quiet grid re-detect (300 ms), which removes drift from the game's panning.
    - It's active only with the map known open, or, without map tracking, in Edit mode. Left-drags in gameplay mustn't move pins.
    - Presses that start on our own UI (window interactive) are ignored.
  - Right-clicks come from main: `mapClicks.ts` listens through the shared global input hook (`gameInput.ts`) while Edit mode is on. It pushes `push:mapRightClick` with the cursor position in window px, and the layer opens the place menu there.
    - The game receives that right-click too. A window can't take one mouse button only, and the hook only observes.
    - Right-clicks while our window is interactive (over pins or panels) are left to the DOM.
    - Without the hook (macOS without Accessibility), Edit mode falls back to capturing the mouse, with the tint.
  - In that fallback the wheel still belongs to the game's map. The root carries `data-wheel-through`. On a wheel step there, the hover tracker makes the window click-through at once, so the following steps reach the game. The first step is lost, because the OS can't pass through only the wheel.
  - The mouse is taken back only when the cursor moves more than 8 px, or any move after 1.5 s.
  - In `locked` it is `pointer-events:none`, so the game gets the mouse. The unit markers opt back in with `pointer-events:auto`, so pins stay draggable and right-clickable in every mode. While a unit menu is open, the layer takes the mouse, so a click on the map closes the menu.
- **Math** lives in `lib/`: world units are meters, x right, y down, azimuth 0 = north and clockwise. `lib/platforms.ts` is the gun table. Firing vector = `(target − gun) − wind·WIND_OFFSET`. The viewport is `{x, y, zoom px/m}`. Manual calibration has two kinds (`calibrating: 'cell' | 'hex'`):
  - **Grid cell:** sets `zoom = (w+h)/250` from one dragged 125 m grid cell and snaps the grid alignment.
  - **Hex height:** sets `zoom = dy / HEX_HEIGHT` from a vertical drag between a region hex's flat top and bottom edges. `HEX_HEIGHT` = 2197 m × 0.866 ≈ 1902.6 m, from fox-fall's `HEX_SIZE`. This works when the map is zoomed out too far for the game to draw its grid. It sets the scale only; the grid alignment stays as it was.
- **Track the in-game map** (`hideWithMap`, persisted, on by default; a switch in the Settings drawer, saved with Save):
  - While artillery is on, `useMapWatch` has main poll the screen (`src/main/overlay/mapWatch.ts`). Each capture is ~300 ms, followed by a 100 ms pause. Frames are captured at a height of 1080, so Retina and 1× screens look alike.
  - Main matches the map's search icon (magnifier) in the top-right 150×90 corner with the pure `mapIcon.ts`. It uses normalized cross-correlation against an embedded 19×19 template: map screens score 0.89–1.0, anything else 0.68 or less, and the threshold is 0.8.
  - A single read above the threshold reports the map open. Polling alone reports it closed only after 2 reads below the threshold. Changes arrive as `push:mapOpen`, and App hides the overlay like a collapse while the map is closed. Hiding starts only after the map has been seen open once since artillery was turned on (`mapSeen`), so opening the tab with the map closed keeps the panel visible.
  - **Keys** (`gameInput.ts`, shared with `mapClicks.ts`): the map closes only with M or Esc, so a system-wide `uiohook-napi` hook listens for them without consuming them, which `globalShortcut` would do.
    - On a key, an open map is reported closed at once.
    - A fresh capture starts 120 ms later. Reads from captures started before then are ignored, and that fresh capture also catches M opening the map.
    - A wrong guess, such as M typed into chat, is corrected by the next read.
    - macOS needs Accessibility permission for the hook. Without it, the watch runs on polling alone (`MapWatchStart.keys: false`).
    - The `.node` prebuild is `asarUnpack`ed in `electron-builder.yml`.
  - **Automatic grid re-detect** (`requestAutoDetect` in `autoDetect.ts`): one debounced, silent run of Auto-detect (no toasts). It fires:
    - when the map opens (150 ms);
    - when the Artillery tab is selected (400 ms);
    - after the open map is wheel-zoomed. The same hook reports wheel steps, and main pushes `push:mapZoomed` once the wheel has been quiet for 600 ms. Wheel steps while our window is interactive are ours, so they're ignored.
  - The toggle button or Alt+X shows the overlay anyway, until the map next opens or closes.
  - The watched corner comes back as `mapProbe`, and `ArtilleryLayer` clips it out, because our own drawings would otherwise be in the capture.
  - Watching pauses while collapsed, calibrating, or with Settings open.
- **Auto-detect grid** crosses into main the same way:
  - The HUD button and the hotkey share one flow in `autoDetect.ts`, which calls `overlay.detectGrid()`.
  - Main (`src/main/overlay/gridCapture.ts`) captures the display with `desktopCapturer`. During the capture it keeps our window out of the frame with `setContentProtection(true)`, so there's no blink. Linux has no such flag, so there the renderer fades the overlay (`html.capture-hidden`). In dev builds main saves the captured frame to `$TMPDIR/foxlogi-grid-capture.bmp`.
  - It crops strips 10 logical px deep (20 physical on Retina) along the display edges and returns only numbers. Positions are converted into window coordinates, because on macOS the window sits below the menu bar.
  - `gridDetect.ts` is pure and has no electron imports, so it can be run from a Node script on a screenshot.
    - It keeps line candidates that match the game's lines: darker than the map, 2 px per logical px wide, a ~4% darkening present in at least 80% of the strip's rows.
    - It picks one cell size across all edges by binomial significance. Opposite edges must agree on line positions, not just on the period.
    - It then steps up from harmonics: a half- or third-size lattice also contains every real line.
  - At least 2 edges must agree, or one very strong edge must be confirmed by the other axis. Tune the thresholds on real screenshots; the game's lines are only ~5–13 luma levels deep. On macOS this needs Screen Recording permission.

## Platform constraints worth knowing

- The game must run in **borderless windowed** mode — exclusive fullscreen bypasses the compositor and the overlay won't draw.
- Windows: some GPUs render transparent windows as black; the `disableHardwareAcceleration` setting is applied before `app.whenReady()` as a fallback.
- Linux: requires X11/XWayland; pure Wayland breaks always-on-top, click-through, global shortcuts and `getCursorScreenPoint`. Since Electron 38 the default is native Wayland, so the .desktop entries pass `--ozone-platform=x11` (electron-builder `executableArgs`) and `src/main/index.ts` relaunches a packaged app with that flag when it starts in a Wayland session without it. `app.commandLine.appendSwitch` can't do this: Ozone is chosen before main JS runs.
- macOS: Electron 44 requires macOS 13+. `desktopCapturer` needs `NSAudioCaptureUsageDescription` in Info.plist (set via `mac.extendInfo`), even though we capture screens only.
- Electron 42+ no longer downloads its binary on install; the `postinstall` script runs `install-electron` so electron-vite finds `node_modules/electron/path.txt`.
- `NativeImage.toBitmap()` returns sRGB-normalized pixels (Electron 43+). The grid and map-icon thresholds apply to those values.
