import { newUuid } from '@/data/local-cache'
import { storagePaths } from '@/data/puzzle-repo'
import { getSupabase } from '@/data/supabase'

/** Metadata puzzle được chia sẻ — CỐ TÌNH không có `original_path` (D7/§11). */
export interface SharedPuzzleMeta {
  id: string
  ownerId: string
  title: string
  width: number
  height: number
  colorCount: number
  regionCount: number
  puzzlePath: string
  regionsPath: string
}

export type ShareResult = { ok: true; token: string } | { ok: false; message: string }

/**
 * Bật chia sẻ: sinh token rồi ghi vào hàng puzzle.
 *
 * Token sinh ở CLIENT chứ không để Postgres tự sinh, vì `update` cần biết giá
 * trị để trả về ngay cho UI dựng link — nếu để server sinh thì phải thêm một
 * lượt đọc lại.
 */
export async function enableShare(puzzleId: string): Promise<ShareResult> {
  const token = newUuid()
  try {
    const supabase = await getSupabase()
    const { error } = await supabase
      .from('puzzles')
      .update({ share_token: token, shared_at: new Date().toISOString() })
      .eq('id', puzzleId)
    if (error) return { ok: false, message: `Không bật được chia sẻ: ${error.message}` }
    return { ok: true, token }
  } catch {
    return { ok: false, message: 'Cần đăng nhập và có mạng để chia sẻ.' }
  }
}

export async function disableShare(puzzleId: string): Promise<boolean> {
  try {
    const supabase = await getSupabase()
    const { error } = await supabase
      .from('puzzles')
      .update({ share_token: null, shared_at: null })
      .eq('id', puzzleId)
    return !error
  } catch {
    return false
  }
}

/** Token hiện tại của puzzle, `null` nếu chưa chia sẻ. */
export async function getShareToken(puzzleId: string): Promise<string | null> {
  try {
    const supabase = await getSupabase()
    const { data, error } = await supabase
      .from('puzzles')
      .select('share_token')
      .eq('id', puzzleId)
      .maybeSingle()
    if (error || !data) return null
    return (data as { share_token: string | null }).share_token ?? null
  } catch {
    return null
  }
}

/**
 * Đọc puzzle được chia sẻ qua RPC `security definer`.
 *
 * Phải đi qua RPC vì policy `puzzles_owner` chỉ cho chủ sở hữu đọc hàng. RPC
 * KHÔNG trả `original_path` — đó là toàn bộ điểm của tính năng: người nhận tô để
 * KHÁM PHÁ bức tranh, thấy ảnh gốc là mất hết ý nghĩa (D7/§11).
 */
export async function getSharedPuzzle(token: string): Promise<SharedPuzzleMeta | null> {
  try {
    const supabase = await getSupabase()
    const { data, error } = await supabase.rpc('get_shared_puzzle', { token })
    if (error || !data) return null
    const rows = data as Array<Record<string, unknown>>
    if (rows.length === 0) return null
    const r = rows[0]
    return {
      id: String(r.id),
      ownerId: String(r.owner_id),
      title: String(r.title),
      width: Number(r.width),
      height: Number(r.height),
      colorCount: Number(r.color_count),
      regionCount: Number(r.region_count),
      puzzlePath: String(r.puzzle_path),
      regionsPath: String(r.regions_path),
    }
  } catch {
    return null
  }
}

/**
 * Tải hai tệp dữ liệu của puzzle chia sẻ. KHÔNG tải `original.webp` — Storage
 * policy cũng đã chặn, nhưng không yêu cầu nó ngay từ đây thì tránh được một
 * request 403 vô nghĩa trong Network tab của người tò mò.
 */
export async function downloadSharedFiles(
  meta: SharedPuzzleMeta,
): Promise<{ binGz: Uint8Array; regionsGz: Uint8Array } | null> {
  try {
    const supabase = await getSupabase()
    const bucket = supabase.storage.from('puzzles')
    const [bin, regions] = await Promise.all([
      bucket.download(meta.puzzlePath),
      bucket.download(meta.regionsPath),
    ])
    if (bin.error || regions.error || !bin.data || !regions.data) return null
    return {
      binGz: new Uint8Array(await bin.data.arrayBuffer()),
      regionsGz: new Uint8Array(await regions.data.arrayBuffer()),
    }
  } catch {
    return null
  }
}

export interface Completion {
  displayName: string
  activeSeconds: number
  completedAt: number
}

/**
 * Bảng hoàn thành của một puzzle mình chia sẻ (§12).
 *
 * Chỉ có người ĐÃ ĐĂNG NHẬP và ĐÃ HOÀN THÀNH — policy `progress_read_shared`
 * lọc `completed_at is not null`. Sắp theo thời gian TĂNG dần: nhanh nhất trước.
 */
export async function listCompletions(puzzleId: string): Promise<Completion[]> {
  try {
    const supabase = await getSupabase()
    const { data, error } = await supabase
      .from('progress')
      .select('user_id,active_seconds,completed_at,profiles(display_name)')
      .eq('puzzle_id', puzzleId)
      .not('completed_at', 'is', null)
    if (error || !data) return []

    return (data as Array<Record<string, unknown>>)
      .map((r) => {
        const prof = r.profiles as { display_name?: string } | null
        return {
          displayName: prof?.display_name ?? 'Người chơi ẩn danh',
          activeSeconds: Number(r.active_seconds) || 0,
          completedAt: Date.parse(String(r.completed_at)) || 0,
        }
      })
      .sort((a, b) => a.activeSeconds - b.activeSeconds)
  } catch {
    return []
  }
}

/** Đường dẫn dự kiến của các tệp — dùng khi cần kiểm tra layout, xem puzzle-repo */
export { storagePaths }
