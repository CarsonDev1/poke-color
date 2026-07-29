import { AnimatePresence, motion } from 'framer-motion'
import { BarChart3, Brush, ImagePlus, Plus, Sparkles, Trash2 } from 'lucide-react'
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
import { useSync } from '@/ui/hooks/use-sync'
import { Button } from '@/ui/primitives/button'
import { Card } from '@/ui/primitives/card'
import { Badge, PageTitle, ProgressBar, Shell, Skeleton } from '@/ui/primitives/misc'

interface CardData {
  rec: PuzzleRecord
  percent: number
  thumbUrl: string | null
}

export default function LibraryRoute() {
  const sync = useSync()
  const [cards, setCards] = useState<CardData[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [askDelete, setAskDelete] = useState<string | null>(null)
  // Lô object URL thumbnail đang HIỂN THỊ hiện tại — dùng ref (không phải
  // state) vì cả effect cleanup lẫn remove() đều cần đọc/ghi nó, và ghi vào
  // đây không được kéo theo re-render.
  const madeRef = useRef<string[]>([])

  const reload = async (): Promise<CardData[]> => {
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
      <Shell className="max-w-lg">
        <Card className="p-6">
          {/*
            Render CHÍNH `loadError` (đã chứa `e.message` thật) thay vì một câu
            chữ cứng — trước đây `loadError` được tính đúng nhưng không bao giờ
            đọc ra ở đây, và câu cứng luôn giả định lý do là chế độ duyệt riêng
            tư, sai với vd QuotaExceededError hay các lỗi IndexedDB khác.
          */}
          <p role="alert" className="text-red-300">
            {loadError}
          </p>
          <Link to="/new" className="mt-4 inline-block text-aqua-400 hover:underline">
            Tạo tranh mới
          </Link>
        </Card>
      </Shell>
    )
  }
  if (!cards) {
    return (
      <Shell>
        <div className="mb-6 h-9 w-56 animate-pulse rounded-xl bg-ink-800" />
        <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 p-0">
          {[0, 1, 2, 3].map((i) => (
            <li key={i}>
              <Skeleton className="aspect-[4/3] w-full" />
            </li>
          ))}
        </ul>
      </Shell>
    )
  }

  return (
    <Shell>
      <SyncBanner state={sync} />

      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="mb-6 flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <PageTitle>Thư viện tranh</PageTitle>
          <p className="mt-1 text-sm text-ink-400">
            {cards.length > 0
              ? `${cards.length} tranh · ${cards.filter((c) => c.percent === 100).length} đã hoàn thành`
              : 'Tải một bức tranh lên để bắt đầu'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/stats">
            <Button variant="ghost" size="sm">
              <BarChart3 size={16} />
              Thống kê
            </Button>
          </Link>
          {/*
            Chỉ hiện "Tạo tranh mới" ở header khi danh sách KHÔNG rỗng. Khi rỗng,
            khối trạng thái rỗng bên dưới đã có link cùng tên — hiện cả hai tạo ra
            hai link trùng tên trên một trang, khiến truy vấn theo role+tên (và
            mọi công cụ hỗ trợ dựa vào accessible name) không phân biệt được.
          */}
          {cards.length > 0 && (
            <Link to="/new">
              <Button variant="primary" size="sm">
                <Plus size={16} />
                Tạo tranh mới
              </Button>
            </Link>
          )}
        </div>
      </motion.header>

      {cards.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="grid place-items-center py-16"
        >
          <Card className="max-w-sm p-8 text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 animate-float place-items-center rounded-2xl bg-neon-500/15 text-neon-400">
              <ImagePlus size={28} />
            </div>
            <h2 className="font-display mb-1 text-lg font-bold text-white">Chưa có tranh nào</h2>
            <p className="mb-5 text-sm text-ink-400">
              Tải ảnh lên, app sẽ tự chia thành vùng có số để bạn tô.
            </p>
            <Link to="/new">
              <Button variant="primary" size="lg" className="w-full">
                <Plus size={18} />
                Tạo tranh mới
              </Button>
            </Link>
          </Card>
        </motion.div>
      ) : (
        <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 p-0">
          <AnimatePresence mode="popLayout">
            {cards.map(({ rec, percent, thumbUrl }, i) => (
              <motion.li
                key={rec.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                /*
                  Trễ theo thứ tự thẻ, nhưng KẸP ở 6 thẻ đầu: không kẹp thì với 30
                  tranh, thẻ cuối phải đợi 1.2s mới xuất hiện — trông như app treo
                  chứ không phải hiệu ứng.
                */
                transition={{ delay: Math.min(i, 6) * 0.05, type: 'spring', stiffness: 260, damping: 26 }}
              >
                <Card className="group h-full overflow-hidden">
                  <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-ink-950/60">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={rec.title}
                        className="max-h-full max-w-full transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <span className="text-xs text-ink-600">Chưa tô</span>
                    )}

                    {percent === 100 && (
                      <Badge tone="sun" className="absolute left-2 top-2">
                        <Sparkles size={11} />
                        Hoàn thành
                      </Badge>
                    )}
                  </div>

                  <div className="grid gap-2 p-3">
                    <h2 className="font-display truncate text-base font-bold text-white">
                      {rec.title}
                    </h2>
                    <ProgressBar value={percent / 100} />
                    <small className="text-xs text-ink-400">
                      {rec.regionCount} vùng · {rec.colorCount} màu · {percent}%
                    </small>
                    <div className="mt-1 flex gap-2">
                      <Link to={`/play/${rec.id}`} aria-label={`Tô tranh ${rec.title}`} className="flex-1">
                        <Button variant="primary" size="sm" className="w-full">
                          <Brush size={15} />
                          Tô tranh
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        /*
                          Đặt tên trong ngoặc kép để KHÔNG trùng accessible name
                          với nút "Xoá tranh" trong hộp thoại xác nhận: một tranh
                          tên "Tranh" sẽ cho ra đúng chuỗi đó, và hai nút cùng tên
                          trên một trang khiến người dùng screen reader nghe y hệt
                          nhau mà không biết cái nào mở hộp thoại, cái nào xoá thật.
                        */
                        aria-label={`Xoá "${rec.title}"`}
                        onClick={() => setAskDelete(rec.id)}
                        className="h-8 w-8 text-ink-400 hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <AnimatePresence>
        {askDelete && (
          <DeleteConfirmDialog
            actionError={actionError}
            onConfirm={() => void remove(askDelete)}
            onCancel={() => setAskDelete(null)}
          />
        )}
      </AnimatePresence>
    </Shell>
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Xác nhận xoá"
      className="fixed inset-0 z-30 grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      >
        <Card className="max-w-sm p-6">
          <h2 className="font-display mb-1 text-lg font-bold text-white">Xoá tranh này?</h2>
          <p className="mb-4 text-sm text-ink-400">
            Cả tranh và toàn bộ tiến độ tô sẽ bị xoá. Không hoàn tác được.
          </p>
          {actionError && (
            <p role="alert" className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
              {actionError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Huỷ
            </Button>
            <Button ref={confirmRef} variant="danger" onClick={onConfirm}>
              Xoá tranh
            </Button>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  )
}
