import type { PipelineParams, Rgb } from '@/core/types'
import {
  dequeueOutbox,
  loadBlobs,
  loadPuzzleRecord,
  savePuzzle,
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
  /** cần để dựng PuzzleRecord khi tải về — thiếu là puzzle không mở được */
  palette: Rgb[]
  params: PipelineParams
  createdAt: number
}

export async function listRemotePuzzles(ownerId: string): Promise<RemotePuzzle[]> {
  try {
    const supabase = await getSupabase()
    const { data, error } = await supabase
      .from('puzzles')
      // palette + params BẮT BUỘC có ở đây: `savePuzzle` cần chúng để dựng
      // PuzzleRecord, và không có thì puzzle tải về không mở được.
      .select('id,title,width,height,color_count,region_count,palette,params,created_at')
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
      palette: (r.palette ?? []) as Rgb[],
      params: (r.params ?? {}) as PipelineParams,
      createdAt: Date.parse(String(r.created_at)) || 0,
    }))
  } catch {
    return []
  }
}

/**
 * TẢI một puzzle từ Supabase xuống IndexedDB.
 *
 * Đây là nửa còn thiếu của việc "đồng bộ": trước đó app chỉ ĐẨY LÊN, nên mở app
 * ở browser khác hay điện thoại thì IndexedDB rỗng và không có gì đi lấy dữ liệu
 * về — thư viện trống trơn dù server có đủ.
 *
 * Tải cả BA tệp rồi mới `savePuzzle`. Lưu một bản ghi khi còn thiếu tệp sẽ tạo ra
 * một puzzle trong thư viện mà mở ra là lỗi — tệ hơn hẳn việc chưa có nó.
 */
export async function pullPuzzle(remote: RemotePuzzle, ownerId: string): Promise<boolean> {
  const paths = storagePaths(ownerId, remote.id)
  try {
    const supabase = await getSupabase()
    const storage = supabase.storage.from(BUCKET)

    const [orig, bin, regions] = await Promise.all([
      storage.download(paths.original),
      storage.download(paths.puzzle),
      storage.download(paths.regions),
    ])
    if (orig.error || bin.error || regions.error) return false
    if (!orig.data || !bin.data || !regions.data) return false

    const binGz = new Uint8Array(await bin.data.arrayBuffer())
    const regionsGz = new Uint8Array(await regions.data.arrayBuffer())

    await savePuzzle(
      {
        id: remote.id,
        title: remote.title,
        createdAt: remote.createdAt,
        width: remote.width,
        height: remote.height,
        colorCount: remote.colorCount,
        regionCount: remote.regionCount,
        palette: remote.palette,
        params: remote.params,
        // `usedMinArea` chỉ dùng để hiện lại tham số đã sinh; params đã mang nó
        usedMinArea:
          typeof (remote.params as { minArea?: unknown }).minArea === 'number'
            ? ((remote.params as { minArea: number }).minArea)
            : 1,
      },
      binGz,
      regionsGz,
      orig.data,
    )
    return true
  } catch {
    return false
  }
}

export type { PuzzleRecord }
