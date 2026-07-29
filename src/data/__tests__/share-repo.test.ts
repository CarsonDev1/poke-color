import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  disableShare,
  enableShare,
  getSharedPuzzle,
  getShareToken,
  listCompletions,
} from '@/data/share-repo'
import { setSupabaseForTests } from '@/data/supabase'

function fakeClient(opts: {
  updateError?: unknown
  selectResult?: { data: unknown; error: unknown }
  rpcResult?: { data: unknown; error: unknown }
  onUpdate?: (patch: Record<string, unknown>) => void
} = {}) {
  const update = vi.fn((patch: Record<string, unknown>) => {
    opts.onUpdate?.(patch)
    return { eq: vi.fn(() => Promise.resolve({ error: opts.updateError ?? null })) }
  })
  const builder: Record<string, unknown> = {
    update,
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    not: vi.fn(() => Promise.resolve(opts.selectResult ?? { data: [], error: null })),
    maybeSingle: vi.fn(() => Promise.resolve(opts.selectResult ?? { data: null, error: null })),
  }
  return {
    update,
    client: {
      from: vi.fn(() => builder),
      rpc: vi.fn(() => Promise.resolve(opts.rpcResult ?? { data: [], error: null })),
    } as never,
  }
}

beforeEach(() => setSupabaseForTests(null))

describe('enableShare', () => {
  it('sinh token UUID và ghi vào hàng puzzle', async () => {
    let patch: Record<string, unknown> | null = null
    setSupabaseForTests(fakeClient({ onUpdate: (p) => (patch = p) }).client)

    const r = await enableShare('p1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
      expect(patch!.share_token).toBe(r.token)
    }
  })

  it('ghi cả shared_at', async () => {
    let patch: Record<string, unknown> | null = null
    setSupabaseForTests(fakeClient({ onUpdate: (p) => (patch = p) }).client)
    await enableShare('p1')
    expect(typeof patch!.shared_at).toBe('string')
  })

  it('mỗi lần bật sinh token KHÁC nhau — bật lại phải làm link cũ chết', async () => {
    const tokens = new Set<string>()
    setSupabaseForTests(fakeClient().client)
    for (let i = 0; i < 5; i++) {
      const r = await enableShare('p1')
      if (r.ok) tokens.add(r.token)
    }
    expect(tokens.size).toBe(5)
  })

  it('lỗi ⇒ message tiếng Việt, không ném', async () => {
    setSupabaseForTests(fakeClient({ updateError: { message: 'rls' } }).client)
    const r = await enableShare('p1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/[À-ỹ]/)
  })

  it('chưa cấu hình Supabase ⇒ nhắc đăng nhập, không vỡ', async () => {
    setSupabaseForTests({
      from: () => {
        throw new Error('no config')
      },
    } as never)
    const r = await enableShare('p1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/đăng nhập/)
  })
})

describe('disableShare', () => {
  it('đặt share_token về null ⇒ link chết', async () => {
    let patch: Record<string, unknown> | null = null
    setSupabaseForTests(fakeClient({ onUpdate: (p) => (patch = p) }).client)
    expect(await disableShare('p1')).toBe(true)
    expect(patch!.share_token).toBeNull()
    expect(patch!.shared_at).toBeNull()
  })

  it('lỗi ⇒ false, không ném', async () => {
    setSupabaseForTests(fakeClient({ updateError: { message: 'x' } }).client)
    expect(await disableShare('p1')).toBe(false)
  })
})

describe('getShareToken', () => {
  it('trả token khi đang chia sẻ', async () => {
    setSupabaseForTests(
      fakeClient({ selectResult: { data: { share_token: 'tok-1' }, error: null } }).client,
    )
    expect(await getShareToken('p1')).toBe('tok-1')
  })

  it('chưa chia sẻ ⇒ null', async () => {
    setSupabaseForTests(
      fakeClient({ selectResult: { data: { share_token: null }, error: null } }).client,
    )
    expect(await getShareToken('p1')).toBeNull()
  })

  it('lỗi ⇒ null', async () => {
    setSupabaseForTests(fakeClient({ selectResult: { data: null, error: { message: 'x' } } }).client)
    expect(await getShareToken('p1')).toBeNull()
  })
})

describe('getSharedPuzzle', () => {
  const row = {
    id: 'p9',
    owner_id: 'o1',
    title: 'Bí ẩn',
    width: 100,
    height: 80,
    color_count: 12,
    region_count: 300,
    puzzle_path: 'o1/p9/puzzle.bin',
    regions_path: 'o1/p9/regions.json.gz',
  }

  it('map hàng RPC sang camelCase', async () => {
    setSupabaseForTests(fakeClient({ rpcResult: { data: [row], error: null } }).client)
    const m = await getSharedPuzzle('tok')
    expect(m).toEqual({
      id: 'p9',
      ownerId: 'o1',
      title: 'Bí ẩn',
      width: 100,
      height: 80,
      colorCount: 12,
      regionCount: 300,
      puzzlePath: 'o1/p9/puzzle.bin',
      regionsPath: 'o1/p9/regions.json.gz',
    })
  })

  /**
   * Toàn bộ ý nghĩa của tính năng: người nhận tô để KHÁM PHÁ bức tranh. Nếu
   * `original_path` lọt ra thì họ mở được ảnh gốc và không còn gì để khám phá.
   */
  it('KHÔNG có bất kỳ trường nào trỏ tới ảnh gốc', async () => {
    setSupabaseForTests(fakeClient({ rpcResult: { data: [row], error: null } }).client)
    const m = await getSharedPuzzle('tok')
    const json = JSON.stringify(m)
    expect(json).not.toContain('original')
    expect(Object.keys(m!)).not.toContain('originalPath')
  })

  it('token không tồn tại ⇒ null', async () => {
    setSupabaseForTests(fakeClient({ rpcResult: { data: [], error: null } }).client)
    expect(await getSharedPuzzle('sai')).toBeNull()
  })

  it('lỗi RPC ⇒ null, không ném', async () => {
    setSupabaseForTests(fakeClient({ rpcResult: { data: null, error: { message: 'x' } } }).client)
    expect(await getSharedPuzzle('tok')).toBeNull()
  })
})

describe('listCompletions', () => {
  it('sắp theo thời gian TĂNG dần — nhanh nhất trước', async () => {
    setSupabaseForTests(
      fakeClient({
        selectResult: {
          data: [
            { user_id: 'a', active_seconds: 300, completed_at: '2026-01-02T00:00:00Z', profiles: { display_name: 'Chậm' } },
            { user_id: 'b', active_seconds: 100, completed_at: '2026-01-03T00:00:00Z', profiles: { display_name: 'Nhanh' } },
          ],
          error: null,
        },
      }).client,
    )
    const list = await listCompletions('p1')
    expect(list.map((c) => c.displayName)).toEqual(['Nhanh', 'Chậm'])
  })

  it('thiếu profile ⇒ tên mặc định, không phải undefined', async () => {
    setSupabaseForTests(
      fakeClient({
        selectResult: {
          data: [{ user_id: 'a', active_seconds: 10, completed_at: '2026-01-02T00:00:00Z', profiles: null }],
          error: null,
        },
      }).client,
    )
    const list = await listCompletions('p1')
    expect(list[0].displayName).toBe('Người chơi ẩn danh')
  })

  it('lỗi ⇒ mảng rỗng, không ném', async () => {
    setSupabaseForTests({
      from: () => {
        throw new Error('x')
      },
    } as never)
    expect(await listCompletions('p1')).toEqual([])
  })
})
