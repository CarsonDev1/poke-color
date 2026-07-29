import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Brush,
  Eye,
  Hand,
  Loader2,
  Music,
  Music2,
  Printer,
  RotateCcw,
  Share2,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SoundBoard } from '@/audio/synth'
import { colorLabel } from '@/core/label-alphabet'
import type { Puzzle } from '@/core/types'
import { listPuzzles, loadOriginal, loadPuzzle, saveThumbnail } from '@/data/local-cache'
import { BackgroundMusic, useBgmEnabled } from '@/ui/components/bgm'
import { CompletionBanner } from '@/ui/components/completion-banner'
import { CelebrationBurst } from '@/ui/components/decor'
import { PaintCanvas } from '@/ui/components/paint-canvas'
import { PaletteBar } from '@/ui/components/palette-bar'
import { SharePanel } from '@/ui/components/share-panel'
import { useDialogFocus } from '@/ui/dialog-focus'
import { usePaint } from '@/ui/hooks/use-paint'
import { makeThumbnail } from '@/ui/make-thumbnail'
import { Button } from '@/ui/primitives/button'
import { Card } from '@/ui/primitives/card'
import { Badge, ProgressBar, Shell } from '@/ui/primitives/misc'
import { cn } from '@/lib/utils'

export default function PlayRoute() {
  const { id = '' } = useParams()
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  // `loadPuzzle` chỉ ráp Puzzle từ blob nhị phân (bin+regions), không mang
  // theo tên — tên nằm ở PuzzleRecord trong store `puzzles`. `listPuzzles`
  // chỉ đọc metadata nhẹ (không đụng tới puzzle.bin nặng), nên gọi thêm ở
  // đây không phạm phải chi phí mà spec §16 cảnh báo (đó là về giải nén
  // puzzle.bin của NHIỀU puzzle cùng lúc khi mở /library).
  const [title, setTitle] = useState('Tranh')
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setPuzzle(null)
    setLoadError(null)
    loadPuzzle(id)
      .then((p) => alive && setPuzzle(p))
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : String(e)))
    void listPuzzles()
      .then((records) => {
        const rec = records.find((r) => r.id === id)
        if (alive && rec) setTitle(rec.title)
      })
      .catch(() => {
        // tên chỉ mang tính trang trí (mặc định 'Tranh' nếu không lấy được);
        // lỗi đọc metadata ở đây không phải lỗi tải puzzle thật (loadPuzzle ở
        // trên đã lo phần đó), nên cố tình nuốt, không cho nổi lên thành lỗi.
      })
    return () => {
      alive = false
    }
  }, [id])

  if (loadError) {
    return (
      <Shell className="max-w-lg">
        <Card className="p-6">
          <p role="alert" className="text-red-300">
            {loadError}
          </p>
          <Link to="/library" className="mt-4 inline-block text-aqua-400 hover:underline">
            ← Về thư viện
          </Link>
        </Card>
      </Shell>
    )
  }
  if (!puzzle) {
    return (
      <Shell className="max-w-lg">
        <Card className="flex items-center gap-3 p-6">
          <Loader2 className="animate-spin text-neon-400" size={20} />
          <span className="text-ink-400">Đang tải tranh…</span>
        </Card>
      </Shell>
    )
  }

  return <PlayScreen puzzleId={id} puzzle={puzzle} title={title} />
}

