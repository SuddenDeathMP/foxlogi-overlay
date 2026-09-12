import { parentPort, type TransferListItem, type Worker } from 'node:worker_threads'

// Request/response over a worker thread: main sends { id, payload }, the
// worker answers { id, result } or { id, error }.

type Request<Req> = { id: number; payload: Req }
type Reply<Res> = { id: number; result: Res } | { id: number; error: string }

/** Worker side: answer each request with `handle`'s result. `transferOf` lists
 *  result buffers to move rather than copy back to main. */
export function serveRequests<Req, Res>(handle: (req: Req) => Res, transferOf?: (res: Res) => TransferListItem[]): void {
  parentPort?.on('message', ({ id, payload }: Request<Req>) => {
    let result: Res
    try {
      result = handle(payload)
    } catch (err) {
      parentPort?.postMessage({ id, error: (err as Error).message } satisfies Reply<Res>)
      return
    }
    parentPort?.postMessage({ id, result } satisfies Reply<Res>, transferOf?.(result) ?? [])
  })
}

export interface WorkerClient<Req, Res> {
  /** Resolves null when the request fails, or the worker can't run (it failed
   *  to start or died earlier this run), so the caller can fall back. */
  request(payload: Req): Promise<Res | null>
}

/**
 * Main side: starts the worker on first use (unref'd, so it never keeps the
 * app from quitting). A worker that errors or exits is given up on for the
 * rest of the run, with one warning.
 */
export function createWorkerClient<Req, Res>(name: string, create: () => Worker): WorkerClient<Req, Res> {
  let worker: Worker | null = null
  let broken = false
  let nextId = 0
  const pending = new Map<number, (reply: Reply<Res> | null) => void>()

  const fail = (err: Error): void => {
    if (!broken) console.warn(`[${name}] worker unavailable:`, err.message)
    broken = true
    worker = null
    pending.forEach((settle) => settle(null))
    pending.clear()
  }

  const ensure = (): Worker | null => {
    if (broken) return null
    if (worker) return worker
    try {
      worker = create()
    } catch (err) {
      fail(err as Error)
      return null
    }
    worker.unref()
    worker.on('message', (reply: Reply<Res>) => {
      pending.get(reply.id)?.(reply)
      pending.delete(reply.id)
    })
    worker.on('error', fail)
    worker.on('exit', () => fail(new Error('worker exited')))
    return worker
  }

  return {
    async request(payload) {
      const w = ensure()
      if (!w) return null
      const id = ++nextId
      const reply = await new Promise<Reply<Res> | null>((settle) => {
        pending.set(id, settle)
        w.postMessage({ id, payload } satisfies Request<Req>)
      })
      if (reply && 'error' in reply) {
        console.warn(`[${name}] request failed:`, reply.error)
        return null
      }
      return reply ? reply.result : null
    }
  }
}
