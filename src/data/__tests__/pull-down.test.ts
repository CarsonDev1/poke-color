import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pullDown } from '@/data/drain'
import { listPuzzles, resetDatabaseForTests, savePuzzle } from '@/data/local-cache'
import { pullPuzzle, type RemotePuzzle } from '@/data/puzzle-repo'
import { setSupabaseForTests } from '@/data/supabase'
import type { PipelineParams, Rgb } from '@/core/types'

const OWNER = '00000000-0000-0000-0000-000000000001'

function remote(id: string, over: Partial<RemotePuzzle> = {}): RemotePuzzle {
  return {
    id,
    title: 'Tranh ' + id,
    width: 20,
    height: 10,
    colorCount: 4,
    regionCount: 16,
    palette: [[1, 2, 3]] as Rgb[],
    params: { k: 4, minArea: 7 } as unknown as PipelineParams,
    createdAt: 1000,
    ...over,
  }
}

/** client giả: Storage tải được, bảng progress rỗng */
function fakeClient(opts: { downloadFails?: boolean; onDownload?: (p: string) => void } = {}) {
  const download = vi.fn((path: string) => {
    opts.onDownload?.(path)
    if (opts.downloadFails) return Promise.resolve({ data: null, error: { message: 'x' } })
    return Promise.resolve({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null })
  })
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) builder[m] = () => builder
  builder.maybeSingle = () => Promise.resolve({ data: null, error: null })
  builder.upsert = () => Promise.resolve({ error: null })
  return {
    download,
    client: {
      from: () => builder,
      storage: { from: () => ({ download }) },
    } as never,
  }
}

async function seedLocal(id: string): Promise<void> {
  await savePuzzle(
    {
      id,
      title: 'local ' + id,
      createdAt: 1,
      width: 20,
      height: 10,
      colorCount: 4,
      regionCount: 16,
      palette: [[9, 9, 9]] as Rgb[],
      params: {} as unknown as PipelineParams,
      usedMinArea: 1,
    },
    new Uint8Array([1]),
    new Uint8Array([2]),
    new Blob(['x']),
  )
}

beforeEach(async () => {
  await resetDatabaseForTests()
  setSupabaseForTests(null)
})

describe('pullPuzzle', () => {
  it('tải ĐỦ BA tệp rồi lưu vào IndexedDB', async () => {
    const paths: string[] = []
    const f = fakeClient({ onDownload: (p) => paths.push(p) })
    setSupabaseForTests(f.client)

    expect(await pullPuzzle(remote('p1'), OWNER)).toBe(true)
    expect(paths).toHaveLength(3)
    expect(paths).toContain(`${OWNER}/p1/original.webp`)
    expect(paths).toContain(`${OWNER}/p1/puzzle.bin`)
    expect(paths).toContain(`${OWNER}/p1/regions.json.gz`)

    const local = await listPuzzles()
    expect(local.map((p) => p.id)).toContain('p1')
  })

  it('lưu đúng metadata từ server, gồm palette và params', async () => {
    setSupabaseForTests(fakeClient().client)
    await pullPuzzle(remote('p1', { title: 'Gyarados', regionCount: 370 }), OWNER)

    const rec = (await listPuzzles()).find((p) => p.id === 'p1')!
    expect(rec.title).toBe('Gyarados')
    expect(rec.regionCount).toBe(370)
    expect(rec.palette).toEqual([[1, 2, 3]])
  })

  /**
   * Bất biến: KHÔNG lưu bản ghi khi còn thiếu tệp. Lưu nửa vời tạo ra một puzzle
   * trong thư viện mà mở ra là lỗi — tệ hơn hẳn việc chưa có nó, vì người dùng
   * không có cách nào tự sửa.
   */
  it('tải tệp THẤT BẠI ⇒ KHÔNG lưu gì vào thư viện', async () => {
    setSupabaseForTests(fakeClient({ downloadFails: true }).client)
    expect(await pullPuzzle(remote('p1'), OWNER)).toBe(false)
    expect(await listPuzzles()).toHaveLength(0)
  })

  it('ném ở tầng dưới ⇒ trả false, không vỡ ra ngoài', async () => {
    setSupabaseForTests({
      storage: {
        from: () => {
          throw new Error('offline')
        },
      },
      from: () => ({}),
    } as never)
    expect(await pullPuzzle(remote('p1'), OWNER)).toBe(false)
  })
})

describe('pullDown', () => {
  it('server rỗng ⇒ không kéo gì', async () => {
    setSupabaseForTests(fakeClient().client)
    expect(await pullDown(OWNER)).toEqual({ pulled: 0, merged: 0, enqueued: 0 })
  })

  /**
   * Đây là chính triệu chứng đã báo: đã bấm đồng bộ, nhưng mở browser khác thì
   * thư viện trống. Nguyên nhân là app chỉ ĐẨY LÊN, chưa bao giờ TẢI VỀ.
   */
  it('puzzle có trên server mà máy chưa có ⇒ TẢI VỀ', async () => {
    const list = [remote('p1'), remote('p2')]
    const f = fakeClient()
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq']) builder[m] = () => builder
    builder.order = () =>
      Promise.resolve({
        data: list.map((r) => ({
          id: r.id,
          title: r.title,
          width: r.width,
          height: r.height,
          color_count: r.colorCount,
          region_count: r.regionCount,
          palette: r.palette,
          params: r.params,
          created_at: '1970-01-01T00:00:01.000Z',
        })),
        error: null,
      })
    builder.maybeSingle = () => Promise.resolve({ data: null, error: null })
    builder.upsert = () => Promise.resolve({ error: null })
    setSupabaseForTests({
      from: () => builder,
      storage: { from: () => ({ download: f.download }) },
    } as never)

    const out = await pullDown(OWNER)
    expect(out.pulled).toBe(2)

    const local = await listPuzzles()
    expect(local.map((p) => p.id).sort()).toEqual(['p1', 'p2'])
  })

  it('puzzle ĐÃ CÓ ở máy ⇒ không tải lại, chỉ hợp nhất tiến độ', async () => {
    await seedLocal('p1')
    const f = fakeClient()
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq']) builder[m] = () => builder
    builder.order = () =>
      Promise.resolve({
        data: [
          {
            id: 'p1',
            title: 'x',
            width: 20,
            height: 10,
            color_count: 4,
            region_count: 16,
            palette: [],
            params: {},
            created_at: '1970-01-01T00:00:01.000Z',
          },
        ],
        error: null,
      })
    builder.maybeSingle = () => Promise.resolve({ data: null, error: null })
    builder.upsert = () => Promise.resolve({ error: null })
    setSupabaseForTests({
      from: () => builder,
      storage: { from: () => ({ download: f.download }) },
    } as never)

    const out = await pullDown(OWNER)
    expect(out.pulled).toBe(0)
    expect(out.merged).toBe(1)
    // không tải tệp nào vì puzzle đã có sẵn
    expect(f.download).not.toHaveBeenCalled()
  })

  it('mất mạng ⇒ trả 0, KHÔNG ném (app vẫn chạy với dữ liệu cục bộ)', async () => {
    setSupabaseForTests({
      from: () => {
        throw new Error('offline')
      },
    } as never)
    await expect(pullDown(OWNER)).resolves.toEqual({ pulled: 0, merged: 0, enqueued: 0 })
  })
})
