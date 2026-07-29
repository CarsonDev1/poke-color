import type { EditOp } from '@/core/editor/edit-ops'

/**
 * Lịch sử thao tác sửa vùng, dạng danh sách + con trỏ.
 *
 * KHÔNG lưu snapshot của `regionMap` cho mỗi bước: một puzzle 2000×1500 là 12 MB
 * mỗi snapshot, hai chục bước undo là 240 MB. Lưu danh sách thao tác rồi chạy
 * lại từ gốc thì tốn ~50ms mỗi lần undo nhưng bộ nhớ gần như bằng 0 — và đó là
 * điều đảm bảo undo trở về BYTE-IDENTICAL, thay vì phải viết đúng phép nghịch
 * đảo cho từng loại thao tác (mà `mergeSmall` thì không có phép nghịch đảo).
 */
export interface EditHistory {
  /** toàn bộ thao tác đã từng thực hiện, kể cả phần đã undo */
  ops: EditOp[]
  /** số thao tác đang có hiệu lực; ops.slice(0, cursor) là trạng thái hiện tại */
  cursor: number
}

export function emptyHistory(): EditHistory {
  return { ops: [], cursor: 0 }
}

/**
 * Thêm thao tác mới. Nếu đang ở giữa lịch sử (vừa undo), phần redo bị CẮT — đúng
 * hành vi mà mọi editor đều làm: nhánh mới thay nhánh cũ.
 */
export function pushOp(h: EditHistory, op: EditOp): EditHistory {
  const ops = h.ops.slice(0, h.cursor)
  ops.push(op)
  return { ops, cursor: ops.length }
}

export function canUndo(h: EditHistory): boolean {
  return h.cursor > 0
}

export function canRedo(h: EditHistory): boolean {
  return h.cursor < h.ops.length
}

export function undo(h: EditHistory): EditHistory {
  return canUndo(h) ? { ops: h.ops, cursor: h.cursor - 1 } : h
}

export function redo(h: EditHistory): EditHistory {
  return canRedo(h) ? { ops: h.ops, cursor: h.cursor + 1 } : h
}

/** thao tác đang có hiệu lực — truyền vào `applyOps` */
export function activeOps(h: EditHistory): EditOp[] {
  return h.ops.slice(0, h.cursor)
}
