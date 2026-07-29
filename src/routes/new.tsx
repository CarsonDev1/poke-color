import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { assemblePuzzle, decodePuzzleBin, decodeRegions } from '@/core/codec/puzzle-format'
import { DEFAULT_PARAMS, PRESETS, STAGE_LABELS, type PipelineParams, type PipelineStage, type Puzzle, type RgbaImage } from '@/core/types'
import { gzip } from '@/data/compress'
import { decodeToRgba } from '@/data/decode-image'
import { generateInWorker } from '@/data/generate-client'
import { enqueueOutbox, newPuzzleId, savePuzzle } from '@/data/local-cache'
import { Dropzone } from '@/ui/components/dropzone'
import { PreviewCanvas } from '@/ui/components/preview-canvas'
import { TunePanel, type TuneValue } from '@/ui/components/tune-panel'
import { checkQuality, type QualityVerdict } from '@/ui/quality-check'

interface Draft {
  puzzle: Puzzle
  bin: Uint8Array
  regionsJson: string
  usedMinArea: number
  verdict: QualityVerdict
}

export default function NewPuzzleRoute() {
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [tune, setTune] = useState<TuneValue>({
    preset: 'vua',
    k: PRESETS.vua.k,
    targetRegions: PRESETS.vua.targetRegions,
    smoothing: DEFAULT_PARAMS.smoothing,
  })
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<PipelineStage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const imageRef = useRef<RgbaImage | null>(null)

  const generate = useCallback(
    async (img: RgbaImage, t: TuneValue) => {
      setBusy(true)
      setError(null)
      setDraft(null)
      try {
        const params: PipelineParams = {
          ...DEFAULT_PARAMS,
          k: t.k,
          targetRegions: t.targetRegions,
          smoothing: t.smoothing,
          minArea: 'auto',
        }
        const out = await generateInWorker(img, params, {
          onProgress: (s) => setStage(s),
        })
        const puzzle = assemblePuzzle(decodePuzzleBin(out.bin), decodeRegions(out.regionsJson))
        setDraft({
          puzzle,
          bin: out.bin,
          regionsJson: out.regionsJson,
          usedMinArea: out.usedMinArea,
          verdict: checkQuality(out.regionCount),
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
        setStage(null)
      }
    },
    [],
  )

  const onFile = async (f: File): Promise<void> => {
    setFile(f)
    setTitle(f.name.replace(/\.[^.]+$/, ''))
    // xoá lỗi cũ ngay khi bắt đầu chọn ảnh mới — nếu không, khoảng chờ
    // decodeToRgba (bất đồng bộ) sẽ hiện lỗi của lần trước lên màn tinh chỉnh
    // của ảnh mới, dù ảnh mới chưa hề chạy tới bước đó
    setError(null)
    try {
      const img = await decodeToRgba(f)
      imageRef.current = img
      await generate(img, tune)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    if (!draft || !file) return
    setSaving(true)
    setError(null)
    try {
      const id = newPuzzleId()
      await savePuzzle(
        {
          id,
          title: title.trim() || 'Không tên',
          createdAt: Date.now(),
          width: draft.puzzle.width,
          height: draft.puzzle.height,
          colorCount: draft.puzzle.palette.length,
          regionCount: draft.puzzle.regions.length,
          palette: draft.puzzle.palette,
          params: {
            ...DEFAULT_PARAMS,
            k: tune.k,
            targetRegions: tune.targetRegions,
            smoothing: tune.smoothing,
            minArea: draft.usedMinArea,
          },
          usedMinArea: draft.usedMinArea,
        },
        await gzip(draft.bin),
        await gzip(new TextEncoder().encode(draft.regionsJson)),
        file,
      )
      // Đánh dấu cần đẩy lên. Bọc try riêng: lưu cục bộ đã xong nên KHÔNG được
      // để lỗi đánh dấu làm người dùng tưởng việc lưu thất bại.
      try {
        await enqueueOutbox('puzzle', id)
      } catch {
        // bỏ qua — chưa đăng nhập thì cũng chẳng đẩy được
      }
      navigate(`/play/${id}`)
    } catch (err) {
      // Không bắt ở đây thì đây là unhandled rejection: `gzip` ném trên
      // Safari < 16.4 (thiếu CompressionStream), hoặc `savePuzzle` reject với
      // QuotaExceededError (lưu cả ảnh gốc tới 15 MB cộng hai blob gz) —
      // người dùng bấm "Lưu và tô" và không có gì xảy ra, không một dấu hiệu.
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24, display: 'grid', gap: 24 }}>
      <h1>Tạo tranh tô màu mới</h1>

      {!file && <Dropzone onFile={onFile} error={error} />}

      {file && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 24 }}>
          <section style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
            <label style={{ display: 'grid', gap: 4 }}>
              Tên tranh
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>

            <TunePanel value={tune} onChange={setTune} disabled={busy} />

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                disabled={busy || !imageRef.current}
                onClick={() => imageRef.current && void generate(imageRef.current, tune)}
              >
                Sinh lại
              </button>
              <button type="button" disabled={busy || !draft || saving} onClick={() => void save()}>
                {saving ? 'Đang lưu…' : 'Lưu và tô'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setFile(null)
                setDraft(null)
                setError(null)
                imageRef.current = null
              }}
              style={{ justifySelf: 'start', background: 'none', border: 0, color: '#2563eb', padding: 0 }}
            >
              Chọn ảnh khác
            </button>
          </section>

          <section>
            {busy && (
              <p role="status">
                Đang xử lý{stage ? `: ${STAGE_LABELS[stage]}` : ''}…
              </p>
            )}
            {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}

            {draft && (
              <>
                {draft.verdict.level !== 'ok' && (
                  <div
                    role="alert"
                    style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 12, marginBottom: 12 }}
                  >
                    <strong>{draft.verdict.message}</strong>
                    <div>{draft.verdict.hint}</div>
                  </div>
                )}
                <p style={{ color: '#475569' }}>
                  {draft.puzzle.regions.length} vùng · {draft.puzzle.palette.length} màu ·{' '}
                  {draft.puzzle.width}×{draft.puzzle.height}
                </p>
                <PreviewCanvas puzzle={draft.puzzle} maxWidth={680} />
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
