// Single source of truth for IPC channel names. The preload bridge and the main
// handlers both import these so they can never drift.

export const IPC = {
  // auth
  authSetKey: 'auth:setKey',
  authStatus: 'auth:status',
  authClear: 'auth:clear',
  // settings
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  displaysList: 'displays:list',
  // overlay control
  overlaySetInteractive: 'overlay:setInteractive',
  overlayGetState: 'overlay:getState',
  overlayQuit: 'overlay:quit',
  // artillery: find the map grid in the screen edges (main captures the screen)
  overlayDetectGrid: 'overlay:detectGrid',
  // artillery: start/stop watching the screen for the open in-game map
  overlaySetMapWatch: 'overlay:setMapWatch',
  // artillery Edit mode: report right-clicks made through the click-through overlay
  overlaySetMapClicks: 'overlay:setMapClicks',
  // artillery: report left-drags on the game so the grid pans with the map
  overlaySetMapDrag: 'overlay:setMapDrag',
  // generic, narrow API gateway (operation is an enumerated key, never a raw URL)
  apiCall: 'api:call',
  // clipboard stockpile ingest
  stockpileIngest: 'stockpile:ingestFromClipboard',
  // push channels (main -> renderer)
  pushUnauthorized: 'push:unauthorized',
  pushZones: 'push:zones',
  pushInteractive: 'push:interactive',
  pushUpdateAvailable: 'push:updateAvailable',
  pushUpdateDownloaded: 'push:updateDownloaded',
  // hotkey-triggered clipboard ingest result (main -> renderer)
  pushIngest: 'push:ingest',
  // toggle-UI hotkey pressed (main -> renderer)
  pushToggleUi: 'push:toggleUi',
  // in-game map opened/closed, or map watching failed (main -> renderer)
  pushMapOpen: 'push:mapOpen',
  // the open map was zoomed with the wheel and has settled (main -> renderer)
  pushMapZoomed: 'push:mapZoomed',
  // right-click on the game, in window px, while map clicks are on (main -> renderer)
  pushMapRightClick: 'push:mapRightClick',
  // a left-drag step on the game, logical px; `end` on release (main -> renderer)
  pushMapDrag: 'push:mapDrag',
  // grid auto-detect hotkey pressed (main -> renderer)
  pushDetectGrid: 'push:detectGrid',
  // hotkey registration failures (main -> renderer)
  pushHotkeyWarning: 'push:hotkeyWarning'
} as const

// Enumerated backend operations the renderer may request. The main process maps
// each to a concrete endpoint call (see src/main/api/endpoints.ts). This keeps
// the bridge from being a "call any URL" passthrough.
export type ApiOp =
  // logistics
  | 'logisticPlanner'
  | 'logisticHubList'
  | 'regimentLogisticHubList'
  | 'logisticItemList'
  | 'regimentRefineryStocks'
  // tasks
  | 'getTransportationTask'
  | 'createTransportationTask'
  | 'transportationTaskAction'
  | 'getCraftTask'
  | 'craftTaskAction'
  | 'getRefineryTask'
  | 'checkRefineryTask'
  | 'refineryTaskAction'
  | 'mpfCalculateOrders'
  | 'mpfOrderPrepare'
  | 'mpfOrderCancel'
  | 'mpfOrderUpdate'
  | 'mpfOrderList'
  // stockpile
  | 'checkStockpileName'
  | 'updateStockpileContent'
  | 'getStockpileList'
  // bunker
  | 'bunkerBaseList'
  | 'bunkerContentGet'
  | 'bunkerContentUpdate'
  | 'bunkerSupplyTaskGet'
  | 'bunkerSupplyTaskUpdate'
  | 'bunkerSupplyTaskDelete'
  | 'bunkerSupplyPlannerGet'
  | 'bunkerSupplyTaskList'
  // pilot
  | 'pilotJournalGet'
  | 'pilotMissionStart'
  | 'pilotMissionUpdate'
  | 'pilotMissionFinish'
  | 'pilotKillCreate'
  | 'pilotKillDelete'
  | 'pilotScoreboard'

export interface ApiCallRequest {
  op: ApiOp
  args?: unknown[]
}
