import { http } from './client'
import type { ApiOp } from '@shared/ipc-contract'
import type { ApiResult } from '@shared/types'

// Mirrors the web app's frontend/src/api/{stockpile,map-custom,pilot-journal}.js
// call shapes, but against an absolute base URL with Bearer auth. The renderer
// addresses these by the enumerated `op` key, never by raw URL.

type Handler = (...args: any[]) => Promise<ApiResult>

const handlers: Record<ApiOp, Handler> = {
  // ---- Logistics ----
  logisticPlanner: () => http.get('/api/logistic/planner/'),
  logisticHubList: () => http.get('/api/logistic-hub/list/'),
  regimentLogisticHubList: () => http.get('/api/regiment-logistic-hub/list/'),
  logisticItemList: (fetchAll = false, isBunker = false) =>
    http.get('/api/logistic-item/list/', {
      fetch_all: fetchAll ? 1 : null,
      is_bunker: isBunker ? 1 : null
    }),
  regimentRefineryStocks: () => http.get('/api/regiment-refinery-stocks/'),

  // ---- Tasks ----
  getTransportationTask: (from: number, to: number) =>
    http.get('/api/transportation-task/', { from, to }),
  createTransportationTask: (from: number, to: number, stockList: unknown) =>
    http.put('/api/transportation-task/', { from, to, stockList }),
  transportationTaskAction: (taskId: number, action: string, data: Record<string, unknown> = {}) =>
    http.post(`/api/transportation-task/${taskId}/`, { action, ...data }),
  getCraftTask: (locationId: number, craftItems: unknown) =>
    // Backend json.loads() this param — send explicit JSON like the web app does.
    http.get(`/api/craft-task/${locationId}/`, { craftItems: JSON.stringify(craftItems ?? {}) }),
  craftTaskAction: (locationId: number, action: string, data: Record<string, unknown> = {}) =>
    http.post(`/api/craft-task/${locationId}/`, { action, ...data }),
  getRefineryTask: (locationId: number) => http.get(`/api/refinery-task/${locationId}/`),
  checkRefineryTask: (locationId: number) => http.get(`/api/refinery-task/${locationId}/check/`),
  refineryTaskAction: (locationId: number, action: string, data: Record<string, unknown> = {}) =>
    http.post(`/api/refinery-task/${locationId}/`, { action, ...data }),
  mpfCalculateOrders: (locationId: number) => http.get(`/api/mpf/calculate-orders/${locationId}/`),
  mpfOrderPrepare: (locationId: number, typeId: number, quantity: number, squad?: string) =>
    http.post(`/api/mpf/order/${locationId}/${typeId}/`, { quantity, squad }),
  mpfOrderCancel: (locationId: number, typeId: number, id: number) =>
    http.del(`/api/mpf/order/${locationId}/${typeId}/`, { id }),
  mpfOrderUpdate: (locationId: number, typeId: number, id: number, action: string, squad?: string) =>
    http.put(`/api/mpf/order/${locationId}/${typeId}/`, { action, id, squad }),
  mpfOrderList: (locationId: number) => http.get('/api/mpf/order/list', { location: locationId }),

  // ---- Stockpile ----
  checkStockpileName: (name: string, locationId: number) =>
    http.get('/api/stockpile/contents/update/', { name, location_id: locationId }),
  updateStockpileContent: (
    name: string,
    contents: unknown,
    type: string | null,
    locationId: number | null,
    source: string | null = null
  ) =>
    http.post('/api/stockpile/contents/update/', {
      location_id: locationId,
      contents,
      name,
      type,
      source
    }),
  getStockpileList: (location: number | null = null, noPublic = false) =>
    http.get('/api/stockpile/list/', { location, no_public: noPublic ? 1 : 0 }),

  // ---- Bunker supply ----
  bunkerBaseList: () => http.get('/api/map-custom/bunker/list/'),
  bunkerContentGet: (bunkerId: number) => http.get(`/api/map-custom/bunker/${bunkerId}/content/`),
  bunkerContentUpdate: (
    bunkerId: number,
    contents: unknown,
    typeKey = 'name',
    quantityKey = 'quantity'
  ) =>
    http.post(`/api/map-custom/bunker/${bunkerId}/content/`, {
      contents,
      type_key: typeKey,
      quantity_key: quantityKey
    }),
  bunkerSupplyTaskGet: (bunkerId: number) =>
    http.get(`/api/map-custom/bunker/${bunkerId}/supply-task/`),
  bunkerSupplyTaskUpdate: (bunkerId: number, data: Record<string, unknown>) =>
    http.post(`/api/map-custom/bunker/${bunkerId}/supply-task/`, data),
  bunkerSupplyTaskDelete: (bunkerId: number) =>
    http.del(`/api/map-custom/bunker/${bunkerId}/supply-task/`),
  bunkerSupplyPlannerGet: (bunkerId: number, params?: Record<string, unknown>) =>
    http.get(`/api/map-custom/bunker/${bunkerId}/supply-planner/`, params),
  bunkerSupplyTaskList: (bunkerId: number) =>
    http.get(`/api/map-custom/bunker/${bunkerId}/supply-task/list/`),

  // ---- Pilot ----
  pilotJournalGet: () => http.get('/api/pilot-journal/'),
  pilotMissionStart: (aircraftId: number) =>
    http.post('/api/pilot-journal/mission/', { aircraft_id: aircraftId }),
  pilotMissionUpdate: (missionId: number, data: Record<string, unknown>) =>
    http.put(`/api/pilot-journal/mission/${missionId}/`, data),
  pilotMissionFinish: (missionId: number, isLost: boolean) =>
    http.post(`/api/pilot-journal/mission/${missionId}/finish/`, { is_lost: isLost }),
  pilotKillCreate: (missionId: number, aircraftId: number, killType: number) =>
    http.post(`/api/pilot-journal/mission/${missionId}/kill/`, {
      aircraft_id: aircraftId,
      kill_type: killType
    }),
  pilotKillDelete: (missionId: number, killId: number) =>
    http.del(`/api/pilot-journal/mission/${missionId}/kill/${killId}/`),
  pilotScoreboard: () => http.get('/api/pilot-journal/scoreboard/')
}

export async function dispatch(op: ApiOp, args: unknown[] = []): Promise<ApiResult> {
  const handler = handlers[op]
  if (!handler) {
    return { ok: false, status: 0, error: `Unknown API op: ${op}` }
  }
  return handler(...args)
}
