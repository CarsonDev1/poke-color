import { Bitset } from '@/core/codec/bitset'
import type { RegionMeta } from '@/core/types'

export type PaintStatus = 'filled' | 'rejected' | 'already'

export interface PaintResult {
  status: PaintStatus
  /** chỉ có khi status = 'rejected': colorIndex đúng của vùng đó */
  expected?: number
}

/**
 * Trạng thái tô một puzzle.
 *
 * Vì đã chặn tô sai (spec D2), mỗi vùng chỉ có hai trạng thái nên 1 bit là đủ
 * và không cần lưu "vùng này bị tô màu gì" — nó luôn là màu đúng.
 * Kéo theo: không cần Undo, và đồng bộ đa thiết bị hợp nhất được bằng OR.
 */
export class PaintEngine {
  private readonly regions: RegionMeta[]
  private readonly colorOf: Uint32Array
  private readonly bits: Bitset

  constructor(regions: RegionMeta[], filled?: Uint8Array) {
    this.regions = regions
    this.colorOf = new Uint32Array(regions.length)
    for (const r of regions) this.colorOf[r.id] = r.colorIndex

    // Bitset(0) không hợp lệ về mặt chỉ số nhưng vẫn dùng được cho puzzle rỗng
    this.bits = filled
      ? Bitset.fromBytes(filled, regions.length)
      : new Bitset(regions.length)
  }

  private assertId(regionId: number): void {
    if (!Number.isInteger(regionId) || regionId < 0 || regionId >= this.regions.length) {
      throw new Error(
        `Id vùng ${regionId} ngoài phạm vi 0..${this.regions.length - 1}`,
      )
    }
  }

  get regionCount(): number {
    return this.regions.length
  }

  get filledCount(): number {
    return this.bits.countOnes()
  }

  get progress(): number {
    if (this.regions.length === 0) return 1
    return this.filledCount / this.regions.length
  }

  isComplete(): boolean {
    return this.filledCount === this.regions.length
  }

  isFilled(regionId: number): boolean {
    this.assertId(regionId)
    return this.bits.get(regionId)
  }

  /**
   * Thử tô. Sai màu thì KHÔNG đổi state — hình đang hiện ra luôn đúng.
   * Kiểm tra "đã tô" TRƯỚC khi kiểm tra màu: bấm lại vùng đã xong bằng màu
   * khác là vô hại, không phải lỗi, nên không nên nháy đỏ.
   */
  tryPaint(regionId: number, colorIndex: number): PaintResult {
    this.assertId(regionId)
    if (this.bits.get(regionId)) return { status: 'already' }

    const expected = this.colorOf[regionId]
    if (expected !== colorIndex) return { status: 'rejected', expected }

    this.bits.set(regionId, true)
    return { status: 'filled' }
  }

  /** số vùng CHƯA tô của từng màu; độ dài = colorCount */
  remainingByColor(colorCount: number): Uint32Array {
    const out = new Uint32Array(colorCount)
    for (const r of this.regions) {
      if (!this.bits.get(r.id)) out[r.colorIndex]++
    }
    return out
  }

  isColorComplete(colorIndex: number, colorCount: number): boolean {
    return this.remainingByColor(colorCount)[colorIndex] === 0
  }

  reset(): void {
    this.bits.clear()
  }

  toBitset(): Uint8Array {
    return this.bits.toBytes()
  }
}
