/// <reference lib="webworker" />

import { handleGenerate, type GenerateRequest } from '@/worker/protocol'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (e: MessageEvent<GenerateRequest>) => {
  handleGenerate(e.data, (r) => self.postMessage(r))
}
