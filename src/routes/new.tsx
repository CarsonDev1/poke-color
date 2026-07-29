import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Brush, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import { Button } from '@/ui/primitives/button'
import { Card } from '@/ui/primitives/card'
import { Badge, PageTitle, Shell } from '@/ui/primitives/misc'

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
    <Shell>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="mb-6 flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <PageTitle>Tạo tranh tô màu mới</PageTitle>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Tải ảnh lên, app tự chia thành vùng có số. Tinh chỉnh rồi lưu lại.
          </p>
        </div>
        <Link to="/library">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={16} />
            Thư viện
          </Button>
        </Link>
      </motion.div>

      {!file && <Dropzone onFile={onFile} error={error} />}

      {file && (
        <div className="grid gap-6 lg:grid-cols-[minmax(280px,340px)_1fr]">
          <section className="grid content-start gap-5">
            <Card className="p-4">
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Tên tranh
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition-colors focus:border-aqua-400"
                />
              </label>
            </Card>

            <Card className="p-4">
              <TunePanel value={tune} onChange={setTune} disabled={busy} />
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={busy || !imageRef.current}
                onClick={() => imageRef.current && void generate(imageRef.current, tune)}
              >
                <RefreshCw size={16} className={busy ? 'animate-spin' : undefined} />
                Sinh lại
              </Button>
              <Button
                variant="primary"
                disabled={busy || !draft || saving}
                onClick={() => void save()}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Brush size={16} />}
                {saving ? 'Đang lưu…' : 'Lưu và tô'}
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="justify-self-start text-aqua-400"
              onClick={() => {
                setFile(null)
                setDraft(null)
                setError(null)
                imageRef.current = null
              }}
            >
              Chọn ảnh khác
            </Button>
          </section>

          <section className="grid content-start gap-3">
            <AnimatePresence>
              {busy && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <Card className="flex items-center gap-3 p-4">
                    <Loader2 className="animate-spin text-neon-400" size={18} />
                    <div className="flex-1">
                      <p role="status" className="text-sm font-semibold text-slate-900">
                        Đang xử lý{stage ? `: ${STAGE_LABELS[stage]}` : ''}…
                      </p>
                      {/*
                        Nói trước là có thể lâu. Ảnh nhiều màu tốn ~20s ở mặc định
                        (median + quantize là 96% chi phí — xem spec §23), và không
                        báo trước thì người dùng tưởng app treo và tải lại trang.
                      */}
                      <p className="text-xs text-slate-500">
                        Tranh nhiều màu có thể mất vài chục giây.
                      </p>
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <Card className="border-red-500/40 bg-red-500/10 p-4">
                <p role="alert" className="text-sm text-red-200">
                  {error}
                </p>
              </Card>
            )}

            {draft && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="grid gap-3"
              >
                {draft.verdict.level !== 'ok' && (
                  <Card role="alert" className="border-sun-400/40 bg-sun-400/10 p-4">
                    <strong className="text-sm text-sun-400">{draft.verdict.message}</strong>
                    <div className="mt-1 text-sm text-slate-700">{draft.verdict.hint}</div>
                  </Card>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neon">{draft.puzzle.regions.length} vùng</Badge>
                  <Badge tone="aqua">{draft.puzzle.palette.length} màu</Badge>
                  <Badge>
                    {draft.puzzle.width}×{draft.puzzle.height}
                  </Badge>
                </div>

                <Card className="overflow-hidden p-2">
                  <PreviewCanvas puzzle={draft.puzzle} maxWidth={680} />
                </Card>
              </motion.div>
            )}
          </section>
        </div>
      )}
    </Shell>
  )
}
