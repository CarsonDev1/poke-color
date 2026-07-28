import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import {
  assemblePuzzle,
  decodePuzzleBin,
  decodeRegions,
} from '@/core/codec/puzzle-format'
import { gunzip } from '@/data/compress'
import type { PipelineParams, Puzzle, Rgb } from '@/core/types'

const DB_NAME = 'pokemon-color'
const DB_VERSION = 1

export interface PuzzleRecord {
  id: string
  title: string
  createdAt: number
  width: number
  height: number
  colorCount: number
  regionCount: number
  palette: Rgb[]
  params: PipelineParams
  usedMinArea: number
}

export interface ProgressRecord {
  puzzleId: string
  filled: Uint8Array
  filledCount: number
  activeSeconds: number
  completedAt: number | null
  updatedAt: number
}

interface BlobRecord {
  puzzleId: string
  binGz: Uint8Array
  regionsGz: Uint8Array
  original: Blob
}

/**
 * Bốn store, tách theo kích cỡ và tần suất ghi/đọc — không phải tuỳ tiện:
 *
 * - `puzzles`: metadata NHẸ (vài trăm byte/bản ghi) — đây là thứ `listPuzzles()`
 *   đọc để dựng lưới thẻ ở `/library`.
 * - `blobs`: NẶNG (bin/regions nén + ẢNH GỐC, có thể tới hàng MB mỗi puzzle).
 * - `progress`: bitset ~100 byte, bị GHI LẠI toàn bộ ở MỖI lần tô (spec §8:
 *   ghi ngay, không debounce — xem usePaint.save).
 * - `thumbnails`: đọc bởi lưới `/library` để hiện ảnh xem trước.
 *
 * Gộp các store này lại (ví dụ nhét ảnh gốc và bin vào cùng bản ghi với
 * metadata) sẽ buộc `listPuzzles()` phải kéo ẢNH GỐC của MỌI puzzle vào bộ
 * nhớ chỉ để vẽ một lưới thẻ (spec §16 cảnh báo đúng về chi phí này), và mỗi
 * lần autosave tiến độ (rất thường xuyên) sẽ phải ghi lại luôn cả những MB dữ
 * liệu không đổi đó.
 */
interface Schema extends DBSchema {
  puzzles: { key: string; value: PuzzleRecord; indexes: { createdAt: number } }
  blobs: { key: string; value: BlobRecord }
  progress: { key: string; value: ProgressRecord }
  thumbnails: { key: string; value: { puzzleId: string; blob: Blob } }
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

function db(): Promise<IDBPDatabase<Schema>> {
  dbPromise ??= openDB<Schema>(DB_NAME, DB_VERSION, {
    upgrade(d) {
      const puzzles = d.createObjectStore('puzzles', { keyPath: 'id' })
      puzzles.createIndex('createdAt', 'createdAt')
      d.createObjectStore('blobs', { keyPath: 'puzzleId' })
      d.createObjectStore('progress', { keyPath: 'puzzleId' })
      d.createObjectStore('thumbnails', { keyPath: 'puzzleId' })
    },
  })
  return dbPromise
}

/**
 * Chỉ dùng trong test — đóng và xoá database để mỗi test bắt đầu sạch.
 *
 * `deleteDatabase` bắn `blocked` khi còn MỘT kết nối khác đang mở tới cùng
 * database (chưa `close()`, hoặc `close()` rồi nhưng transaction của nó chưa
 * chạy xong). Bản cũ coi `blocked` như thành công (`resolve()` ngay) — nghĩa
 * là database KHÔNG hề bị xoá, nhưng hàm này vẫn báo "xong", nên test kế tiếp
 * âm thầm chạy trên dữ liệu CŨ của test trước và (nếu) fail thì fail ở một
 * assertion xa, không liên quan gì tới nguyên nhân thật.
 *
 * Ở đây có hai khả năng gây `blocked`, cần xử lý khác nhau:
 *   1. Kết nối cũ đang trong quá trình đóng thật sự (vd một `save()` vừa ghi
 *      xong đúng lúc, transaction chưa kịp báo hoàn tất) — đây là tạm thời,
 *      chỉ cần đợi một nhịp ngắn rồi thử xoá lại là hết.
 *   2. Kết nối bị RÒ RỈ (vd continuation của `save()` chạy sau khi component
 *      đã unmount, tự mở lại kết nối mới mà không ai đóng nó) — đây không tự
 *      hết dù đợi bao lâu, phải ném lỗi rõ ràng để suite fail đúng tại đây,
 *      thay vì chạy tiếp cho lỗi trồi lên ở một file test khác.
 *
 * Thử lại có giới hạn (5 lần, cách nhau 25ms — tổng cộng tối đa ~100ms, không
 * đáng kể so với testTimeout 5000ms) phân biệt được hai trường hợp: (1) tự
 * hết trong vài lần thử đầu; (2) vẫn `blocked` sau khi hết lượt thử ⇒ ném lỗi
 * nêu rõ nghi phạm, không lặng lẽ trả về như trước.
 */
export async function resetDatabaseForTests(): Promise<void> {
  if (dbPromise) {
    ;(await dbPromise).close()
    dbPromise = null
  }

  const MAX_ATTEMPTS = 5
  const RETRY_DELAY_MS = 25

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const blocked = await new Promise<boolean>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME)
      req.onsuccess = () => resolve(false)
      req.onerror = () =>
        reject(
          req.error ??
            new Error(`resetDatabaseForTests(): deleteDatabase("${DB_NAME}") thất bại không rõ lý do`),
        )
      req.onblocked = () => resolve(true)
    })
    if (!blocked) return

    if (attempt === MAX_ATTEMPTS) {
      throw new Error(
        `resetDatabaseForTests(): xoá database "${DB_NAME}" vẫn bị "blocked" sau ${MAX_ATTEMPTS} lần thử ` +
          `(cách nhau ${RETRY_DELAY_MS}ms) — vẫn còn một kết nối khác đang mở tới database này. Nhiều khả năng ` +
          `là kết nối rò rỉ từ test trước (vd một continuation của usePaint.save() chạy sau khi component đã ` +
          `unmount và tự mở lại kết nối mới) chứ không phải một kết nối đang đóng bình thường — nếu chỉ là đang ` +
          `đóng, ${MAX_ATTEMPTS} lần thử đã đủ thời gian.`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
  }
}

