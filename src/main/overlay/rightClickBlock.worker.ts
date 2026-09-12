import { parentPort, workerData } from 'node:worker_threads'
import koffi from 'koffi'
import { ARMED, BOTTOM, LEFT, RIGHT, STOP, TOP } from './rightClickBlockFlags'

/**
 * Windows only. A low-level mouse hook (WH_MOUSE_LL) that swallows right-clicks
 * while armed, so they never reach the game, and reports each one to main.
 * Everything else passes through untouched.
 *
 * The OS calls the hook on the thread that installed it, from inside that
 * thread's message loop. Main's loop can be busy (captures, grid detection),
 * and a slow hook lags the mouse system-wide, so the hook gets its own thread:
 * this worker installs it and then only pumps messages. The hook proc runs
 * synchronously inside GetMessageW, on this thread.
 */

const WH_MOUSE_LL = 14
const HC_ACTION = 0
const WM_RBUTTONDOWN = 0x0204
const WM_RBUTTONUP = 0x0205
/** How often the loop wakes up to check the stop flag. */
const POLL_MS = 100

/** Shared with main, see rightClickBlockFlags.ts. */
const flags: Int32Array = workerData.flags

const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')

// For WH_MOUSE_LL, lParam points to an MSLLHOOKSTRUCT, which starts with the
// cursor POINT in physical (per-monitor aware) screen px.
const POINT = koffi.struct('POINT', { x: 'int32_t', y: 'int32_t' })
const LowLevelMouseProc = koffi.proto(
  'intptr_t __stdcall LowLevelMouseProc(int nCode, uintptr_t wParam, void *lParam)'
)
const SetWindowsHookExW = user32.func(
  'void * __stdcall SetWindowsHookExW(int idHook, LowLevelMouseProc *lpfn, void *hmod, uint32_t dwThreadId)'
)
const CallNextHookEx = user32.func(
  'intptr_t __stdcall CallNextHookEx(void *hhk, int nCode, uintptr_t wParam, void *lParam)'
)
const UnhookWindowsHookEx = user32.func('bool __stdcall UnhookWindowsHookEx(void *hhk)')
const SetTimer = user32.func('uintptr_t __stdcall SetTimer(void *hWnd, uintptr_t id, uint32_t ms, void *proc)')
const KillTimer = user32.func('bool __stdcall KillTimer(void *hWnd, uintptr_t id)')
// MSG is never read here, so it's passed as a raw buffer (48 bytes on x64).
const GetMessageW = user32.func('int __stdcall GetMessageW(void *lpMsg, void *hWnd, uint32_t min, uint32_t max)')
const GetModuleHandleW = kernel32.func('void * __stdcall GetModuleHandleW(void *name)')

/** The press was swallowed, so its release must be too. */
let swallowUp = false

function overOverlay(lParam: bigint): boolean {
  const pt = koffi.decode(lParam, POINT) as { x: number; y: number }
  return (
    pt.x >= Atomics.load(flags, LEFT) &&
    pt.x < Atomics.load(flags, RIGHT) &&
    pt.y >= Atomics.load(flags, TOP) &&
    pt.y < Atomics.load(flags, BOTTOM)
  )
}

const proc = koffi.register((nCode: number, wParam: number, lParam: bigint): number => {
  if (nCode === HC_ACTION) {
    if (wParam === WM_RBUTTONDOWN && Atomics.load(flags, ARMED) === 1 && overOverlay(lParam)) {
      swallowUp = true
      parentPort?.postMessage('rightDown')
      return 1
    }
    if (wParam === WM_RBUTTONUP && swallowUp) {
      swallowUp = false
      return 1
    }
  }
  return CallNextHookEx(null, nCode, wParam, lParam)
}, koffi.pointer(LowLevelMouseProc))

const hook = SetWindowsHookExW(WH_MOUSE_LL, proc, GetModuleHandleW(null), 0)
if (!hook) {
  koffi.unregister(proc)
  throw new Error('SetWindowsHookExW(WH_MOUSE_LL) failed')
}
parentPort?.postMessage('ready')

// GetMessageW blocks until a message arrives, and neither main's stop flag nor
// terminate() can interrupt it. A thread timer (WM_TIMER on this thread's queue)
// wakes it up so the flag gets checked, and so the app can't hang on quit
// waiting for this thread.
const timer = SetTimer(null, 0, POLL_MS, null)
const msg = Buffer.alloc(64)
// GetMessageW returns -1 on error.
while (Atomics.load(flags, STOP) === 0 && GetMessageW(msg, null, 0, 0) > 0) {
  // Nothing to dispatch: this thread has no windows, only the hook and timer.
}

KillTimer(null, timer)
UnhookWindowsHookEx(hook)
koffi.unregister(proc)
