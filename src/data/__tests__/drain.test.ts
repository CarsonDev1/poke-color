import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { drainOutbox } from '@/data/drain'
import {
  countOutbox,
  enqueueOutbox,
  resetDatabaseForTests,
  saveProgress,
  savePuzzle,
} from '@/data/local-cache'
import { setSupabaseForTests } from '@/data/supabase'
import type { PipelineParams, Rgb } from '@/core/types'

const USER = 'u1'

async function seedPuzzle(id: string, regionCount = 16): Promise<void> {
  await savePuzzle(
    {
      id,
      title: id,
      createdAt: 1,
      width: 8,
      height: 4,
      colorCount: 3,
      regionCount,
      palette: [[0, 0, 0]] as Rgb[],
      params: {} as unknown as PipelineParams,
      usedMinArea: 1,
    },
    new Uint8Array([1]),
    new Uint8Array([2]),
    new Blob(['x']),
  )
}

/** Ghi lại thứ tự các bảng/bucket bị gọi để kiểm thứ tự đẩy. */
function fakeClient() {
  const order: string[] = []
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve({ data: [], error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    upsert: vi.fn(() => Promise.resolve({ error: null })),
  }
  return {
    order,
    client: {
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(() => {
            order.push('storage')
            return Promise.resolve({ error: null })
          }),
        })),
      },
      from: vi.fn((table: string) => {
        order.push(table)
        return builder
      }),
    } as never,
  }
}

beforeEach(async () => {
  await resetDatabaseForTests()
  setSupabaseForTests(null)
})

describe('drainOutbox', () => {
  it('outbox rỗng ⇒ không gọi mạng', async () => {
    const f = fakeClient()
    setSupabaseForTests(f.client)
    expect(await drainOutbox(USER)).toEqual({ done: 0, remaining: 0 })
    expect(f.order).toEqual([])
  })

  /**
   * Bất biến quan trọng nhất ở đây: `progress.puzzle_id` có KHOÁ NGOẠI tới
   * `puzzles`. Đẩy tiến độ trước khi puzzle tồn tại trên server thì Postgres
   * từ chối vì vi phạm khoá ngoại, và việc đó KHÔNG BAO GIỜ tự khỏi — mỗi lần
   * drain lại lỗi y như cũ. Chỉ lộ ra khi chạy với DB thật, nên phải khoá lại
   * bằng test.
   */
  it('đẩy PUZZLE trước PROGRESS (progress.puzzle_id có khoá ngoại)', async () => {
    await seedPuzzle('p1')
    await saveProgress({
      puzzleId: 'p1',
      filled: new Uint8Array(2),
      filledCount: 0,
      activeSeconds: 0,
      completedAt: null,
      updatedAt: 0,
    })
    // xếp progress vào TRƯỚC để chứng minh drain tự sắp lại, không ăn may
    await enqueueOutbox('progress', 'p1')
    await enqueueOutbox('puzzle', 'p1')

    const f = fakeClient()
    setSupabaseForTests(f.client)
    await drainOutbox(USER)

    const puzzleAt = f.order.indexOf('puzzles')
    const progressAt = f.order.indexOf('progress')
    expect(puzzleAt).toBeGreaterThanOrEqual(0)
    expect(progressAt).toBeGreaterThanOrEqual(0)
    expect(puzzleAt).toBeLessThan(progressAt)
  })

  it('đẩy xong thì outbox vơi và done đếm đúng', async () => {
    await seedPuzzle('p1')
    await enqueueOutbox('puzzle', 'p1')
    setSupabaseForTests(fakeClient().client)

    const out = await drainOutbox(USER)
    expect(out.done).toBe(1)
    expect(out.remaining).toBe(0)
    expect(await countOutbox()).toBe(0)
  })

  /**
   * `deletePuzzle` đã dọn outbox, nên đây là lưới an toàn. Không có nhánh này
   * thì một mục sót lại làm `drainOutbox` ném và CHẶN mọi việc còn lại phía sau.
   */
  it('puzzle đã bị xoá cục bộ nhưng outbox còn sót ⇒ bỏ qua, không ném', async () => {
    await enqueueOutbox('progress', 'da-xoa')
    setSupabaseForTests(fakeClient().client)
    await expect(drainOutbox(USER)).resolves.toBeDefined()
  })

  it('một việc lỗi KHÔNG chặn các việc còn lại', async () => {
    await seedPuzzle('p1')
    await seedPuzzle('p2')
    await enqueueOutbox('puzzle', 'p1')
    await enqueueOutbox('puzzle', 'p2')

    let call = 0
    setSupabaseForTests({
      storage: {
        from: () => ({
          upload: () => {
            call++
            // lần đầu ném, lần sau bình thường
            if (call === 1) throw new Error('mạng chập')
            return Promise.resolve({ error: null })
          },
        }),
      },
      from: () => ({
        upsert: () => Promise.resolve({ error: null }),
      }),
    } as never)

    const out = await drainOutbox(USER)
    // ít nhất một việc phải xong, chứ không phải cả hai cùng chết
    expect(out.done).toBeGreaterThanOrEqual(1)
  })
})
