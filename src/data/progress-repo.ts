import { dequeueOutbox, loadProgress, saveProgress, type ProgressRecord } from '@/data/local-cache'
import { fromPgBytea, toPgBytea } from '@/data/pg-bytea'
import { getSupabase } from '@/data/supabase'
import { mergeProgress } from '@/data/sync'

/** Hàng trong bảng `progress` của Postgres. */
interface ProgressRow {
  puzzle_id: string
  user_id: string
  filled: string
  filled_count: number
  active_seconds: number
  completed_at: string | null
  updated_at: string
}

/**
 * `completedAt`/`updatedAt` trong app là epoch ms, còn Postgres là `timestamptz`.
 * Không chuyển đổi thì `Math.max(a.updatedAt, b.updatedAt)` sẽ so một con số với
 * một chuỗi ISO và cho kết quả vô nghĩa.
 */
function toMs(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

function rowToRecord(row: ProgressRow, regionCount: number): ProgressRecord {
  const filled = fromPgBytea(row.filled)
  // Cắt/đệm cho khớp regionCount: puzzle có thể đã bị sửa vùng (edits) nên số
  // vùng đổi, và Bitset.fromBytes sẽ ném nếu buffer ngắn hơn cần.
  const need = Math.ceil(regionCount / 8)
  const sized = filled.length === need ? filled : new Uint8Array(need)
  if (filled.length !== need) sized.set(filled.subarray(0, Math.min(filled.length, need)))

  return {
    puzzleId: row.puzzle_id,
    filled: sized,
    filledCount: row.filled_count,
    activeSeconds: row.active_seconds,
    completedAt: toMs(row.completed_at),
    updatedAt: toMs(row.updated_at) ?? 0,
  }
}

/** Đọc tiến độ trên server. `null` = chưa có, hoặc không đọc được (offline). */
export async function pullProgress(
  puzzleId: string,
  userId: string,
  regionCount: number,
): Promise<ProgressRecord | null> {
  try {
    const supabase = await getSupabase()
    const { data, error } = await supabase
      .from('progress')
      .select('puzzle_id,user_id,filled,filled_count,active_seconds,completed_at,updated_at')
      .eq('puzzle_id', puzzleId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !data) return null
    return rowToRecord(data as ProgressRow, regionCount)
  } catch {
    return null
  }
}

/**
 * Ghi tiến độ lên server. Trả `true` nếu thành công.
 *
 * `upsert` chứ không `insert`: khoá chính là `(puzzle_id, user_id)` và lần ghi
 * thứ hai trở đi luôn là cập nhật. `insert` sẽ lỗi trùng khoá ngay lần thứ hai
 * và outbox không bao giờ vơi.
 */
export async function pushProgress(rec: ProgressRecord, userId: string): Promise<boolean> {
  try {
    const supabase = await getSupabase()
    const row = {
      puzzle_id: rec.puzzleId,
      user_id: userId,
      // hex, KHÔNG phải Uint8Array — xem data/pg-bytea
      filled: toPgBytea(rec.filled),
      filled_count: rec.filledCount,
      active_seconds: rec.activeSeconds,
      completed_at: rec.completedAt === null ? null : new Date(rec.completedAt).toISOString(),
    }
    const { error } = await supabase.from('progress').upsert(row, {
      onConflict: 'puzzle_id,user_id',
    })
    return !error
  } catch {
    return false
  }
}

export interface SyncProgressResult {
  merged: ProgressRecord | null
  /**
   * Đẩy lên server THÀNH CÔNG hay chưa.
   *
   * Bắt buộc phải trả ra ngoài: `drainOutbox` từng đếm mọi lượt gọi hàm này là
   * "đã đẩy xong" bất kể kết quả, nên khi đẩy thất bại thì mục vẫn nằm trong
   * outbox mà banner lại hiện "chưa đồng bộ · 1" như chưa từng thử — bấm mãi
   * không đổi. Thất bại thường gặp nhất là LỖI KHOÁ NGOẠI: `progress.puzzle_id`
   * trỏ tới `puzzles`, nên tiến độ của một tranh chưa được đẩy lên server sẽ bị
   * từ chối vĩnh viễn (Postgres 23503).
   */
  pushed: boolean
  /**
   * KHÔNG có gì để đẩy: máy không có bản ghi tiến độ nào cho puzzle này (và
   * server cũng không). Mục outbox này là việc rỗng nên bị xoá ngay.
   *
   * Không xoá thì nó là một mục KẸT VĨNH VIỄN nữa: hàm này thoát sớm ở đây mà
   * không dequeue, `pending` không bao giờ về 0 và banner "chưa đồng bộ" hiện
   * mãi. Xoá là an toàn — mục này chỉ có nghĩa "đẩy tiến độ cục bộ lên", mà tiến
   * độ cục bộ không tồn tại; lúc người dùng tô lại thì nó tự được xếp hàng lại.
   */
  nothingToPush: boolean
}

/**
 * Hợp nhất tiến độ local và server rồi ghi về CẢ HAI phía.
 *
 * Thứ tự có chủ đích: ghi IndexedDB TRƯỚC khi đẩy lên. Nếu mạng chết giữa đường
 * thì máy vẫn giữ bản đã hợp nhất, và mục outbox còn nguyên để lần sau thử lại.
 * Đẩy trước rồi ghi local sau thì mạng chết là mất phần hợp nhất.
 *
 * Chỉ xoá mục outbox khi đẩy THÀNH CÔNG — hoặc khi không có gì để đẩy.
 */
export async function syncProgress(
  puzzleId: string,
  userId: string,
  regionCount: number,
): Promise<SyncProgressResult> {
  const local = await loadProgress(puzzleId)
  const remote = await pullProgress(puzzleId, userId, regionCount)

  if (!local && !remote) {
    await dequeueOutbox('progress', puzzleId)
    return { merged: null, pushed: false, nothingToPush: true }
  }

  const merged =
    local && remote ? mergeProgress(local, remote, regionCount) : (local ?? remote)!

  // local trước, mạng sau
  await saveProgress(merged)

  const pushed = await pushProgress(merged, userId)
  if (pushed) {
    await dequeueOutbox('progress', puzzleId)
  }

  return { merged, pushed, nothingToPush: false }
}
