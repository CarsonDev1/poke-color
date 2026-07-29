import {
  dequeueOutbox,
  loadBlobs,
  loadPuzzleRecord,
  type PuzzleRecord,
} from '@/data/local-cache'
import { getSupabase } from '@/data/supabase'

const BUCKET = 'puzzles'

/**
 * Đường dẫn file trong Storage. Thư mục cấp một PHẢI là owner_id: policy
 * `puzzle_files_owner` so `(storage.foldername(name))[1]` với `auth.uid()`, nên
 * đổi cấu trúc này là tự vô hiệu hoá quyền truy cập.
 */
export function storagePaths(ownerId: string, puzzleId: string) {
  const dir = `${ownerId}/${puzzleId}`
  return {
    original: `${dir}/original.webp`,
    puzzle: `${dir}/puzzle.bin`,
    regions: `${dir}/regions.json.gz`,
  }
}

export type UploadResult = { ok: true } | { ok: false; message: string }

/**
 * Đẩy một puzzle lên Supabase: 3 file lên Storage RỒI MỚI insert hàng.
 *
 * Thứ tự đó có chủ đích: hàng trong `puzzles` chứa `original_path`/`puzzle_path`
 * /`regions_path`. Insert hàng trước rồi upload sau, nếu upload lỗi thì thư viện
 * có một puzzle trỏ tới file không tồn tại — mở ra là màn hình trắng, và không
 * có cách nào tự sửa. Ngược lại, file mồ côi không có hàng chỉ tốn ít dung
 * lượng và không ai thấy.
 */
export async function uploadPuzzle(puzzleId: string, ownerId: string): Promise<UploadResult> {
  const rec = await loadPuzzleRecord(puzzleId)
  const blobs = await loadBlobs(puzzleId)
  if (!rec || !blobs) {
    return { ok: false, message: 'Không tìm thấy dữ liệu puzzle trong máy.' }
  }

  const paths = storagePaths(ownerId, puzzleId)

  try {
    const supabase = await getSupabase()
    const storage = supabase.storage.from(BUCKET)

    // upsert: đẩy lại cùng một puzzle (vd sau khi đẩy thất bại giữa đường) phải
    // ghi đè được, nếu không lần thử lại nào cũng lỗi "đã tồn tại"
    const uploads = await Promise.all([
      storage.upload(paths.original, blobs.original, {
        upsert: true,
        contentType: blobs.original.type || 'image/webp',
      }),
      storage.upload(paths.puzzle, blobs.binGz, {
        upsert: true,
        contentType: 'application/gzip',
      }),
      storage.upload(paths.regions, blobs.regionsGz, {
        upsert: true,
        contentType: 'application/gzip',
      }),
    ])

    const failed = uploads.find((u) => u.error)
    if (failed) {
      return { ok: false, message: `Tải tệp lên thất bại: ${failed.error?.message ?? 'không rõ'}` }
    }

    const { error } = await supabase.from('puzzles').upsert(
      {
        id: puzzleId,
        owner_id: ownerId,
        title: rec.title,
        width: rec.width,
        height: rec.height,
        color_count: rec.colorCount,
        region_count: rec.regionCount,
        palette: rec.palette,
        params: rec.params,
        original_path: paths.original,
        puzzle_path: paths.puzzle,
        regions_path: paths.regions,
      },
      { onConflict: 'id' },
    )
    if (error) {
      return { ok: false, message: `Lưu thông tin puzzle thất bại: ${error.message}` }
    }

    await dequeueOutbox('puzzle', puzzleId)
    return { ok: true }
  } catch {
    return { ok: false, message: 'Không kết nối được tới máy chủ. Sẽ thử lại khi có mạng.' }
  }
}

/** Metadata puzzle của người dùng trên server — để trộn vào thư viện. */
export interface RemotePuzzle {
  id: string
  title: string
  width: number
  height: number
  colorCount: number
  regionCount: number
  createdAt: number
}

export async function listRemotePuzzles(ownerId: string): Promise<RemotePuzzle[]> {
  try {
    const supabase = await getSupabase()
    const { data, error } = await supabase
      .from('puzzles')
      .select('id,title,width,height,color_count,region_count,created_at')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })

    if (error || !data) return []
    return (data as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      width: Number(r.width),
      height: Number(r.height),
      colorCount: Number(r.color_count),
      regionCount: Number(r.region_count),
      createdAt: Date.parse(String(r.created_at)) || 0,
    }))
  } catch {
    return []
  }
}

export type { PuzzleRecord }