/**
 * `crypto.randomUUID` chỉ tồn tại trong secure context (HTTPS hoặc
 * localhost). Quy trình chính lại là `npm run dev -- --host` rồi mở
 * `http://192.168.x.x:5173` trên tablet — KHÔNG phải secure context — nên gọi
 * thẳng `crypto.randomUUID()` ném `TypeError` và không lưu được puzzle nào.
 * `crypto.getRandomValues` không bị giới hạn secure-context nên luôn dùng
 * được để tự dựng UUID v4 khi `randomUUID` vắng mặt.
 */
function randomUuidV4FromGetRandomValues(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function newPuzzleId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return randomUuidV4FromGetRandomValues()
}

export async function savePuzzle(
  rec: PuzzleRecord,
  binGz: Uint8Array,
  regionsGz: Uint8Array,
  original: Blob,
): Promise<void> {
  const d = await db()
  const tx = d.transaction(['puzzles', 'blobs'], 'readwrite')
  await tx.objectStore('puzzles').put(rec)
  await tx.objectStore('blobs').put({ puzzleId: rec.id, binGz, regionsGz, original })
  await tx.done
}

/** mới nhất trước */
export async function listPuzzles(): Promise<PuzzleRecord[]> {
  const all = await (await db()).getAllFromIndex('puzzles', 'createdAt')
  return all.reverse()
}

export async function loadPuzzle(id: string): Promise<Puzzle> {
  const blobs = await (await db()).get('blobs', id)
  if (!blobs) throw new Error(`Không tìm thấy dữ liệu puzzle "${id}"`)

  const bin = decodePuzzleBin(await gunzip(blobs.binGz))
  const regions = decodeRegions(new TextDecoder().decode(await gunzip(blobs.regionsGz)))
  return assemblePuzzle(bin, regions)
}

export async function loadOriginal(id: string): Promise<Blob | undefined> {
  return (await (await db()).get('blobs', id))?.original
}

/** xoá sạch mọi thứ liên quan tới puzzle này */
export async function deletePuzzle(id: string): Promise<void> {
  const d = await db()
  const tx = d.transaction(['puzzles', 'blobs', 'progress', 'thumbnails'], 'readwrite')
  await tx.objectStore('puzzles').delete(id)
  await tx.objectStore('blobs').delete(id)
  await tx.objectStore('progress').delete(id)
  await tx.objectStore('thumbnails').delete(id)
  await tx.done
}

export async function saveProgress(rec: ProgressRecord): Promise<void> {
  await (await db()).put('progress', rec)
}

export async function loadProgress(puzzleId: string): Promise<ProgressRecord | undefined> {
  return (await db()).get('progress', puzzleId)
}

export async function saveThumbnail(puzzleId: string, blob: Blob): Promise<void> {
  await (await db()).put('thumbnails', { puzzleId, blob })
}

export async function loadThumbnail(puzzleId: string): Promise<Blob | undefined> {
  return (await (await db()).get('thumbnails', puzzleId))?.blob
}
