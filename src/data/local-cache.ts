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

/** chỉ dùng trong test — đóng và xoá database để mỗi test bắt đầu sạch */
export async function resetDatabaseForTests(): Promise<void> {
  if (dbPromise) {
    ;(await dbPromise).close()
    dbPromise = null
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
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
