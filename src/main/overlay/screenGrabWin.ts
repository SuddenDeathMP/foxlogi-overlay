import koffi from 'koffi'

const SRCCOPY = 0x00cc0020
const BI_RGB = 0
const DIB_RGB_COLORS = 0

/** A screen rect in physical (per-monitor aware) px. */
export interface GrabRect {
  x: number
  y: number
  width: number
  height: number
}

/** Reads screen rects: BGRA pixels per rect, rows top-down (the
 *  NativeImage.toBitmap() layout). */
export type ScreenGrab = (rects: GrabRect[]) => Uint8Array[]

/**
 * Windows: copies screen rects with GDI (BitBlt from the screen DC). Small
 * rects take milliseconds, where desktopCapturer captures and scales the whole
 * display on every call. The returned function throws if a GDI call fails.
 */
export function createScreenGrabber(): ScreenGrab {
  const user32 = koffi.load('user32.dll')
  const gdi32 = koffi.load('gdi32.dll')

  const GetDC = user32.func('void * __stdcall GetDC(void *hWnd)')
  const ReleaseDC = user32.func('int __stdcall ReleaseDC(void *hWnd, void *hDC)')
  const CreateCompatibleDC = gdi32.func('void * __stdcall CreateCompatibleDC(void *hdc)')
  const CreateCompatibleBitmap = gdi32.func('void * __stdcall CreateCompatibleBitmap(void *hdc, int cx, int cy)')
  const SelectObject = gdi32.func('void * __stdcall SelectObject(void *hdc, void *h)')
  const BitBlt = gdi32.func(
    'bool __stdcall BitBlt(void *hdc, int x, int y, int cx, int cy, void *hdcSrc, int x1, int y1, uint32_t rop)'
  )
  const GetDIBits = gdi32.func(
    'int __stdcall GetDIBits(void *hdc, void *hbm, uint32_t start, uint32_t cLines, _Out_ void *lpvBits, _Inout_ void *lpbmi, uint32_t usage)'
  )
  const DeleteObject = gdi32.func('bool __stdcall DeleteObject(void *ho)')
  const DeleteDC = gdi32.func('bool __stdcall DeleteDC(void *hdc)')

  /** One rect through a bitmap selected into `memDc`, then out as DIB bits. */
  const grabOne = (screenDc: unknown, memDc: unknown, { x, y, width, height }: GrabRect): Uint8Array => {
    const bitmap = CreateCompatibleBitmap(screenDc, width, height)
    if (!bitmap) throw new Error('CreateCompatibleBitmap failed')
    try {
      const old = SelectObject(memDc, bitmap)
      const copied = BitBlt(memDc, 0, 0, width, height, screenDc, x, y, SRCCOPY)
      // GetDIBits wants the bitmap out of any DC.
      SelectObject(memDc, old)
      if (!copied) throw new Error('BitBlt failed')

      // BITMAPINFO: a 40-byte BITMAPINFOHEADER plus one (unused) RGBQUAD.
      const info = Buffer.alloc(44)
      info.writeUInt32LE(40, 0) // biSize
      info.writeInt32LE(width, 4)
      info.writeInt32LE(-height, 8) // negative: rows top-down
      info.writeUInt16LE(1, 12) // biPlanes
      info.writeUInt16LE(32, 14) // biBitCount
      info.writeUInt32LE(BI_RGB, 16)
      // Its own ArrayBuffer (not Node's Buffer pool), so it can be transferred.
      const pixels = new Uint8Array(width * height * 4)
      if (GetDIBits(memDc, bitmap, 0, height, pixels, info, DIB_RGB_COLORS) !== height) {
        throw new Error('GetDIBits failed')
      }
      return pixels
    } finally {
      DeleteObject(bitmap)
    }
  }

  return (rects) => {
    const screenDc = GetDC(null)
    if (!screenDc) throw new Error('GetDC failed')
    const memDc = CreateCompatibleDC(screenDc)
    try {
      if (!memDc) throw new Error('CreateCompatibleDC failed')
      return rects.map((r) => grabOne(screenDc, memDc, r))
    } finally {
      if (memDc) DeleteDC(memDc)
      ReleaseDC(null, screenDc)
    }
  }
}
