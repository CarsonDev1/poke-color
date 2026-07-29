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
      <main style={{ padding: 24 }}>
        <p role="alert" style={{ color: '#b91c1c' }}>
          {error}
        </p>
        <Link to="/library">Về thư viện</Link>
      </main>
    )
  }
  if (!base || !current) return <main style={{ padding: 24 }}>Đang tải…</main>

  const p = current.puzzle
  const nOps = activeOps(history).length

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: 24, display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Link to="/library">← Thư viện</Link>
        <strong>Sửa vùng: {base.rec.title}</strong>
        <span>{p.regions.length} vùng</span>
        {nOps > 0 && <span style={{ color: '#854d0e' }}>{nOps} thay đổi chưa lưu</span>}
      </header>

      <p style={{ margin: 0, color: '#475569' }}>
        Bấm một vùng để chọn, bấm vùng thứ hai (kề nó) để gộp hai vùng lại. Vùng đang chọn hiện
        màu vàng.
      </p>

      {opError && (
        <p role="alert" style={{ margin: 0, color: '#b91c1c' }}>
          {opError}
        </p>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" disabled={!canUndo(history)} onClick={() => setHistory(undoHistory)}>
          Hoàn tác
        </button>
        <button type="button" disabled={!canRedo(history)} onClick={() => setHistory(redoHistory)}>
          Làm lại
        </button>
        <span style={{ marginLeft: 8 }}>
          Gộp mọi vùng nhỏ hơn{' '}
          <input
            aria-label="Ngưỡng diện tích"
            type="number"
            min={1}
            max={5000}
            value={smallThreshold}
            onChange={(e) => setSmallThreshold(Number(e.target.value))}
            style={{ width: 80 }}
          />{' '}
          px
        </span>
        <button type="button" onClick={() => run({ kind: 'mergeSmall', minArea: smallThreshold })}>
          Gộp loạt
        </button>
      </div>

      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
        style={{ border: '1px solid #cbd5e1', cursor: 'pointer', imageRendering: 'pixelated' }}
      />

      {selected !== null && (
        <fieldset style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 12 }}>
          <legend>Đổi màu vùng {selected}</legend>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {p.palette.map((c, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Đổi sang màu ${colorLabel(i)}`}
                onClick={() => {
                  run({ kind: 'color', region: selected, colorIndex: i })
                  setSelected(null)
                }}
                style={{
                  width: 40,
                  padding: 2,
                  border: '1px solid #94a3b8',
                  borderRadius: 6,
                  background: '#fff',
                }}
              >
                <span
                  aria-hidden
                  style={{ display: 'block', height: 20, background: rgbCss(c), borderRadius: 3 }}
                />
                <span style={{ fontSize: 11 }}>{colorLabel(i)}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div>
        <button type="button" disabled={nOps === 0 || saving} onClick={() => setConfirmSave(true)}>
          {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </div>

      {confirmSave && (
        <ConfirmSave
          onCancel={() => setConfirmSave(false)}
          onConfirm={() => {
            setConfirmSave(false)
            void save()
          }}
        />
      )}
    </main>
  )
}

/**
 * A5: sửa vùng làm id vùng thay đổi ⇒ bitset tiến độ cũ vô nghĩa. Phải cảnh báo
 * RÕ trước khi lưu, vì người dùng có thể đã tô hàng trăm vùng.
 */
function ConfirmSave({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const primaryRef = useDialogFocus<HTMLButtonElement>(onCancel)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Xác nhận lưu thay đổi"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,.45)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 420, display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Lưu sẽ XOÁ tiến độ tô</h2>
        <p style={{ margin: 0 }}>
          Sửa vùng làm số hiệu các vùng thay đổi, nên tiến độ tô hiện tại không còn khớp và sẽ bị
          xoá. Bạn sẽ tô lại từ đầu.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}>
            Huỷ
          </button>
          <button ref={primaryRef} type="button" onClick={onConfirm}>
            Lưu và xoá tiến độ
          </button>
        </div>
      </div>
    </div>
  )
}
