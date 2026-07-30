import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitset } from '@/core/codec/bitset'
import {
  countOutbox,
  enqueueOutbox,
  loadProgress,
  resetDatabaseForTests,
  saveProgress,
  type ProgressRecord,
} from '@/data/local-cache'
import { fromPgBytea, toPgBytea } from '@/data/pg-bytea'
import { pullProgress, pushProgress, syncProgress } from '@/data/progress-repo'
import { setSupabaseForTests } from '@/data/supabase'

const REGIONS = 24
const USER = 'u1'

function bits(list: number[]): Uint8Array {
  const b = new Bitset(REGIONS)
  for (const i of list) b.set(i, true)
  return b.toBytes()
}

function rec(list: number[], over: Partial<ProgressRecord> = {}): ProgressRecord {
  const filled = bits(list)
  return {
    puzzleId: 'p1',
    filled,
    filledCount: list.length,
    activeSeconds: 0,
    completedAt: null,
    updatedAt: 0,
    ...over,
  }
}

/** Hàng như Postgres trả về: filled là chuỗi hex, thời gian là ISO. */
function row(list: number[], over: Record<string, unknown> = {}) {
  return {
    puzzle_id: 'p1',
    user_id: USER,
    filled: toPgBytea(bits(list)),
    filled_count: list.length,
    active_seconds: 0,
    completed_at: null,
    updated_at: '1970-01-01T00:00:00.000Z',
    ...over,
  }
}

/** Client giả dựng đúng chuỗi gọi .from().select().eq().eq().maybeSingle() */
function fakeClient(opts: {
  selectResult?: { data: unknown; error: unknown }
  upsertError?: unknown
  onUpsert?: (row: Record<string, unknown>) => void
}) {
  // hai tham số: repo gọi upsert(row, { onConflict }) và test đọc calls[0][1]
  const upsert = vi.fn((r: Record<string, unknown>, _opts?: Record<string, unknown>) => {
    opts.onUpsert?.(r)
    return Promise.resolve({ error: opts.upsertError ?? null })
  })
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() =>
      Promise.resolve(opts.selectResult ?? { data: null, error: null }),
    ),
    upsert,
  }
  return { client: { from: vi.fn(() => builder) } as never, upsert }
}

beforeEach(async () => {
  await resetDatabaseForTests()
  setSupabaseForTests(null)
})

describe('pullProgress', () => {
  it('đọc hàng và chuyển hex → bitset, ISO → epoch ms', async () => {
    const f = fakeClient({
      selectResult: {
        data: row([1, 5], { active_seconds: 42, completed_at: '2026-01-02T03:04:05.000Z' }),
        error: null,
      },
    })
    setSupabaseForTests(f.client)

    const got = await pullProgress('p1', USER, REGIONS)
    expect(got).not.toBeNull()
    const bs = Bitset.fromBytes(got!.filled, REGIONS)
    expect(bs.get(1)).toBe(true)
    expect(bs.get(5)).toBe(true)
    expect(bs.get(2)).toBe(false)
    expect(got!.activeSeconds).toBe(42)
    expect(got!.completedAt).toBe(Date.parse('2026-01-02T03:04:05.000Z'))
  })

  it('chưa có hàng ⇒ null', async () => {
    setSupabaseForTests(fakeClient({}).client)
    expect(await pullProgress('p1', USER, REGIONS)).toBeNull()
  })

  it('lỗi mạng ⇒ null, KHÔNG ném (app phải chơi tiếp offline)', async () => {
    setSupabaseForTests(fakeClient({ selectResult: { data: null, error: { message: 'x' } } }).client)
    expect(await pullProgress('p1', USER, REGIONS)).toBeNull()
  })

  /**
   * Puzzle có thể đã bị sửa vùng nên regionCount đổi. Bitset.fromBytes NÉM khi
   * buffer ngắn hơn cần, và một lần ném ở đây sẽ làm cả màn chơi không mở được.
   */
  it('buffer server ngắn hơn regionCount ⇒ không ném, đệm cho đủ', async () => {
    const f = fakeClient({
      selectResult: { data: row([], { filled: '\\x01' }), error: null },
    })
    setSupabaseForTests(f.client)
    const got = await pullProgress('p1', USER, REGIONS)
    expect(got).not.toBeNull()
    expect(() => Bitset.fromBytes(got!.filled, REGIONS)).not.toThrow()
  })
})

