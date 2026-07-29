/**
 * Chuyển đổi `Uint8Array` ↔ định dạng hex của Postgres `bytea`.
 *
 * VÌ SAO CẦN: PostgREST nói JSON, và JSON không có kiểu nhị phân. Đưa thẳng một
 * `Uint8Array` vào `.insert({ filled: bytes })` thì `JSON.stringify` biến nó
 * thành OBJECT `{"0":1,"1":2,...}` — Postgres nhận một chuỗi rác, không phải
 * bytes, và lỗi không hề nói ra: cột `bytea` nhận vào thứ nó không hiểu, hoặc
 * tệ hơn là nhận một chuỗi trông như dữ liệu.
 *
 * Postgres mặc định `bytea_output = 'hex'` nên đọc ra cũng là chuỗi `\x...`.
 */

/** `Uint8Array` → `\xdeadbeef` (dạng Postgres hiểu khi ghi vào cột bytea) */
export function toPgBytea(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return `\\x${hex}`
}

/**
 * `\xdeadbeef` → `Uint8Array`.
 *
 * Chấp nhận cả chuỗi không có tiền tố `\x` vì tuỳ cấu hình/driver mà nó có thể
 * bị lược đi. Chuỗi rỗng ⇒ mảng rỗng (cột bytea rỗng là hợp lệ: puzzle chưa tô
 * vùng nào).
 */
export function fromPgBytea(value: string): Uint8Array {
  let hex = value.startsWith('\\x') ? value.slice(2) : value
  if (hex.startsWith('0x')) hex = hex.slice(2)
  if (hex.length === 0) return new Uint8Array(0)

  if (hex.length % 2 !== 0) {
    throw new Error(`Chuỗi bytea có số ký tự hex lẻ (${hex.length}): không thể tách thành byte`)
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('Chuỗi bytea chứa ký tự không phải hex')
  }

  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}
