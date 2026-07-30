import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { drainOutbox, pullDown } from '@/data/drain'
import {
  deletePuzzle,
  enqueueOutbox,
  listOutbox,
  listPuzzles,
  resetDatabaseForTests,
  savePuzzle,
} from '@/data/local-cache'
import { deleteRemotePuzzle } from '@/data/puzzle-repo'
import { setSupabaseForTests } from '@/data/supabase'
import type { PipelineParams, Rgb } from '@/core/types'

const OWNER = '00000000-0000-0000-0000-000000000001'

async function seedLocal(id: string): Promise<void> {
  await savePuzzle(
    {
      id,
      title: id,
      createdAt: 1,
      width: 20,
      height: 10,
      colorCount: 4,
      regionCount: 16,
      palette: [[1, 2, 3]] as Rgb[],
      params: {} as unknown as PipelineParams,
      usedMinArea: 1,
    },
    new Uint8Array([1]),
    new Uint8Array([2]),
    new Blob(['x']),
  )
}

/** client giả: server có `remoteIds`, ghi lại mọi lệnh xoá */
function fakeClient(remoteIds: string[], opts: { deleteFails?: boolean } = {}) {
  const removed: string[][] = []
  const deletedRows: string[] = []
  const download = vi.fn(() =>
    Promise.resolve({ data: new Blob([new Uint8Array([1])]), error: null }),
  )

  const makeBuilder = () => {
    const b: Record<string, unknown> = {}
    for (const m of ['select']) b[m] = () => b
    b.order = () =>
      Promise.resolve({
        data: remoteIds.map((id) => ({
          id,
          title: id,
          width: 20,
          height: 10,
          color_count: 4,
          region_count: 16,
          palette: [],
          params: {},
          created_at: '1970-01-01T00:00:01.000Z',
        })),
        error: null,
      })
    b.eq = (_col: string, val: string) => {
      // `.delete().eq('id', x)` — nhánh xoá hàng
      if (b._deleting) {
        deletedRows.push(val)
        return Promise.resolve({ error: opts.deleteFails ? { message: 'x' } : null })
      }
      return b
    }
    b.maybeSingle = () => Promise.resolve({ data: null, error: null })
    b.upsert = () => Promise.resolve({ error: null })
    b.delete = () => {
      b._deleting = true
      return b
    }
    return b
  }

  return {
    removed,
    deletedRows,
    download,
    client: {
      from: () => makeBuilder(),
      storage: {
        from: () => ({
          download,
          remove: (paths: string[]) => {
            removed.push(paths)
            return Promise.resolve({ error: null })
          },
        }),
      },
    } as never,
  }
}

beforeEach(async () => {
  await resetDatabaseForTests()
  setSupabaseForTests(null)
})

describe('deleteRemotePuzzle', () => {
  it('xoá CẢ 3 tệp Storage rồi mới xoá hàng', async () => {
    const f = fakeClient(['p1'])
    setSupabaseForTests(f.client)

    expect(await deleteRemotePuzzle('p1', OWNER)).toBe(true)
    expect(f.removed).toHaveLength(1)
    expect(f.removed[0]).toEqual([
      `${OWNER}/p1/original.webp`,
      `${OWNER}/p1/puzzle.bin`,
      `${OWNER}/p1/regions.json.gz`,
    ])
    expect(f.deletedRows).toEqual(['p1'])
  })

  it('xoá hàng thất bại ⇒ trả false để outbox thử lại', async () => {
    setSupabaseForTests(fakeClient(['p1'], { deleteFails: true }).client)
    expect(await deleteRemotePuzzle('p1', OWNER)).toBe(false)
  })

  it('ném ở tầng dưới ⇒ false, không vỡ ra ngoài', async () => {
    setSupabaseForTests({
      storage: {
        from: () => {
          throw new Error('offline')
        },
      },
      from: () => ({}),
    } as never)
    expect(await deleteRemotePuzzle('p1', OWNER)).toBe(false)
  })
})

