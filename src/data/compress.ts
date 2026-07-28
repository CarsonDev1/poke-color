/**
 * gzip/gunzip bằng CompressionStream — API của DOM, nên nằm ở src/data và
 * KHÔNG được đưa vào src/core (core phải chạy được trong môi trường node
 * thuần để test nhanh).
 */
async function through(bytes: Uint8Array, stream: TransformStream): Promise<Uint8Array> {
  const blob = new Blob([bytes as unknown as BlobPart])
  const piped = blob.stream().pipeThrough(stream)
  const buf = await new Response(piped).arrayBuffer()
  return new Uint8Array(buf)
}

export function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return through(bytes, new CompressionStream('gzip'))
}

export function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return through(bytes, new DecompressionStream('gzip'))
}
