import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  countOutbox,
  dequeueOutbox,
  enqueueOutbox,
  listOutbox,
  listPuzzles,
  resetDatabaseForTests,
} from '@/data/local-cache'

beforeEach(async () => {
  await resetDatabaseForTests()
})

describe('outbox', () => {
  it('rỗng lúc đầu', async () => {
    expect(await countOutbox()).toBe(0)
    expect(await listOutbox()).toEqual([])
  })

  it('enqueue rồi list thấy đúng mục', async () => {
    await enqueueOutbox('progress', 'p1')
    const items = await listOutbox()
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('progress')
    expect(items[0].puzzleId).toBe('p1')
  })

  /**
   * Đây là tính chất quan trọng nhất: tô 200 vùng sinh 200 lần enqueue nhưng
   * chỉ được để lại MỘT việc chờ. Nếu outbox là log tự tăng thì banner sẽ hiện
   * "chưa đồng bộ · 200" và drain sẽ đẩy cùng một tiến độ 200 lần.
   */
  it('enqueue cùng (kind, puzzleId) nhiều lần ⇒ vẫn chỉ MỘT mục', async () => {
    for (let i = 0; i < 200; i++) await enqueueOutbox('progress', 'p1')
    expect(await countOutbox()).toBe(1)
  })

  it('cùng puzzle nhưng KHÁC kind ⇒ hai mục riêng', async () => {
    await enqueueOutbox('progress', 'p1')
    await enqueueOutbox('puzzle', 'p1')
    expect(await countOutbox()).toBe(2)
  })

  it('khác puzzle ⇒ mục riêng', async () => {
    await enqueueOutbox('progress', 'p1')
    await enqueueOutbox('progress', 'p2')
    expect(await countOutbox()).toBe(2)
  })

  it('dequeue xoá đúng một mục, không chạm mục khác', async () => {
    await enqueueOutbox('progress', 'p1')
    await enqueueOutbox('progress', 'p2')
    await dequeueOutbox('progress', 'p1')

    const items = await listOutbox()
    expect(items).toHaveLength(1)
    expect(items[0].puzzleId).toBe('p2')
  })

  it('dequeue mục không tồn tại ⇒ không ném', async () => {
    await expect(dequeueOutbox('progress', 'khong-co')).resolves.toBeUndefined()
  })

  it('queuedAt được ghi để sau này biết việc chờ đã bao lâu', async () => {
    const before = Date.now()
    await enqueueOutbox('progress', 'p1')
    const [item] = await listOutbox()
    expect(item.queuedAt).toBeGreaterThanOrEqual(before)
  })
})

/**
 * Nâng cấp schema v1 -> v2.
 *
 * Đây là test có giá trị cao nhất trong file: người dùng hiện tại ĐANG có
 * database v1 với 4 store và cả thư viện của họ trong đó. Nếu `upgrade` tạo
 * store vô điều kiện thì `createObjectStore('puzzles')` ném ConstraintError,
 * mở database thất bại, và app mất sạch thư viện. Không test thì lỗi này chỉ
 * lộ ra trên máy người dùng thật, còn máy dev luôn sạch nên không bao giờ thấy.
 */
describe('nâng cấp v1 -> v2', () => {
  /** Dựng đúng database mà bản app cũ tạo ra: version 1, 4 store, có dữ liệu. */
  function seedV1(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('pokemon-color', 1)
      req.onupgradeneeded = () => {
        const d = req.result
        const puzzles = d.createObjectStore('puzzles', { keyPath: 'id' })
        puzzles.createIndex('createdAt', 'createdAt')
        d.createObjectStore('blobs', { keyPath: 'puzzleId' })
        d.createObjectStore('progress', { keyPath: 'puzzleId' })
        d.createObjectStore('thumbnails', { keyPath: 'puzzleId' })
      }
      req.onsuccess = () => {
        const d = req.result
        const tx = d.transaction('puzzles', 'readwrite')
        tx.objectStore('puzzles').put({
          id: 'cu-1',
          title: 'Puzzle từ bản cũ',
          createdAt: 1000,
          width: 10,
          height: 10,
          colorCount: 4,
          regionCount: 8,
          palette: [],
          params: {},
          usedMinArea: 1,
        })
        tx.oncomplete = () => {
          d.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
  }

  it('dữ liệu cũ SỐNG SÓT và store outbox mới dùng được', async () => {
    await resetDatabaseForTests()
    await seedV1()

    // lần gọi này mở ở version 2 ⇒ upgrade chạy với oldVersion = 1
    const puzzles = await listPuzzles()
    expect(puzzles.map((p) => p.id)).toContain('cu-1')
    expect(puzzles.find((p) => p.id === 'cu-1')!.title).toBe('Puzzle từ bản cũ')

    // và store mới hoạt động
    await enqueueOutbox('progress', 'cu-1')
    expect(await countOutbox()).toBe(1)
  })
})
