import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Loader2, Redo2, Save, Undo2, Wand2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { encodePuzzleBin, encodeRegions } from '@/core/codec/puzzle-format'
import {
  activeOps,
  canRedo,
  canUndo,
  emptyHistory,
  pushOp,
  redo as redoHistory,
  undo as undoHistory,
  type EditHistory,
} from '@/core/editor/edit-history'
import { applyOps, type EditOp } from '@/core/editor/edit-ops'
import { recomputePuzzle } from '@/core/editor/recompute'
import { colorLabel } from '@/core/label-alphabet'
import { DEFAULT_PARAMS, type Puzzle, type RegionField } from '@/core/types'
import { gzip } from '@/data/compress'
import {
  deletePuzzle,
  enqueueOutbox,
  loadBlobs,
  loadPuzzle,
  loadPuzzleRecord,
  savePuzzle,
  type PuzzleRecord,
} from '@/data/local-cache'
import { rgbCss } from '@/render/layers'
import { useDialogFocus } from '@/ui/dialog-focus'
import { Button } from '@/ui/primitives/button'
import { Card } from '@/ui/primitives/card'
import { Badge, PageTitle, Shell } from '@/ui/primitives/misc'

export default function EditRoute() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [base, setBase] = useState<{ field: RegionField; puzzle: Puzzle; rec: PuzzleRecord } | null>(
    null,
  )
  const [history, setHistory] = useState<EditHistory>(emptyHistory())
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opError, setOpError] = useState<string | null>(null)
  const [smallThreshold, setSmallThreshold] = useState(30)
  const [confirmSave, setConfirmSave] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [puzzle, rec] = await Promise.all([loadPuzzle(id), loadPuzzleRecord(id)])
        if (!rec) throw new Error('Không tìm thấy tranh này.')
        if (!alive) return
        setBase({
          field: {
            regionMap: puzzle.regionMap,
            regions: puzzle.regions,
            width: puzzle.width,
            height: puzzle.height,
          },
          puzzle,
          rec,
        })
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      alive = false
    }
  }, [id])

  /**
   * Trạng thái hiện tại = chạy lại thao tác từ field GỐC.
   *
   * Tính lại toàn bộ mỗi lần thay vì cập nhật tăng dần: đó là điều làm undo trở
   * về byte-identical mà không phải viết phép nghịch đảo cho từng loại thao tác.
   */
  const current = useMemo(() => {
    if (!base) return null
    try {
      const ops = activeOps(history)
      const field = applyOps(base.field, ops)
      const puzzle = recomputePuzzle(field, base.puzzle.palette, DEFAULT_PARAMS.minLabelRadius)
      return { field, puzzle }
    } catch (err) {
      // Không để ném ra ngoài render: một op không hợp lệ sẽ làm trắng cả trang.
      setOpError(err instanceof Error ? err.message : String(err))
      return null
    }
  }, [base, history])

  const run = useCallback(
    (op: EditOp) => {
      setOpError(null)
      setHistory((h) => {
        if (!base) return h
        // Thử áp op TRƯỚC khi ghi vào lịch sử. Ghi rồi mới phát hiện lỗi sẽ để
        // lại một lịch sử không chạy lại được, và MỌI undo sau đó cũng vỡ theo
        // vì undo chính là chạy lại từ gốc.
        try {
          applyOps(base.field, [...activeOps(h), op])
        } catch (err) {
          setOpError(err instanceof Error ? err.message : String(err))
          return h
        }
        return pushOp(h, op)
      })
    },
    [base],
  )

  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // vẽ: nền theo màu palette + viền đen, vùng đang chọn tô vàng
  useEffect(() => {
    const cv = canvasRef.current
    const p = current?.puzzle
    if (!cv || !p) return

    const maxW = 720
    const scale = Math.min(1, maxW / p.width)
    cv.width = p.width
    cv.height = p.height
    cv.style.width = `${Math.round(p.width * scale)}px`
    cv.style.height = `${Math.round(p.height * scale)}px`

    const ctx = cv.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(p.width, p.height)
    for (let i = 0; i < p.regionMap.length; i++) {
      const r = p.regions[p.regionMap[i]]
      const c = p.palette[r?.colorIndex ?? 0] ?? [255, 255, 255]
      const sel = selected !== null && p.regionMap[i] === selected
      const o = i * 4
      img.data[o] = sel ? 250 : c[0]
      img.data[o + 1] = sel ? 220 : c[1]
      img.data[o + 2] = sel ? 60 : c[2]
      img.data[o + 3] = 255
    }
    // viền đen
    for (let i = 0; i < p.outline.length; i++) {
      if (p.outline[i] === 0) continue
      const o = i * 4
      img.data[o] = 30
      img.data[o + 1] = 30
      img.data[o + 2] = 30
    }
    ctx.putImageData(img, 0, 0)
  }, [current, selected])

  const onCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const p = current?.puzzle
      const cv = canvasRef.current
      if (!p || !cv) return
      const rect = cv.getBoundingClientRect()
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * p.width)
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * p.height)
      if (x < 0 || y < 0 || x >= p.width || y >= p.height) return
      const clicked = p.regionMap[y * p.width + x]

      if (selected === null) {
        setSelected(clicked)
        return
      }
      if (selected === clicked) {
        setSelected(null)
        return
      }
      // click vùng thứ hai ⇒ gộp
      run({ kind: 'merge', a: selected, b: clicked })
      setSelected(null)
    },
    [current, selected, run],
  )

  const save = useCallback(async () => {
    if (!base || !current) return
    setSaving(true)
    try {
      const blobs = await loadBlobs(id)
      if (!blobs) throw new Error('Không tìm thấy dữ liệu gốc của tranh.')

      const p = current.puzzle
      const bin = encodePuzzleBin({
        width: p.width,
        height: p.height,
        palette: p.palette,
        regionCount: p.regions.length,
        regionMap: p.regionMap,
      })
      const regionsJson = encodeRegions(p.regions)

      // A5: id vùng đã đổi ⇒ bitset tiến độ cũ vô nghĩa. deletePuzzle xoá luôn
      // progress, rồi savePuzzle ghi lại — cách chắc chắn nhất để không còn sót
      // một bitset trỏ vào id không còn tồn tại.
      await deletePuzzle(id)
      await savePuzzle(
        {
          ...base.rec,
          id,
          colorCount: p.palette.length,
          regionCount: p.regions.length,
        },
        await gzip(bin),
        await gzip(new TextEncoder().encode(regionsJson)),
        blobs.original,
      )
      try {
        await enqueueOutbox('puzzle', id)
      } catch {
        // chưa đăng nhập thì không đẩy được, không sao
      }
      navigate(`/play/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [base, current, id, navigate])

  if (error) {
    return (
      <Shell className="max-w-lg">
        <Card className="p-6">
          <p role="alert" className="text-red-300">
            {error}
          </p>
          <Link to="/library" className="mt-4 inline-block text-aqua-400 hover:underline">
            &larr; Về thư viện
          </Link>
        </Card>
      </Shell>
    )
  }
  if (!base || !current) {
    return (
      <Shell className="max-w-lg">
        <Card className="flex items-center gap-3 p-6">
          <Loader2 className="animate-spin text-neon-400" size={20} />
          <span className="text-slate-500">Đang tải tranh…</span>
        </Card>
      </Shell>
    )
  }

  const p = current.puzzle
  const nOps = activeOps(history).length

  return (
    <Shell className="max-w-4xl">
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <PageTitle>Sửa vùng</PageTitle>
          <p className="mt-1 text-sm font-medium text-slate-600">{base.rec.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="aqua">{p.regions.length} vùng</Badge>
          {nOps > 0 && <Badge tone="sun">{nOps} thay đổi chưa lưu</Badge>}
          <Link to="/library">
            <Button variant="ghost" size="sm">
              <ArrowLeft size={16} />
              Thư viện
            </Button>
          </Link>
        </div>
      </motion.header>

      <Card className="mb-3 p-3 text-sm text-slate-500">
        Bấm một vùng để chọn, bấm vùng thứ hai <strong className="text-slate-700">kề nó</strong> để
        gộp lại. Vùng đang chọn hiện màu vàng.
      </Card>

      <AnimatePresence>
        {opError && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="alert"
            className="mb-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-200"
          >
            {opError}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!canUndo(history)}
          onClick={() => setHistory(undoHistory)}
        >
          <Undo2 size={15} />
          Hoàn tác
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!canRedo(history)}
          onClick={() => setHistory(redoHistory)}
        >
          <Redo2 size={15} />
          Làm lại
        </Button>

        <span className="ml-2 flex items-center gap-2 text-sm text-slate-500">
          Gộp vùng nhỏ hơn
          <input
            aria-label="Ngưỡng diện tích"
            type="number"
            min={1}
            max={5000}
            value={smallThreshold}
            onChange={(e) => setSmallThreshold(Number(e.target.value))}
            className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-900 outline-none focus:border-aqua-400"
          />
          px
        </span>
        <Button
          variant="aqua"
          size="sm"
          onClick={() => run({ kind: 'mergeSmall', minArea: smallThreshold })}
        >
          <Wand2 size={15} />
          Gộp loạt
        </Button>
      </div>

      <Card className="mb-3 overflow-hidden p-2">
        <canvas
          ref={canvasRef}
          onClick={onCanvasClick}
          className="mx-auto block cursor-pointer rounded-lg [image-rendering:pixelated]"
        />
      </Card>

      {selected !== null && (
        <Card className="mb-3 p-4">
          <p className="mb-2 text-sm font-bold text-slate-900">Đổi màu vùng {selected}</p>
          <div className="flex flex-wrap gap-1.5">
            {p.palette.map((c, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Đổi sang màu ${colorLabel(i)}`}
                onClick={() => {
                  run({ kind: 'color', region: selected, colorIndex: i })
                  setSelected(null)
                }}
                className="w-11 rounded-lg border border-slate-300 bg-slate-100 p-1 transition-colors hover:border-aqua-400"
              >
                <span
                  aria-hidden
                  className="block h-5 rounded"
                  style={{ background: rgbCss(c) }}
                />
                <span className="font-mono text-[11px] text-slate-700">{colorLabel(i)}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Button
        variant="primary"
        size="lg"
        disabled={nOps === 0 || saving}
        onClick={() => setConfirmSave(true)}
      >
        {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
        {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
      </Button>

      <AnimatePresence>
        {confirmSave && (
          <ConfirmSave
            onCancel={() => setConfirmSave(false)}
            onConfirm={() => {
              setConfirmSave(false)
              void save()
            }}
          />
        )}
      </AnimatePresence>
    </Shell>
  )
}

/**
 * A5: sửa vùng làm id vùng thay đổi ⇒ bitset tiến độ cũ vô nghĩa. Phải cảnh báo
 * RÕ trước khi lưu, vì người dùng có thể đã tô hàng trăm vùng.
 */
function ConfirmSave({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const primaryRef = useDialogFocus<HTMLButtonElement>(onCancel)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Xác nhận lưu thay đổi"
      className="fixed inset-0 z-30 grid place-items-center bg-slate-900/55 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      >
        <Card className="max-w-sm p-6">
          <h2 className="font-display mb-1 text-lg font-bold text-slate-900">Lưu sẽ XOÁ tiến độ tô</h2>
          <p className="mb-5 text-sm text-slate-500">
            Sửa vùng làm số hiệu các vùng thay đổi, nên tiến độ tô hiện tại không còn khớp và sẽ bị
            xoá. Bạn sẽ tô lại từ đầu.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Huỷ
            </Button>
            <Button ref={primaryRef} variant="danger" onClick={onConfirm}>
              Lưu và xoá tiến độ
            </Button>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  )
}
