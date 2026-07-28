import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SoundBoard } from '@/audio/synth'
import type { Puzzle } from '@/core/types'
import { listPuzzles, loadOriginal, loadPuzzle, saveThumbnail } from '@/data/local-cache'
import { CompletionBanner } from '@/ui/components/completion-banner'
import { PaintCanvas } from '@/ui/components/paint-canvas'
import { PaletteBar } from '@/ui/components/palette-bar'
import { usePaint } from '@/ui/hooks/use-paint'
import { makeThumbnail } from '@/ui/make-thumbnail'

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
      <main style={{ padding: 24 }}>
        <p role="alert" style={{ color: '#b91c1c' }}>{loadError}</p>
        <Link to="/library">Về thư viện</Link>
      </main>
    )
  }
  if (!puzzle) return <main style={{ padding: 24 }}>Đang tải…</main>

  return <PlayScreen puzzleId={id} puzzle={puzzle} title={title} />
}

function PlayScreen({ puzzleId, puzzle, title }: { puzzleId: string; puzzle: Puzzle; title: string }) {
  const sound = useMemo(() => new SoundBoard(), [])
  const [muted, setMuted] = useState(sound.muted)
  const paint = usePaint(puzzleId, puzzle, sound)
  const [peek, setPeek] = useState(false)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [askReset, setAskReset] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [size, setSize] = useState({ w: 800, h: 520 })
  // Tăng mỗi lần xác nhận "Tô lại từ đầu" — xem giải thích tại nơi dùng.
  const [resetCount, setResetCount] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const paintRef = useRef(paint)
  paintRef.current = paint
  // URL hiện có của ảnh gốc (nếu đã tạo) — giữ trong ref, KHÔNG chỉ trong
  // state `originalUrl`. Xem effect giải phóng bên dưới để hiểu vì sao.
  const originalUrlRef = useRef<string | null>(null)

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
    void loadOriginal(puzzleId).then((blob) => {
      // `alive` chặn trường hợp promise về sau khi effect này đã bị huỷ
      // (đổi puzzle, unmount, hoặc peek/showDone tắt rồi bật lại) — nếu
      // không, URL được tạo ra mà không ai còn cầm để revoke.
      if (!blob || !alive) return
      const url = URL.createObjectURL(blob)
      originalUrlRef.current = url
      setOriginalUrl(url)
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
    if (paint.isComplete) setShowDone(true)
  }, [paint.isComplete])

  // đo khung để canvas vừa cửa sổ
  useEffect(() => {
    const measure = (): void => {
      const el = wrapRef.current
      if (!el) return
      setSize({ w: Math.max(320, el.clientWidth), h: Math.max(240, window.innerHeight - 260) })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
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

  return (
    <main style={{ display: 'grid', gap: 12, padding: 16 }}>
      <header style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Link to="/library">← Thư viện</Link>
        <strong>{title}</strong>
        <span>{puzzle.regions.length} vùng</span>
        <span>
          {paint.filledCount} / {puzzle.regions.length} ·{' '}
          {Math.round(paint.progress * 100)}%
        </span>
        <button type="button" onClick={() => setPeek((v) => !v)}>
          {peek ? 'Ẩn ảnh gốc' : 'Xem ảnh gốc'}
        </button>
        <button type="button" onClick={toggleMute}>
          {muted ? 'Bật tiếng' : 'Tắt tiếng'}
        </button>
        <button type="button" onClick={() => setAskReset(true)}>
          Tô lại từ đầu
        </button>
      </header>

      <p aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {paint.announcement}
      </p>

      {paint.saveError && (
        <p role="alert" style={{ color: '#b91c1c' }}>
          {paint.saveError}
        </p>
      )}

      <PaletteBar
        palette={puzzle.palette}
        remaining={paint.remaining}
        selected={paint.selectedColor}
        onSelect={paint.selectColor}
      />

      <div ref={wrapRef}>
        {/*
          `key={resetCount}` buộc React GỠ và TẠO LẠI PaintCanvas (cùng ba
          canvas con của nó) mỗi lần "Tô lại từ đầu" được xác nhận, thay vì chỉ
          cập nhật props.
          Lý do bắt buộc: `PaintEngine.reset()` xoá bitset TẠI CHỖ — bản thân
          instance `engine` không đổi tham chiếu. Hiệu ứng vẽ lại layer base
          trong PaintCanvas là `useEffect(redrawAll, [redrawAll])` với
          `redrawAll` phụ thuộc `[puzzle, engine]` — cả hai đều KHÔNG đổi khi
          reset, nên nếu không remount, layer base sẽ giữ nguyên màu đã tô cũ
          trong khi lớp số/highlight (phụ thuộc `engine.filledCount`, có đổi)
          vẫn vẽ chồng lên trên — tranh "tô lại" nhìn nham nhở nửa cũ nửa mới.
          KHÔNG sửa bằng cách thêm `engine.filledCount` vào dependency của
          `redrawAll`: hiệu ứng đó sẽ chạy lại ở MỌI lần tô (filledCount đổi
          liên tục), tức là vẽ lại TOÀN BỘ vùng ở mỗi cú tô — đúng cái chi phí
          O(toàn bộ vùng) mà cơ chế tô theo run (`paintRegion`) sinh ra để
          tránh. Remount qua key chỉ tốn kém vào đúng lúc hiếm khi người chơi
          chủ động bấm reset, không ảnh hưởng đường tô bình thường. Cái giá
          phải trả: mất vị trí zoom/pan hiện tại — chấp nhận được, vì người
          chơi vừa yêu cầu bắt đầu lại nên quay về khung nhìn vừa ảnh là hợp lý.
        */}
        <PaintCanvas
          key={resetCount}
          puzzle={puzzle}
          engine={paint.engine}
          selectedColor={paint.selectedColor}
          onPaintRegion={paint.paint}
          onFirstPointer={() => sound.unlock()}
          width={size.w}
          height={size.h}
          revision={paint.revision}
        />
      </div>

      {peek && originalUrl && (
        <img src={originalUrl} alt="Ảnh gốc" style={{ maxWidth: 320, borderRadius: 8 }} />
      )}

      {askReset && (
        <div role="dialog" aria-modal="true" aria-label="Xác nhận tô lại" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', display: 'grid', placeItems: 'center', zIndex: 20 }}>
          <div style={{ background: '#fff', padding: 20, borderRadius: 12 }}>
            <p>Xoá toàn bộ tiến độ của tranh này?</p>
            <button
              type="button"
              onClick={() => {
                paint.reset()
                setResetCount((c) => c + 1)
                setAskReset(false)
                setShowDone(false)
              }}
            >
              Xoá tiến độ
            </button>{' '}
            <button type="button" onClick={() => setAskReset(false)}>
              Huỷ
            </button>
          </div>
        </div>
      )}

      {showDone && paint.isComplete && (
        <CompletionBanner originalUrl={originalUrl} onClose={() => setShowDone(false)} />
      )}
    </main>
  )
}
