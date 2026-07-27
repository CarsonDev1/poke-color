/** bảng đếm bit 1 trong một byte, tính trước */
const POPCOUNT = new Uint8Array(256)
for (let i = 0; i < 256; i++) {
  POPCOUNT[i] = (i & 1) + POPCOUNT[i >> 1]
}

/**
 * Bitset cho tiến độ tô: 1 bit mỗi vùng.
 * Vì đã chặn tô sai, vùng chỉ có "chưa tô" hoặc "đã tô đúng" ⇒ 1 bit là đủ.
 * 800 vùng = 100 byte, nên đồng bộ gần như tức thì.
 */
export class Bitset {
  private bytes: Uint8Array
  private length: number
  private ones = 0

  constructor(bitLength: number) {
    this.length = bitLength
    this.bytes = new Uint8Array(Math.ceil(bitLength / 8))
  }

  get bitLength(): number {
    return this.length
  }

  private assertIndex(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= this.length) {
      throw new Error(`Chỉ số bit ${i} ngoài phạm vi 0..${this.length - 1}`)
    }
  }

  get(i: number): boolean {
    this.assertIndex(i)
    return (this.bytes[i >> 3] & (1 << (i & 7))) !== 0
  }

  set(i: number, value: boolean): void {
    this.assertIndex(i)
    const byte = i >> 3
    const bit = 1 << (i & 7)
    const had = (this.bytes[byte] & bit) !== 0
    if (value && !had) {
      this.bytes[byte] |= bit
      this.ones++
    } else if (!value && had) {
      this.bytes[byte] &= ~bit
      this.ones--
    }
  }

  countOnes(): number {
    return this.ones
  }

  /**
   * Hợp nhất tại chỗ bằng OR. Đây là phép hợp nhất đúng cho tiến độ tô giữa
   * nhiều thiết bị: cả hai bên chỉ thêm vùng đã tô, không bên nào xoá.
   */
  or(other: Bitset): void {
    if (other.length !== this.length) {
      throw new Error(
        `Không thể OR hai bitset khác độ dài: ${this.length} vs ${other.length}`,
      )
    }
    for (let i = 0; i < this.bytes.length; i++) this.bytes[i] |= other.bytes[i]
    this.recount()
  }

  clear(): void {
    this.bytes.fill(0)
    this.ones = 0
  }

  /** trả về BẢN SAO, sửa nó không ảnh hưởng bitset */
  toBytes(): Uint8Array {
    return new Uint8Array(this.bytes)
  }

  static fromBytes(bytes: Uint8Array, bitLength: number): Bitset {
    const need = Math.ceil(bitLength / 8)
    if (bytes.length < need) {
      throw new Error(
        `Buffer quá ngắn: có ${bytes.length} byte, cần ${need} cho ${bitLength} bit`,
      )
    }
    const b = new Bitset(bitLength)
    b.bytes.set(bytes.subarray(0, need))
    // xoá các bit rác ở byte cuối để countOnes không tính sai
    const extra = need * 8 - bitLength
    if (extra > 0) b.bytes[need - 1] &= 0xff >> extra
    b.recount()
    return b
  }

  private recount(): void {
    let n = 0
    for (const byte of this.bytes) n += POPCOUNT[byte]
    this.ones = n
  }
}