describe('pushProgress', () => {
  it('gửi filled dạng CHUỖI HEX, không phải Uint8Array', async () => {
    let sent: Record<string, unknown> | null = null
    const f = fakeClient({ onUpsert: (r) => (sent = r) })
    setSupabaseForTests(f.client)

    await pushProgress(rec([1, 5]), USER)

    expect(typeof sent!.filled).toBe('string')
    expect(sent!.filled as string).toMatch(/^\\x[0-9a-f]*$/)
    // và giải mã lại đúng
    expect(Array.from(fromPgBytea(sent!.filled as string))).toEqual(Array.from(bits([1, 5])))
  })

  it('dùng upsert với onConflict puzzle_id,user_id — insert sẽ lỗi trùng khoá lần 2', async () => {
    const f = fakeClient({})
    setSupabaseForTests(f.client)
    await pushProgress(rec([1]), USER)
    expect(f.upsert).toHaveBeenCalled()
    expect(f.upsert.mock.calls[0][1]).toEqual({ onConflict: 'puzzle_id,user_id' })
  })

  it('completedAt null ⇒ gửi null, không gửi "1970-..."', async () => {
    let sent: Record<string, unknown> | null = null
    setSupabaseForTests(fakeClient({ onUpsert: (r) => (sent = r) }).client)
    await pushProgress(rec([1], { completedAt: null }), USER)
    expect(sent!.completed_at).toBeNull()
  })

  it('completedAt số ⇒ gửi ISO', async () => {
    let sent: Record<string, unknown> | null = null
    setSupabaseForTests(fakeClient({ onUpsert: (r) => (sent = r) }).client)
    const t = Date.parse('2026-05-06T07:08:09.000Z')
    await pushProgress(rec([1], { completedAt: t }), USER)
    expect(sent!.completed_at).toBe('2026-05-06T07:08:09.000Z')
  })

  it('lỗi ⇒ trả false, không ném', async () => {
    setSupabaseForTests(fakeClient({ upsertError: { message: 'rls' } }).client)
    expect(await pushProgress(rec([1]), USER)).toBe(false)
  })
})

describe('syncProgress', () => {
  it('hợp nhất local và server bằng OR rồi ghi CẢ HAI phía', async () => {
    await saveProgress(rec([1, 2], { activeSeconds: 30 }))
    let sent: Record<string, unknown> | null = null
    setSupabaseForTests(
      fakeClient({
        selectResult: { data: row([3], { active_seconds: 90 }), error: null },
        onUpsert: (r) => (sent = r),
      }).client,
    )

    const { merged } = await syncProgress('p1', USER, REGIONS)

    // kết quả trả về
    expect(merged!.filledCount).toBe(3)
    expect(merged!.activeSeconds).toBe(90)

    // đã ghi vào IndexedDB
    const localAfter = await loadProgress('p1')
    expect(localAfter!.filledCount).toBe(3)

    // và đã đẩy lên
    expect(fromPgBytea(sent!.filled as string)).toEqual(merged!.filled)
  })

  it('đẩy thành công ⇒ xoá mục outbox', async () => {
    await saveProgress(rec([1]))
    await enqueueOutbox('progress', 'p1')
    setSupabaseForTests(fakeClient({}).client)

    await syncProgress('p1', USER, REGIONS)
    expect(await countOutbox()).toBe(0)
  })

  /**
   * Bất biến quan trọng nhất của offline: đẩy thất bại thì việc chờ phải CÒN,
   * và bản hợp nhất vẫn phải nằm trong IndexedDB. Xoá outbox khi thất bại là
   * mất tiến độ vĩnh viễn.
   */
  it('đẩy THẤT BẠI ⇒ outbox CÒN nguyên, nhưng local vẫn có bản hợp nhất', async () => {
    await saveProgress(rec([1]))
    await enqueueOutbox('progress', 'p1')
    setSupabaseForTests(
      fakeClient({
        selectResult: { data: row([2]), error: null },
        upsertError: { message: 'offline' },
      }).client,
    )

    await syncProgress('p1', USER, REGIONS)

    expect(await countOutbox()).toBe(1)
    const localAfter = await loadProgress('p1')
    expect(localAfter!.filledCount).toBe(2) // đã hợp nhất bit 1 và 2
  })

  it('chỉ có local ⇒ đẩy lên, không mất gì', async () => {
    await saveProgress(rec([1, 2, 3]))
    let sent: Record<string, unknown> | null = null
    setSupabaseForTests(fakeClient({ onUpsert: (r) => (sent = r) }).client)

    const { merged } = await syncProgress('p1', USER, REGIONS)
    expect(merged!.filledCount).toBe(3)
    expect(sent).not.toBeNull()
  })

  it('chỉ có server ⇒ ghi xuống local', async () => {
    setSupabaseForTests(
      fakeClient({ selectResult: { data: row([4, 5]), error: null } }).client,
    )
    const { merged } = await syncProgress('p1', USER, REGIONS)
    expect(merged!.filledCount).toBe(2)
    expect((await loadProgress('p1'))!.filledCount).toBe(2)
  })

  it('không có gì cả ⇒ null, không tạo bản ghi rỗng', async () => {
    setSupabaseForTests(fakeClient({}).client)
    const out = await syncProgress('p1', USER, REGIONS)
    expect(out.merged).toBeNull()
    // việc rỗng: không có tiến độ nào để đẩy, nên mục outbox bị xoá thay vì kẹt
    expect(out.nothingToPush).toBe(true)
    expect(await loadProgress('p1')).toBeUndefined()
  })

  it('chạy hai lần liên tiếp cho cùng kết quả (luỹ đẳng)', async () => {
    await saveProgress(rec([1, 2]))
    setSupabaseForTests(
      fakeClient({ selectResult: { data: row([3]), error: null } }).client,
    )
    const { merged: first } = await syncProgress('p1', USER, REGIONS)
    const { merged: second } = await syncProgress('p1', USER, REGIONS)
    expect(second!.filledCount).toBe(first!.filledCount)
    expect(Array.from(second!.filled)).toEqual(Array.from(first!.filled))
  })
})
