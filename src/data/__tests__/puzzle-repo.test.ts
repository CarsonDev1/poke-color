import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { countOutbox, enqueueOutbox, resetDatabaseForTests, savePuzzle } from '@/data/local-cache'
import { listRemotePuzzles, storagePaths, uploadPuzzle } from '@/data/puzzle-repo'
import { setSupabaseForTests } from '@/data/supabase'
import type { PipelineParams, Rgb } from '@/core/types'

const OWNER = 'owner-1'
const PID = 'puzzle-1'

async function seedLocal(): Promise<void> {
  await savePuzzle(
    {
      id: PID,
      title: 'Gyarados',
      createdAt: 1000,
      width: 20,
      height: 10,
      colorCount: 4,
      regionCount: 6,
      palette: [[1, 2, 3]] as Rgb[],
      params: { k: 4 } as unknown as PipelineParams,
      usedMinArea: 3,
    },
    new Uint8Array([1, 2, 3]),
    new Uint8Array([4, 5]),
    new Blob(['x'], { type: 'image/webp' }),
  )
}

function fakeClient(opts: {
  uploadError?: unknown
  upsertError?: unknown
  onUpload?: (path: string) => void
  onUpsert?: (row: Record<string, unknown>) => void
  selectData?: unknown
} = {}) {
  const upload = vi.fn((path: string) => {
    opts.onUpload?.(path)
    return Promise.resolve({ error: opts.uploadError ?? null })
  })
  const upsert = vi.fn((r: Record<string, unknown>, _o?: Record<string, unknown>) => {
    opts.onUpsert?.(r)
    return Promise.resolve({ error: opts.upsertError ?? null })
  })
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve({ data: opts.selectData ?? [], error: null })),
    upsert,
  }
  return {
    client: {
      storage: { from: vi.fn(() => ({ upload })) },
      from: vi.fn(() => builder),
    } as never,
    upload,
    upsert,
  }
}

beforeEach(async () => {
  await resetDatabaseForTests()
  setSupabaseForTests(null)
})

describe('storagePaths', () => {
  /**
   * Policy `puzzle_files_owner` so `(storage.foldername(name))[1]` với
   * `auth.uid()`. Đổi cấu trúc thư mục là tự khoá mình ra ngoài, và không có
   * lỗi nào chỉ ra nguyên nhân — chỉ là "permission denied".
   */
  it('thư mục cấp một PHẢI là ownerId', () => {
    const p = storagePaths(OWNER, PID)
    expect(p.original.split('/')[0]).toBe(OWNER)
    expect(p.puzzle.split('/')[0]).toBe(OWNER)
    expect(p.regions.split('/')[0]).toBe(OWNER)
  })

  it('thư mục cấp hai là puzzleId', () => {
    const p = storagePaths(OWNER, PID)
    expect(p.puzzle.split('/')[1]).toBe(PID)
  })

  it('tên tệp khớp policy chia sẻ (original.webp bị loại trừ theo tên)', () => {
    const p = storagePaths(OWNER, PID)
    expect(p.original.endsWith('/original.webp')).toBe(true)
    expect(p.puzzle.endsWith('/puzzle.bin')).toBe(true)
    expect(p.regions.endsWith('/regions.json.gz')).toBe(true)
  })
})

describe('uploadPuzzle', () => {
  it('không có dữ liệu trong máy ⇒ trả lỗi, không gọi mạng', async () => {
    const f = fakeClient()
    setSupabaseForTests(f.client)
    const r = await uploadPuzzle('khong-ton-tai', OWNER)
    expect(r.ok).toBe(false)
    expect(f.upload).not.toHaveBeenCalled()
  })

  it('đẩy đủ BA tệp rồi mới insert hàng', async () => {
    await seedLocal()
    const paths: string[] = []
    let row: Record<string, unknown> | null = null
    const f = fakeClient({ onUpload: (p) => paths.push(p), onUpsert: (r) => (row = r) })
    setSupabaseForTests(f.client)

    const r = await uploadPuzzle(PID, OWNER)
    expect(r.ok).toBe(true)
    expect(paths).toHaveLength(3)
    expect(paths).toContain(`${OWNER}/${PID}/original.webp`)
    expect(paths).toContain(`${OWNER}/${PID}/puzzle.bin`)
    expect(paths).toContain(`${OWNER}/${PID}/regions.json.gz`)
    expect(row!.owner_id).toBe(OWNER)
    expect(row!.title).toBe('Gyarados')
  })

  /**
   * Bất biến: hàng KHÔNG được tồn tại khi tệp chưa lên. Hàng trỏ tới tệp không
   * có nghĩa là mở puzzle ra màn hình trắng và không có cách tự sửa; còn tệp mồ
   * côi không hàng chỉ tốn ít dung lượng và không ai thấy.
   */
  it('tải tệp THẤT BẠI ⇒ KHÔNG insert hàng', async () => {
    await seedLocal()
    const f = fakeClient({ uploadError: { message: 'hết dung lượng' } })
    setSupabaseForTests(f.client)

    const r = await uploadPuzzle(PID, OWNER)
    expect(r.ok).toBe(false)
    expect(f.upsert).not.toHaveBeenCalled()
  })

  it('insert hàng thất bại ⇒ trả lỗi và GIỮ mục outbox để thử lại', async () => {
    await seedLocal()
    await enqueueOutbox('puzzle', PID)
    setSupabaseForTests(fakeClient({ upsertError: { message: 'rls' } }).client)

    const r = await uploadPuzzle(PID, OWNER)
    expect(r.ok).toBe(false)
    expect(await countOutbox()).toBe(1)
  })

  it('thành công ⇒ xoá mục outbox', async () => {
    await seedLocal()
    await enqueueOutbox('puzzle', PID)
    setSupabaseForTests(fakeClient().client)

    await uploadPuzzle(PID, OWNER)
    expect(await countOutbox()).toBe(0)
  })

  it('dùng upsert để đẩy lại được sau khi thất bại giữa đường', async () => {
    await seedLocal()
    const f = fakeClient()
    setSupabaseForTests(f.client)
    await uploadPuzzle(PID, OWNER)
    expect(f.upsert.mock.calls[0][1]).toEqual({ onConflict: 'id' })
  })

  it('ném ở tầng dưới ⇒ trả message tiếng Việt, không vỡ ra ngoài', async () => {
    await seedLocal()
    setSupabaseForTests({
      storage: {
        from: () => {
          throw new Error('offline')
        },
      },
      from: vi.fn(),
    } as never)

    const r = await uploadPuzzle(PID, OWNER)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/[À-ỹ]/)
  })
})

describe('listRemotePuzzles', () => {
  it('map snake_case sang camelCase và ISO sang epoch', async () => {
    setSupabaseForTests(
      fakeClient({
        selectData: [
          {
            id: 'p9',
            title: 'Lapras',
            width: 30,
            height: 20,
            color_count: 8,
            region_count: 99,
            created_at: '2026-03-04T05:06:07.000Z',
          },
        ],
      }).client,
    )

    const list = await listRemotePuzzles(OWNER)
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual({
      id: 'p9',
      title: 'Lapras',
      width: 30,
      height: 20,
      colorCount: 8,
      regionCount: 99,
      createdAt: Date.parse('2026-03-04T05:06:07.000Z'),
    })
  })

  it('lỗi mạng ⇒ mảng rỗng, KHÔNG ném (thư viện vẫn hiện puzzle trong máy)', async () => {
    setSupabaseForTests({
      from: () => {
        throw new Error('offline')
      },
    } as never)
    expect(await listRemotePuzzles(OWNER)).toEqual([])
  })
})
