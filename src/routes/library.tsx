import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  deletePuzzle,
  listPuzzles,
  loadProgress,
  loadThumbnail,
  type PuzzleRecord,
} from '@/data/local-cache'
import { SyncBanner } from '@/ui/components/sync-banner'
import { useDialogFocus } from '@/ui/dialog-focus'
import { useSession } from '@/ui/hooks/use-session'
import { useSync } from '@/ui/hooks/use-sync'

interface Card {
  rec: PuzzleRecord
  percent: number
  thumbUrl: string | null
}

export default function LibraryRoute() {
  const { session } = useSession()
  const sync = useSync()
  const [cards, setCards] = useState<Card[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
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
    void reload()
      .then((c) => {
        if (!alive) return
        madeRef.current = c.map((x) => x.thumbUrl).filter((u): u is string => u !== null)
        setCards(c)
      })
      .catch((e: unknown) => {
        // Firefox chế độ duyệt riêng tư (và một số trình chặn cookie/lưu trữ)
        // từ chối `indexedDB.open` — không bắt ở đây thì đây là unhandled
        // rejection, `cards` không bao giờ được set, và màn đứng mãi ở "Đang
        // tải…" không lối thoát (CTA header chỉ hiện khi cards.length > 0).
        if (!alive) return
        setLoadError(
          e instanceof Error
            ? e.message
            : 'Không mở được thư viện tranh — bộ nhớ trình duyệt có thể đang bị chặn.',
        )
      })
    return () => {
      alive = false
      for (const u of madeRef.current) URL.revokeObjectURL(u)
      madeRef.current = []
    }
  }, [])

  const remove = async (id: string): Promise<void> => {
    try {
      await deletePuzzle(id)
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
      setAskDelete(null)
      setActionError(null)
    } catch (e) {
      // Không bắt ở đây thì rejection của `deletePuzzle` là unhandled rejection
      // và hộp thoại xác nhận đứng yên không phản hồi gì — không dấu hiệu nào
      // cho người dùng biết thao tác đã thất bại.
      setActionError(
        e instanceof Error ? e.message : 'Không xoá được tranh này, hãy thử lại.',
      )
    }
  }

  if (loadError) {
    return (
      <main style={{ padding: 24 }}>
        {/*
          Render CHÍNH `loadError` (đã chứa `e.message` thật, xem catch phía
          trên) thay vì một câu chữ cứng cố định — trước đây `loadError` được
          tính đúng nhưng không bao giờ được đọc ra ở đây, và câu cứng luôn
          giả định lý do là chế độ duyệt riêng tư, sai với vd QuotaExceededError
          (bộ nhớ đầy) hay các lỗi IndexedDB khác.
        */}
        <p role="alert" style={{ color: '#b91c1c' }}>
          {loadError}
        </p>
        <Link to="/new">Tạo tranh mới</Link>
      </main>
    )
  }
  if (!cards) return <main style={{ padding: 24 }}>Đang tải…</main>

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <SyncBanner state={sync} />
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1>Thư viện tranh</h1>
        <Link to="/login" style={{ fontSize: 14 }}>
          {session ? (session.email || 'Tài khoản') : 'Đăng nhập'}
        </Link>
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
        <DeleteConfirmDialog
          actionError={actionError}
          onConfirm={() => void remove(askDelete)}
          onCancel={() => setAskDelete(null)}
        />
      )}
    </main>
  )
}

/**
 * Tách riêng khỏi LibraryRoute vì `useDialogFocus` phải gọi vô điều kiện
 * trong thân MỘT component — component này chỉ tồn tại khi `askDelete` khác
 * null, nên gọi hook ở đây vẫn tuân thủ rules of hooks dù dialog được render
 * có điều kiện ở component cha (I9).
 *
 * `actionError` được render NGAY TRONG card này (không phải ở body trang phía
 * sau) — trước đây nó nằm ở `LibraryRoute` phía trên danh sách, bị chính
 * backdrop 60%-opaque của dialog này che mờ mỗi khi dialog còn mở (đúng lúc
 * lỗi xảy ra, vì `askDelete` chỉ về `null` khi xoá THÀNH CÔNG — xem `remove`),
 * nên một lần xoá thất bại chỉ hiện ra như một dòng chữ đỏ mờ đằng sau hộp
 * thoại vẫn đang đứng yên, không đọc được.
 */
function DeleteConfirmDialog({
  actionError,
  onConfirm,
  onCancel,
}: {
  actionError: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  // Escape = huỷ (không xác nhận xoá) — giống hành vi "Huỷ", không phải "Xoá tranh"
  const confirmRef = useDialogFocus<HTMLButtonElement>(onCancel)
  return (
    <div role="dialog" aria-modal="true" aria-label="Xác nhận xoá" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', display: 'grid', placeItems: 'center' }}>
      <div style={{ background: '#fff', padding: 20, borderRadius: 12 }}>
        <p>Xoá tranh này cùng toàn bộ tiến độ?</p>
        {actionError && (
          <p role="alert" style={{ color: '#b91c1c' }}>
            {actionError}
          </p>
        )}
        <button ref={confirmRef} type="button" onClick={onConfirm}>
          Xoá tranh
        </button>{' '}
        <button type="button" onClick={onCancel}>
          Huỷ
        </button>
      </div>
    </div>
  )
}
