/// <reference lib="webworker" />

import { handleVectorize, type VectorizeRequest } from '@/worker/vectorize-protocol'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (e: MessageEvent<VectorizeRequest>) => {
  handleVectorize(e.data, (r) => self.postMessage(r))
}