function PlayScreen({ puzzleId, puzzle, title }: { puzzleId: string; puzzle: Puzzle; title: string }) {
  const sound = useMemo(() => new SoundBoard(), [])
  const [muted, setMuted] = useState(sound.muted)
  const paint = usePaint(puzzleId, puzzle, sound)
  const [peek, setPeek] = useState(false)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  // Lỗi tải ảnh gốc (vd IndexedDB bị chặn) — trước khi có state này,
  // `loadOriginal(...).then(...)` không có `.catch`: bấm "Xem ảnh gốc" không
  // hiện gì hết, im lặng hoàn toàn, cộng thêm một unhandled rejection (site mà
  // fix I3 bỏ sót — xem effect tải ảnh gốc bên dưới).
  const [peekError, setPeekError] = useState<string | null>(null)
  const [askReset, setAskReset] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [tool, setTool] = useState<'paint' | 'pan'>('paint')
  const [bgm, setBgm] = useBgmEnabled()
  const [showDone, setShowDone] = useState(false)
  const [burst, setBurst] = useState(false)
  // Nội dung của vùng aria-live dùng chung — cập nhật bởi CẢ hai nguồn: đổi
  // sau mỗi lượt tô (`paint.announcement`, đã có sẵn) LẪN đổi mỗi khi con trỏ
  // vùng của bàn phím di chuyển (I7). Tin nhắn mới nhất luôn thắng, đúng như
  // cách một aria-live "polite" nên hoạt động.
  const [liveMessage, setLiveMessage] = useState('')
  const [size, setSize] = useState({ w: 800, h: 520 })
  // Tăng mỗi lần xác nhận "Tô lại từ đầu" — xem giải thích tại nơi dùng.
  const [resetCount, setResetCount] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const paintRef = useRef(paint)
  paintRef.current = paint
  // URL hiện có của ảnh gốc (nếu đã tạo) — giữ trong ref, KHÔNG chỉ trong
  // state `originalUrl`. Xem effect giải phóng bên dưới để hiểu vì sao.
  const originalUrlRef = useRef<string | null>(null)

  // Đóng AudioContext khi rời màn chơi (I5). App là SPA hash-router, không
  // reload trang giữa các puzzle — thư viện → chơi → quay lại lặp lại nhiều
  // lần trong CÙNG một tab tạo ra một `SoundBoard` (và một AudioContext) MỚI
  // mỗi lần mount `PlayScreen`. Chrome giới hạn 6 AudioContext phần cứng mỗi
  // trang; không đóng thì cái thứ 7 làm `ensure()` bên trong SoundBoard ném
  // NotSupportedError, bị catch nuốt và cài `failed = true` vĩnh viễn — puzzle
  // đó về sau câm lặng suốt phần còn lại của phiên, không một dấu hiệu.
  useEffect(() => {
    return () => sound.close()
  }, [sound])

  // ảnh gốc chỉ tải khi thực sự cần (bấm xem, hoặc hoàn thành).
  // Gate trên `originalUrlRef` (không phải state `originalUrl`), và
  // `originalUrl` KHÔNG nằm trong dependency: nếu để state đó trong deps,
  // chính `setOriginalUrl(url)` bên dưới sẽ khiến effect này chạy lại ngay
  // sau khi tạo URL — và cleanup của lượt effect VỪA XONG (đóng closure trên
  // đúng biến `url` đó) sẽ revoke ngay URL vừa render vào `<img>`. Ảnh có vỡ
  // hay không tuỳ trình duyệt đã đọc xong blob trước khi revoke đến hay chưa
  // — lỗi ngắt quãng, khó bắt sau này. Giải phóng URL là trách nhiệm của một
  // effect RIÊNG (bên dưới), chỉ theo `puzzleId`, không theo mỗi lần render.
  useEffect(() => {
    if (!peek && !showDone) return
    if (originalUrlRef.current) return
    let alive = true
    setPeekError(null)
    void loadOriginal(puzzleId)
      .then((blob) => {
        // `alive` chặn trường hợp promise về sau khi effect này đã bị huỷ
        // (đổi puzzle, unmount, hoặc peek/showDone tắt rồi bật lại) — nếu
        // không, URL được tạo ra mà không ai còn cầm để revoke.
        if (!blob || !alive) return
        const url = URL.createObjectURL(blob)
        originalUrlRef.current = url
        setOriginalUrl(url)
      })
      .catch((e: unknown) => {
        // PHẢI bắt: không có `.catch` ở đây, một IndexedDB bị chặn (chế độ
        // duyệt riêng tư, bộ nhớ đầy) làm "Xem ảnh gốc" không làm gì cả — im
        // lặng hoàn toàn — cộng thêm một unhandled rejection. Site mà I3 bỏ sót.
        if (!alive) return
        setPeekError(e instanceof Error ? e.message : 'Không tải được ảnh gốc.')
      })
    return () => {
      alive = false
    }
  }, [peek, showDone, puzzleId])

  // Giải phóng URL ảnh gốc — tách riêng khỏi effect tải ở trên. Chỉ chạy khi
  // đổi puzzle hoặc rời màn (deps `[puzzleId]`), không phải mỗi khi
  // `originalUrl` đổi, nên không thể tự revoke URL nó vừa mới cấp.
  useEffect(() => {
    return () => {
      if (originalUrlRef.current) {
        URL.revokeObjectURL(originalUrlRef.current)
        originalUrlRef.current = null
      }
    }
  }, [puzzleId])

  useEffect(() => {
    if (paint.isComplete) {
      setShowDone(true)
      setBurst(true)
    }
  }, [paint.isComplete])

  // Đẩy thông báo tiến độ (đã có sẵn) vào vùng aria-live dùng chung — bỏ qua
  // chuỗi rỗng ban đầu để không xoá mất thông báo focus-region nếu nó tới
  // trước lượt tô đầu tiên.
  useEffect(() => {
    if (paint.announcement) setLiveMessage(paint.announcement)
  }, [paint.announcement])

  // Con trỏ vùng của bàn phím (I7): id vùng theo thứ tự raster-scan, không
  // theo vị trí thị giác, nên đây là cách DUY NHẤT người dùng screen-reader
  // biết con trỏ đang ở đâu sau khi bấm mũi tên (canvas tự vẽ viền cho mắt
  // nhìn thấy — xem PaintCanvas/drawFocusRing — nhưng đó không giúp gì AT).
  const onFocusRegionChange = useCallback(
    (regionId: number) => {
      const region = puzzle.regions[regionId]
      if (!region) return
      setLiveMessage(`Vùng ${regionId}, màu ${colorLabel(region.colorIndex)}`)
    },
    [puzzle],
  )

  // Đo khung để canvas chiếm hết chỗ còn lại.
  //
  // Đo bằng ResizeObserver trên chính khung chứa, KHÔNG trừ một con số cứng khỏi
  // innerHeight như trước (`innerHeight - 260`): con số đó đúng với duy nhất một
  // bố cục, và sai ngay khi header xuống dòng trên màn hẹp — canvas tràn khỏi
  // màn hoặc chừa một khoảng trống to. ResizeObserver luôn cho kích thước THẬT
  // của chỗ trống.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = (): void => {
      const r = el.getBoundingClientRect()
      setSize({ w: Math.max(280, Math.floor(r.width)), h: Math.max(220, Math.floor(r.height)) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // phím số chọn màu — xử lý ở đây vì palette là state của màn này
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key >= '1' && e.key <= '9') {
        const i = Number(e.key) - 1
        if (i < puzzle.palette.length) paintRef.current.selectColor(i)
      } else if (e.key === '0' && puzzle.palette.length >= 10) {
        paintRef.current.selectColor(9)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [puzzle.palette.length])

  // lưu tiến độ + render thumbnail khi rời màn chơi
  useEffect(() => {
    return () => {
      const p = paintRef.current
      void p.flush()
      void makeThumbnail(puzzle, p.engine)
        .then((blob) => saveThumbnail(puzzleId, blob))
        .catch(() => {
          // thumbnail chỉ để trang trí thư viện; thất bại không ảnh hưởng tiến độ
        })
    }
  }, [puzzle, puzzleId])

  const toggleMute = useCallback(() => {
    const next = !sound.muted
    sound.setMuted(next)
    setMuted(next)
  }, [sound])

  const pct = Math.round(paint.progress * 100)

  return (
    /*
      `h-[100dvh]` + grid ba hàng (header / canvas / dock): canvas nhận đúng chỗ
      trống còn lại và TRANG KHÔNG BAO GIỜ CUỘN. Bố cục cũ là một grid trôi tự
      do nên trên điện thoại palette bị đẩy xuống dưới màn hình — phải cuộn mới
      chọn được màu, giữa lúc đang tô. `dvh` chứ không `vh` vì thanh địa chỉ của
      browser mobile co giãn và `vh` sẽ tính theo lúc nó đang ẩn.
    */
    <div className="grid h-[100dvh] grid-rows-[auto_1fr_auto] overflow-hidden">
      <motion.header
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink-800/70 bg-ink-900/70 px-3 py-2 backdrop-blur-xl sm:px-4"
      >
        <Link
          to="/library"
          aria-label="Về thư viện"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-400 transition-colors hover:bg-ink-800 hover:text-white"
        >
          <ArrowLeft size={18} />
        </Link>

        <strong className="font-display max-w-[10rem] truncate text-base text-white sm:max-w-xs sm:text-lg">
          {title}
        </strong>

        {/* Tiến độ là thông tin quan trọng nhất trên màn này ⇒ đặt ngay cạnh tên */}
        <div className="flex min-w-[8rem] flex-1 items-center gap-2 sm:min-w-[12rem]">
          <ProgressBar value={paint.progress} className="flex-1" />
          <span className="tabular-nums text-xs font-semibold text-ink-400">
            {paint.filledCount} / {puzzle.regions.length}
          </span>
          <Badge tone={pct === 100 ? 'sun' : 'neon'}>{pct}%</Badge>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setPeek((v) => !v)}>
            <Eye size={16} />
            <span className="hidden sm:inline">{peek ? 'Ẩn ảnh gốc' : 'Xem ảnh gốc'}</span>
            <span className="sr-only sm:hidden">{peek ? 'Ẩn ảnh gốc' : 'Xem ảnh gốc'}</span>
          </Button>
          <Button size="icon" variant="ghost" onClick={toggleMute} aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </Button>
          {/*
            Nút RIÊNG cho nhạc nền, không gộp vào "Tắt tiếng": nút kia quản âm
            thanh khi tô (SoundBoard), và gộp lại thì muốn im tiếng tô là mất
            luôn nhạc — hai thứ người dùng muốn điều khiển độc lập.
          */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setBgm(!bgm)}
            aria-label={bgm ? 'Tắt nhạc nền' : 'Bật nhạc nền'}
            className={bgm ? 'text-aqua-400' : undefined}
          >
            {bgm ? <Music size={16} /> : <Music2 size={16} />}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setShowShare((v) => !v)} aria-label={showShare ? 'Ẩn chia sẻ' : 'Chia sẻ'}>
            <Share2 size={16} />
          </Button>
          <Link
            to={`/print/${puzzleId}`}
            aria-label="In"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-ink-400 transition-colors hover:bg-ink-800 hover:text-white"
          >
            <Printer size={16} />
          </Link>
          <Link
            to={`/edit/${puzzleId}`}
            aria-label="Sửa vùng"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-ink-400 transition-colors hover:bg-ink-800 hover:text-white"
          >
            <Wrench size={16} />
          </Link>
          <Button size="sm" variant="ghost" onClick={() => setAskReset(true)} className="text-red-300 hover:bg-red-500/10">
            <RotateCcw size={16} />
            <span className="hidden sm:inline">Tô lại từ đầu</span>
            <span className="sr-only sm:hidden">Tô lại từ đầu</span>
          </Button>
        </div>
      </motion.header>

      {/* vùng canvas — hàng `1fr` của grid, chiếm hết chỗ trống */}
      <div ref={wrapRef} className="relative min-h-0 overflow-hidden">
        {/*
          `key={resetCount}` buộc React GỠ và TẠO LẠI PaintCanvas mỗi lần "Tô lại
          từ đầu" được xác nhận, thay vì chỉ cập nhật props.

          Bắt buộc vì `PaintEngine.reset()` xoá bitset TẠI CHỖ — instance `engine`
          không đổi tham chiếu. Effect vẽ lại layer base phụ thuộc
          `[puzzle, engine]`, cả hai đều KHÔNG đổi khi reset, nên không remount
          thì layer base giữ nguyên màu cũ trong khi lớp số/highlight (phụ thuộc
          `filledCount`, có đổi) vẽ chồng lên — tranh "tô lại" nhìn nham nhở nửa
          cũ nửa mới.

          KHÔNG sửa bằng cách thêm `filledCount` vào dependency: effect đó sẽ
          chạy ở MỌI lần tô, tức vẽ lại TOÀN BỘ vùng mỗi cú tô — đúng cái chi phí
          O(toàn bộ vùng) mà cơ chế tô theo run sinh ra để tránh. Giá phải trả của
          remount: mất vị trí zoom/pan — chấp nhận được, vì người chơi vừa yêu cầu
          bắt đầu lại.
        */}
        <PaintCanvas
          key={resetCount}
          puzzle={puzzle}
          engine={paint.engine}
          selectedColor={paint.selectedColor}
          onPaintRegion={paint.paint}
          onFirstPointer={() => sound.unlock()}
          onFocusRegionChange={onFocusRegionChange}
          width={size.w}
          height={size.h}
          revision={paint.revision}
          tool={tool}
        />

        {/* Công cụ nổi trên canvas: luôn thấy, không cần cuộn */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2">
          <motion.div
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            role="group"
            aria-label="Công cụ"
            className="pointer-events-auto flex items-center gap-1 rounded-full border border-ink-700/70 bg-ink-900/80 p-1 backdrop-blur-xl"
          >
            <ToolButton active={tool === 'paint'} onClick={() => setTool('paint')} label="Tô màu">
              <Brush size={15} />
            </ToolButton>
            <ToolButton active={tool === 'pan'} onClick={() => setTool('pan')} label="Kéo di chuyển">
              <Hand size={15} />
            </ToolButton>
          </motion.div>
        </div>

        <p className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[11px] text-ink-600">
          Hai ngón để kéo và phóng · con lăn để phóng · giữ Space rồi kéo
        </p>

        <AnimatePresence>
          {showShare && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute right-2 top-14 z-10 w-[min(26rem,calc(100%-1rem))]"
            >
              <Card className="p-4">
                <SharePanel puzzleId={puzzleId} />
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {peek && originalUrl && (
            <motion.img
              key="peek"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              src={originalUrl}
              alt="Ảnh gốc"
              className="absolute bottom-3 right-3 z-10 w-40 rounded-xl border-2 border-neon-500/60 shadow-glow sm:w-56"
            />
          )}
        </AnimatePresence>
      </div>

      <p aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      {/* dock dưới: palette luôn trong tầm tay, không phải cuộn tìm */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="z-10 border-t border-ink-800/70 bg-ink-900/70 backdrop-blur-xl"
      >
        {paint.saveError && (
          <p role="alert" className="px-3 pt-2 text-sm text-red-300">
            {paint.saveError}
          </p>
        )}
        {peek && !originalUrl && peekError && (
          <p role="alert" className="px-3 pt-2 text-sm text-red-300">
            {peekError}
          </p>
        )}
        <PaletteBar
          palette={puzzle.palette}
          remaining={paint.remaining}
          selected={paint.selectedColor}
          onSelect={paint.selectColor}
        />
      </motion.div>

      {askReset && (
        <ResetConfirmDialog
          onConfirm={() => {
            paint.reset()
            setResetCount((c) => c + 1)
            setAskReset(false)
            setShowDone(false)
          }}
          onCancel={() => setAskReset(false)}
        />
      )}

      {/*
        Burst chi chay MOT luot roi tu tat (`burst` ve false), khong lap: hieu ung
        an mung lap vo han se che mat chinh buc tranh nguoi choi vua hoan thanh.
      */}
      <CelebrationBurst running={burst} onDone={() => setBurst(false)} />

      {/*
        Nhạc nền — iframe ẩn, tự dừng khi rời màn (React gỡ component). Đặt ở
        cuối cây để nó không bao giờ chen vào layout của canvas.
      */}
      <BackgroundMusic enabled={bgm} />

      {showDone && paint.isComplete && (
        <CompletionBanner originalUrl={originalUrl} onClose={() => setShowDone(false)} />
      )}
    </div>
  )
}

/**
 * Tách riêng khỏi PlayScreen vì `useDialogFocus` phải được gọi vô điều kiện
 * trong thân MỘT component — component này chỉ tồn tại (mount) khi `askReset`
 * true, nên gọi hook ở đây luôn tuân thủ rules of hooks dù bản thân dialog
 * được render có điều kiện ở component cha (I9).
 */
function ResetConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  // Escape = huỷ (không xác nhận xoá) — giống hành vi "Huỷ", không phải "Xoá tiến độ"
  const confirmRef = useDialogFocus<HTMLButtonElement>(onCancel)
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="dialog"
      aria-modal="true"
      aria-label="Xác nhận tô lại"
      className="fixed inset-0 z-30 grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      >
        <Card className="max-w-sm p-6">
          <h2 className="font-display mb-1 text-lg font-bold text-white">Tô lại từ đầu?</h2>
          <p className="mb-5 text-sm text-ink-400">
            Toàn bộ tiến độ của tranh này sẽ bị xoá. Không hoàn tác được.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Huỷ
            </Button>
            <Button ref={confirmRef} variant="danger" onClick={onConfirm}>
              Xoá tiến độ
            </Button>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  )
}