describe('xoá rồi đồng bộ — không được SỐNG LẠI', () => {
  /**
   * Đây chính là lỗi đã gặp: xoá cục bộ xong, lượt đồng bộ kế tiếp thấy server
   * còn puzzle đó và kéo về lại. Xác minh bằng dữ liệu thật: IndexedDB có 3 trong
   * khi UI hiện 2, rồi sau vài lần tải trang thì cả 3 quay lại.
   */
  it('lệnh xoá đẩy được lên server ⇒ puzzle KHÔNG quay lại', async () => {
    await seedLocal('p1')
    await deletePuzzle('p1')
    await enqueueOutbox('delete', 'p1')

    // server vẫn còn p1 cho tới khi drain xoá nó
    const remaining = ['p1']
    const f = fakeClient(remaining)
    setSupabaseForTests(f.client)

    await drainOutbox(OWNER)
    expect(f.deletedRows).toEqual(['p1'])

    // sau khi xoá thì server không còn p1 nữa
    remaining.length = 0
    const out = await pullDown(OWNER)
    expect(out.pulled).toBe(0)
    expect(await listPuzzles()).toHaveLength(0)
  })

  /**
   * Trường hợp khó hơn: MẤT MẠNG nên lệnh xoá chưa đẩy được. Server vẫn còn
   * puzzle, và nếu pullDown không bỏ qua id đang chờ xoá thì puzzle sẽ sống lại
   * ngay trước mắt người dùng.
   */
  it('lệnh xoá CHƯA đẩy được ⇒ pullDown vẫn KHÔNG kéo về', async () => {
    await seedLocal('p1')
    await deletePuzzle('p1')
    await enqueueOutbox('delete', 'p1')

    // server còn p1; download sẵn sàng thành công nếu bị gọi
    const f = fakeClient(['p1'])
    setSupabaseForTests(f.client)

    const out = await pullDown(OWNER)
    expect(out.pulled).toBe(0)
    expect(await listPuzzles()).toHaveLength(0)
    expect(f.download).not.toHaveBeenCalled()
  })

  it('mục "delete" còn trong outbox cho tới khi server xác nhận', async () => {
    await seedLocal('p1')
    await deletePuzzle('p1')
    await enqueueOutbox('delete', 'p1')

    setSupabaseForTests(fakeClient(['p1'], { deleteFails: true }).client)
    await drainOutbox(OWNER)

    const left = await listOutbox()
    expect(left.map((o) => o.kind)).toContain('delete')
  })

  /**
   * `deletePuzzle` xoá các mục outbox của puzzle đó để không đẩy lên một puzzle
   * đã biến mất — nhưng nó KHÔNG được xoá mục 'delete', vì đó chính là ý định xoá.
   */
  it('deletePuzzle không xoá mất mục "delete" đã đánh dấu', async () => {
    await seedLocal('p1')
    await enqueueOutbox('delete', 'p1')
    await deletePuzzle('p1')

    const left = await listOutbox()
    expect(left.map((o) => o.kind)).toContain('delete')
  })

  it('drain xử lý "delete" TRƯỚC "puzzle" — sai thứ tự là puzzle sống lại', async () => {
    await seedLocal('p2')
    await enqueueOutbox('puzzle', 'p2')
    await enqueueOutbox('delete', 'p1')

    const order: string[] = []
    const f = fakeClient(['p1', 'p2'])
    setSupabaseForTests({
      from: () => {
        const b: Record<string, unknown> = {}
        for (const m of ['select']) b[m] = () => b
        b.order = () => Promise.resolve({ data: [], error: null })
        b.eq = (_c: string, v: string) => {
          if (b._deleting) {
            order.push('delete:' + v)
            return Promise.resolve({ error: null })
          }
          return b
        }
        b.delete = () => {
          b._deleting = true
          return b
        }
        b.maybeSingle = () => Promise.resolve({ data: null, error: null })
        b.upsert = () => {
          order.push('upsert')
          return Promise.resolve({ error: null })
        }
        return b
      },
      storage: {
        from: () => ({
          download: f.download,
          remove: () => Promise.resolve({ error: null }),
          upload: () => Promise.resolve({ error: null }),
        }),
      },
    } as never)

    await drainOutbox(OWNER)
    expect(order[0]).toBe('delete:p1')
  })
})

describe('mục outbox KHÔNG BAO GIỜ đẩy được thì phải BỎ', () => {
  /**
   * Đây là lỗi "bấm đồng bộ mà nút vẫn hiện": một mục 'progress' của puzzle đã
   * không còn trong máy thì `loadPuzzleRecord` trả undefined, và bản cũ `continue`
   * mà KHÔNG dequeue — mục nằm lại vĩnh viễn, `pending` không bao giờ về 0, banner
   * luôn hiện và bấm bao nhiêu lần cũng không đổi gì.
   *
   * Bỏ mục đó là đúng, không phải mất dữ liệu: nguồn đã không còn nên không có gì
   * để đẩy lên. Việc xoá trên server là một mục 'delete' RIÊNG.
   */
  it("'progress' của puzzle không còn trong máy ⇒ BỎ, không giữ mãi", async () => {
    await enqueueOutbox('progress', 'khong-ton-tai')
    setSupabaseForTests(fakeClient([]).client)

    const out = await drainOutbox(OWNER)
    expect(out.dropped).toBe(1)
    expect(out.remaining).toBe(0)
    expect(await listOutbox()).toHaveLength(0)
  })

  it("'puzzle' của puzzle không còn trong máy ⇒ BỎ", async () => {
    await enqueueOutbox('puzzle', 'khong-ton-tai')
    setSupabaseForTests(fakeClient([]).client)

    const out = await drainOutbox(OWNER)
    expect(out.dropped).toBe(1)
    expect(await listOutbox()).toHaveLength(0)
  })

  /**
   * Ngược lại: mục 'delete' KHÔNG được bỏ khi đẩy thất bại. Mất mạng không phải
   * lý do để quên ý định xoá của người dùng.
   */
  it("'delete' đẩy thất bại thì GIỮ để thử lại, không bỏ", async () => {
    await enqueueOutbox('delete', 'p1')
    setSupabaseForTests(fakeClient(['p1'], { deleteFails: true }).client)

    const out = await drainOutbox(OWNER)
    expect(out.dropped).toBe(0)
    expect(out.remaining).toBe(1)
  })

  it('drain hai lần liên tiếp ⇒ outbox về 0 và ở đó (không kẹt)', async () => {
    await enqueueOutbox('progress', 'mat-roi')
    await enqueueOutbox('puzzle', 'mat-roi-2')
    setSupabaseForTests(fakeClient([]).client)

    await drainOutbox(OWNER)
    expect(await listOutbox()).toHaveLength(0)
    const again = await drainOutbox(OWNER)
    expect(again).toEqual({ done: 0, remaining: 0, dropped: 0 })
  })
})
