import koffi from 'koffi'
import { POLL_MS, type RightClickFilter } from './rightClickBlockShared'

const kCGSessionEventTap = 1
const kCGHeadInsertEventTap = 0
/** An active filter, which may drop events (listen-only taps can't). */
const kCGEventTapOptionDefault = 0
const kCGEventRightMouseDown = 3
const kCGEventRightMouseUp = 4
/** Sent instead of an event when macOS disabled the tap: the callback was too
 *  slow, or secure input (a password field) took over. */
const kCGEventTapDisabledByTimeout = 0xfffffffe
const kCGEventTapDisabledByUserInput = 0xffffffff

/**
 * macOS: a session event tap. Returning NULL from its callback drops the event,
 * so the game (e.g. under CrossOver) never gets it. Needs Accessibility
 * permission, like the global input hook; without it the tap can't be
 * created. Blocks, running this thread's run loop, until `filter.stopped()`;
 * throws if the tap can't be created.
 */
export function runMacTap(filter: RightClickFilter, onReady: () => void): void {
  const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
  const cf = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')

  // Global display coordinates in points, top-left origin: the same space as
  // Electron's window bounds.
  const CGPoint = koffi.struct('CGPoint', { x: 'double', y: 'double' })
  const CGEventTapCallBack = koffi.proto(
    'void *CGEventTapCallBack(void *proxy, uint32_t type, void *event, void *userInfo)'
  )
  const CGEventTapCreate = cg.func(
    'void *CGEventTapCreate(uint32_t tap, uint32_t place, uint32_t options, uint64_t mask, CGEventTapCallBack *callback, void *userInfo)'
  )
  const CGEventTapEnable = cg.func('void CGEventTapEnable(void *tap, bool enable)')
  const CGEventGetLocation = cg.func('CGPoint CGEventGetLocation(void *event)')
  const CFMachPortCreateRunLoopSource = cf.func('void *CFMachPortCreateRunLoopSource(void *allocator, void *port, long order)')
  const CFMachPortInvalidate = cf.func('void CFMachPortInvalidate(void *port)')
  const CFRunLoopGetCurrent = cf.func('void *CFRunLoopGetCurrent()')
  const CFRunLoopAddSource = cf.func('void CFRunLoopAddSource(void *rl, void *source, void *mode)')
  const CFRunLoopRemoveSource = cf.func('void CFRunLoopRemoveSource(void *rl, void *source, void *mode)')
  const CFRunLoopRunInMode = cf.func('int32_t CFRunLoopRunInMode(void *mode, double seconds, bool returnAfterSourceHandled)')
  const CFRelease = cf.func('void CFRelease(void *cf)')
  const defaultMode = koffi.decode(cf.symbol('kCFRunLoopDefaultMode'), 'void *')

  let tap: bigint | null = null
  const callback = koffi.register((_proxy: bigint, type: number, event: bigint): bigint | null => {
    if (type === kCGEventTapDisabledByTimeout || type === kCGEventTapDisabledByUserInput) {
      if (tap) CGEventTapEnable(tap, true)
      return event
    }
    if (type === kCGEventRightMouseDown && filter.down(() => CGEventGetLocation(event))) return null
    if (type === kCGEventRightMouseUp && filter.up()) return null
    return event
  }, koffi.pointer(CGEventTapCallBack))

  const mask = (1 << kCGEventRightMouseDown) | (1 << kCGEventRightMouseUp)
  tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionDefault, mask, callback, null)
  if (!tap) {
    koffi.unregister(callback)
    throw new Error('CGEventTapCreate failed (no Accessibility permission?)')
  }
  const source = CFMachPortCreateRunLoopSource(null, tap, 0)
  const runLoop = CFRunLoopGetCurrent()
  CFRunLoopAddSource(runLoop, source, defaultMode)
  CGEventTapEnable(tap, true)
  onReady()

  // Runs the tap's callbacks as events come; returns every POLL_MS to check
  // the stop flag.
  while (!filter.stopped()) CFRunLoopRunInMode(defaultMode, POLL_MS / 1000, false)

  CGEventTapEnable(tap, false)
  CFRunLoopRemoveSource(runLoop, source, defaultMode)
  CFMachPortInvalidate(tap)
  CFRelease(source)
  CFRelease(tap)
  koffi.unregister(callback)
}
