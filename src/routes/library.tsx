import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  deletePuzzle,
  listPuzzles,
  loadProgress,
  loadThumbnail,
  type PuzzleRecord,
} from '@/data/local-cache'

interface Card {
  rec: PuzzleRecord
  percent: number
  thumbUrl: string | null
}

export default function LibraryRoute() {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [askDelete, setAskDelete] = useState<string | null>(null)
  // Lô object URL thumbnail đang HIỂN THỊ hiện tại — dùng ref (không phải
  // state) vì cả effect cleanup lẫn remove() đều cần đọc/ghi nó, và ghi vào
  // đây không được kéo theo re-render.
  const madeRef = useRef<string[]>([])

  const reload = async (): Promise<Card[]> => {
    const recs = await listPuzzles()
    return Promise.all(
      recs.map(async (rec) => {
        // chỉ đọc metadata + tiến độ + thumbnail; KHÔNG tải puzzle.bin
        const [prog, thumb] = await Promise.all([loadProgress(rec.id), loadThumbnail(rec.id)])
        return {
          rec,
          percent: rec.regionCount ? Math.round(((prog?.filledCount ?? 0) / rec.regionCount) * 100) : 0,
          thumbUrl: thumb ? URL.createObjectURL(thumb) : null,
        }
      }),
    )
  }

  useEffect(() => {
    let alive = true
    void reload().then((c) => {
      if (!alive) return
      madeRef.current = c.map((x) => x.thumbUrl).filter((u): u is string => u !== null)
      setCards(c)
    })
    return () => {
      alive = false
      for (const u of madeRef.current) URL.revokeObjectURL(u)
      madeRef.current = []
    }
  }, [])

  const remove = async (id: string): Promise<void> => {
    await deletePuzzle(id)
    setAskDelete(null)
    const next = await reload()
    // Bẫy rò rỉ: `reload()` ở trên vừa tạo một lô URL thumbnail MỚI cho các
    // card còn lại. Nếu lắp `next` vào state mà không thu hồi lô CŨ
    // (`madeRef.current`) trước, mọi object URL của lần render trước — kể cả
    // của những card KHÔNG bị xoá — sẽ không bao giờ được giải phóng cho tới
    // khi cả màn unmount (gần như không xảy ra). Mỗi lần xoá sẽ rò rỉ thêm
    // một lô URL như vậy.
    for (const u of madeRef.current) URL.revokeObjectURL(u)
    madeRef.current = next.map((x) => x.thumbUrl).filter((u): u is string => u !== null)
    setCards(next)
  }

  if (!cards) return <main style={{ padding: 24 }}>Đang tải…</main>

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Thư viện tranh</h1>
        {/*
          Chỉ hiện link "Tạo tranh mới" ở header khi danh sách KHÔNG rỗng.
          Khi rỗng, khối trạng thái rỗng bên dưới đã có link cùng tên rồi —
          hiện cả hai cùng lúc tạo ra hai link trùng tên "Tạo tranh mới" trên
          cùng một trang, khiến truy vấn theo role+tên (getByRole('link', {
          name }) hay bất kỳ công cụ hỗ trợ nào dựa vào tên accessible) không
          còn phân biệt được, và không thêm giá trị gì cho người dùng.
        */}
        {cards.length > 0 && <Link to="/new">Tạo tranh mới</Link>}
      </header>

      {cards.length === 0 ? (
        <div style={{ padding: '3rem 0', textAlign: 'center', color: '#475569' }}>
          <p>Chưa có tranh nào.</p>
          <Link to="/new">Tạo tranh mới</Link>
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          {cards.map(({ rec, percent, thumbUrl }) => (
            <li key={rec.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', background: '#f1f5f9' }}>
                {thumbUrl ? (
                  <img src={thumbUrl} alt={rec.title} style={{ maxWidth: '100%', maxHeight: '100%' }} />
                ) : (
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>Chưa tô</span>
                )}
              </div>
              <div style={{ padding: 12, display: 'grid', gap: 6 }}>
                <h2 style={{ fontSize: 16, margin: 0 }}>{rec.title}</h2>
                <small style={{ color: '#64748b' }}>
                  {rec.regionCount} vùng · {rec.colorCount} màu · {percent}%
                </small>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link to={`/play/${rec.id}`} aria-label={`Tô tranh ${rec.title}`}>
                    Tô tranh
                  </Link>
                  <button type="button" onClick={() => setAskDelete(rec.id)}>
                    Xoá
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {askDelete && (
        <div role="dialog" aria-modal="true" aria-label="Xác nhận xoá" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', display: 'grid', placeItems: 'center' }}>
          <div style={{ background: '#fff', padding: 20, borderRadius: 12 }}>
            <p>Xoá tranh này cùng toàn bộ tiến độ?</p>
            <button type="button" onClick={() => void remove(askDelete)}>
              Xoá tranh
            </button>{' '}
            <button type="button" onClick={() => setAskDelete(null)}>
              Huỷ
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
