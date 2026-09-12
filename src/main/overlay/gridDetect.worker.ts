import { detectGridInStrips, type GridDetection, type Strip } from './gridDetect'
import { serveRequests } from './workerRpc'

/**
 * Grid detection off the main thread: line candidates across ~28 strips take
 * 70–100 ms at 4K, and main also drives map-drag following and the map watch.
 */

export interface GridDetectRequest {
  h: Strip[]
  v: Strip[]
  scale: number
}

serveRequests<GridDetectRequest, GridDetection>(({ h, v, scale }) => detectGridInStrips(h, v, scale))