/**
 * Nút công cụ trong thanh nổi trên canvas.
 *
 * Dùng `aria-pressed` chứ không phải `role="radio"`: đây là hai nút bật/tắt trạng
 * thái công cụ, không phải lựa chọn trong một danh sách giá trị. Screen reader
 * đọc "Tô màu, đã nhấn" — đúng ý nghĩa hơn "đã chọn 1 trong 2".
 *
 * Luôn có nhãn chữ cho screen reader (`sr-only` trên màn hẹp) — icon một mình
 * thì công cụ trở nên vô danh với người không nhìn thấy.
 */
function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
        active ? 'text-ink-950' : 'text-ink-400 hover:text-white',
      )}
    >
      {/*
        Viên nền trượt giữa hai nút bằng `layoutId` của framer-motion. Đây là hiệu
        ứng làm rõ NGHĨA chứ không chỉ trang trí: mắt theo được viên nền chạy sang
        nút kia nên biết ngay công cụ vừa đổi, thay vì phải so màu hai nút.
      */}
      {active && (
        <motion.span
          layoutId="tool-pill"
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          className="absolute inset-0 rounded-full bg-aqua-400"
        />
      )}
      <span className="relative flex items-center gap-1.5">
        {children}
        <span className="hidden sm:inline">{label}</span>
        <span className="sr-only sm:hidden">{label}</span>
      </span>
    </button>
  )
}
