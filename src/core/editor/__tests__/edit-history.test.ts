import { describe, expect, it } from 'vitest'
import {
  activeOps,
  canRedo,
  canUndo,
  emptyHistory,
  pushOp,
  redo,
  undo,
} from '@/core/editor/edit-history'
import type { EditOp } from '@/core/editor/edit-ops'

const m = (a: number, b: number): EditOp => ({ kind: 'merge', a, b })

describe('EditHistory', () => {
  it('rỗng lúc đầu: không undo không redo được', () => {
    const h = emptyHistory()
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
    expect(activeOps(h)).toEqual([])
  })

  it('push rồi undo được, chưa redo được', () => {
    const h = pushOp(emptyHistory(), m(0, 1))
    expect(canUndo(h)).toBe(true)
    expect(canRedo(h)).toBe(false)
    expect(activeOps(h)).toHaveLength(1)
  })

  it('undo giảm số thao tác có hiệu lực nhưng GIỮ op để redo', () => {
    const h = undo(pushOp(emptyHistory(), m(0, 1)))
    expect(activeOps(h)).toHaveLength(0)
    expect(canRedo(h)).toBe(true)
    expect(h.ops).toHaveLength(1)
  })

  it('redo phục hồi lại thao tác', () => {
    const h = redo(undo(pushOp(emptyHistory(), m(0, 1))))
    expect(activeOps(h)).toHaveLength(1)
    expect(canRedo(h)).toBe(false)
  })

  it('undo quá đầu ⇒ không đổi, không âm', () => {
    const h = undo(undo(emptyHistory()))
    expect(h.cursor).toBe(0)
  })

  it('redo quá cuối ⇒ không đổi', () => {
    const h1 = pushOp(emptyHistory(), m(0, 1))
    expect(redo(redo(h1)).cursor).toBe(1)
  })

  /** Hành vi chuẩn của editor: nhánh mới thay nhánh cũ. */
  it('push sau khi undo ⇒ CẮT phần redo', () => {
    let h = pushOp(emptyHistory(), m(0, 1))
    h = pushOp(h, m(2, 3))
    h = undo(h) // bỏ m(2,3)
    h = pushOp(h, m(4, 5))

    expect(h.ops).toHaveLength(2)
    expect(h.ops[1]).toEqual(m(4, 5))
    expect(canRedo(h)).toBe(false)
  })

  it('nhiều bước undo/redo giữ đúng thứ tự', () => {
    let h = emptyHistory()
    h = pushOp(h, m(0, 1))
    h = pushOp(h, m(2, 3))
    h = pushOp(h, m(4, 5))
    h = undo(undo(h))
    expect(activeOps(h)).toEqual([m(0, 1)])
    h = redo(h)
    expect(activeOps(h)).toEqual([m(0, 1), m(2, 3)])
  })

  it('không sửa history đầu vào (bất biến)', () => {
    const h = pushOp(emptyHistory(), m(0, 1))
    const before = JSON.stringify(h)
    pushOp(h, m(2, 3))
    undo(h)
    redo(h)
    expect(JSON.stringify(h)).toBe(before)
  })

  it('activeOps trả BẢN SAO — sửa nó không ảnh hưởng history', () => {
    const h = pushOp(emptyHistory(), m(0, 1))
    activeOps(h).push(m(9, 9))
    expect(h.ops).toHaveLength(1)
  })
})
