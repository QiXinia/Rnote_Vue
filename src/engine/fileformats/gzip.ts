// gzip helpers backed by the browser CompressionStream / DecompressionStream
// APIs (the desktop .rnote container since 0.13+ is gzip-compressed JSON).

export async function gzipCompress(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function gzipDecompress(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return await new Response(stream).text()
}

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

export function downloadBytes(filename: string, bytes: Uint8Array | Blob, mime: string) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadText(filename: string, text: string, mime: string) {
  downloadBytes(filename, new Blob([text], { type: mime }), mime)
}

export function readFileBytes(file: File | Blob): Promise<Uint8Array> {
  return file.arrayBuffer().then((b) => new Uint8Array(b))
}
