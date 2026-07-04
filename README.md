# Foxlogi Overlay

A cross-platform (Windows / Linux / macOS) in-game overlay for **FoxholeLogistics**.
It surfaces three features as compact panels drawn on top of the game:

- **Logistics** — transport / craft / refine / MPF tasks from the planner
- **Bunker Supply** — find a bunker by name and run its supply task
- **Pilot Missions** — log sorties, kills, and counters

Built with **electron-vite + React 19 + Ant Design v6 + Zustand**. It talks to the
existing Django backend over HTTPS using a personal **API key** (`fxl_…`).

## Architecture

```
Renderer (React)  --IPC invoke-->  Preload bridge  -->  Main (axios + Bearer)  -->  Django HTTPS
       ^------------- IPC push (401 / zones / interactive / update) -------------------┘
Images: Renderer <img src="https://HOST/stockpile/64/..."> directly (no secret)
```

- **All backend HTTP runs in the main process.** The raw API key never enters the
  renderer/DOM/devtools; main is not a browser context, so there is no CORS to
  configure on the backend.
- The key is stored encrypted via Electron `safeStorage` (Keychain / DPAPI /
  libsecret) at `userData/auth.bin` and held in memory at runtime.
- The renderer reaches the backend only through an **enumerated** set of
  operations (`window.api.call(op, ...args)`), never raw URLs.
- The backend host is fixed per build (see `src/main/settings.ts`): packaged
  builds talk to **`https://foxlogi.com`**, dev builds to
  **`http://localhost:5173`**.

### Overlay window

A single transparent, frameless, always-on-top window covers the target display.
It is **click-through by default** (the game gets the mouse); interactivity is
hover-driven — moving the cursor over an overlay control makes the window accept
the mouse, moving off it returns the mouse to the game. Three proportional safe
zones (top banner / left panel / bottom strip) leave the screen center clear for
the game's inventory UI, and the whole overlay can collapse into a small
launcher button.

Global hotkeys (configurable in Settings):

- `Alt+X` — show/hide the overlay UI
- `Alt+Shift+S` — ingest a stockpile from the clipboard: open a stockpile in
  game, copy it, press the hotkey, and the overlay parses the export and posts
  it to the backend

> The game must run in **borderless windowed** mode — exclusive fullscreen bypasses
> the desktop compositor and the overlay won't draw.

## Requirements (backend)

The overlay authenticates with a personal API key. In the FoxholeLogistics repo,
every endpoint the overlay calls accepts `Authorization: Bearer fxl_…` via the
`ApiKeyAuthMixin`. Generate a key in the web app under **Settings → API keys** and
paste it into the overlay's auth panel.

## Develop

```bash
npm install
npm run dev          # launches the overlay against http://localhost:5173
npm run typecheck    # tsc for main+preload and renderer
```

The in-overlay **Settings** drawer (persisted to `userData/config.json`) lets you
pick the target display, change the two hotkeys, disable hardware acceleration,
and disconnect (clear the stored API key).

## Package

```bash
npm run pack:win     # NSIS + portable (sign with CSC_LINK/CSC_KEY_PASSWORD)
npm run pack:mac     # dmg + zip (auto-update requires signing + notarization)
npm run pack:linux   # AppImage + deb
```

Auto-update uses `electron-updater` against the `publish` target in
`electron-builder.yml` (GitHub Releases — set `owner`/`repo` before releasing).
Unsigned dev builds skip the update check.

## Platform notes

- **Windows**: if the overlay renders as a black box, enable *Disable hardware
  acceleration* in Settings (some GPUs mishandle transparent windows).
- **Linux**: use an **X11 (XWayland)** session — pure Wayland restricts
  always-on-top, click-through, and global shortcuts. Without a keyring the API key
  is kept in memory only (a banner warns you).
- **macOS**: global hotkeys may require granting **Accessibility** permission.
