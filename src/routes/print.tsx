import { motion } from 'framer-motion'
import { ArrowLeft, Download, Loader2, Printer } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { decodeRegions } from '@/core/codec/puzzle-format'
import { colorLabel } from '@/core/label-alphabet'
import type { PuzzleRecord } from '@/data/local-cache'
import { gunzip } from '@/data/compress'
import { loadBlobs, loadPuzzleRecord } from '@/data/local-cache'
import { vectorizeInWorker } from '@/data/vectorize-client'
import { AmbientBackground } from '@/ui/components/decor'
import { Button } from '@/ui/primitives/button'
import { Card } from '@/ui/primitives/card'
import { PageTitle, Shell } from '@/ui/primitives/misc'

type Layout = 'one' | 'quad'

interface Ready {
  outline: string
  solution: string
  rec: PuzzleRecord
  /** số vùng mỗi màu, đếm từ regions THẬT */
  countPerColor: number[]
}

/** mm — mép chồng khi chia 2×2 để dán lại không hở (spec §7) */
const OVERLAP_MM = 4

export default function PrintRoute() {
  const { id = '' } = useParams()
  const [ready, setReady] = useState<Ready | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [layout, setLayout] = useState<Layout>('one')
  const [withSolution, setWithSolution] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let alive = true
    const ac = new AbortController()
    abortRef.current = ac

    void (async () => {
      try {
        const [rec, blobs] = await Promise.all([loadPuzzleRecord(id), loadBlobs(id)])
        if (!rec || !blobs) throw new Error('Không tìm thấy tranh này trong máy.')

        const bin = await gunzip(blobs.binGz)
        const regionsJson = new TextDecoder().decode(await gunzip(blobs.regionsGz))
        const out = await vectorizeInWorker(bin, regionsJson, {}, { signal: ac.signal })
        if (!alive) return

        // Đếm từ regions THẬT, không đếm <text> trong SVG: chỉ vùng có hasLabel
        // mới sinh <text>, nên đếm theo SVG sẽ báo thiếu ở mọi màu có vùng nhỏ.
        const countPerColor = new Array<number>(rec.palette.length).fill(0)
        for (const r of decodeRegions(regionsJson)) {
          if (r.colorIndex >= 0 && r.colorIndex < countPerColor.length) {
            countPerColor[r.colorIndex]++
          }
        }

        setReady({ outline: out.outline, solution: out.solution, rec, countPerColor })
      } catch (err) {
        if (!alive) return
        setError(err instanceof Error ? err.message : String(err))
      }
    })()

    return () => {
      alive = false
      // Huỷ worker khi rời trang: không huỷ thì vector hoá một tranh 5000 vùng
      // vẫn chạy tiếp và ngốn CPU sau khi người dùng đã bỏ đi.
      ac.abort()
    }
  }, [id])

  const download = useCallback(
    (which: 'outline' | 'solution') => {
      if (!ready) return
      const svg = which === 'outline' ? ready.outline : ready.solution
      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${ready.rec.title || 'tranh'}-${which === 'outline' ? 'de-to' : 'ban-giai'}.svg`
      a.click()
      // Thu hồi ngay là Safari huỷ luôn cả lần tải; hoãn một nhịp cho browser
      // kịp bắt đầu đọc blob.
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    },
    [ready],
  )

  /** một dòng legend cho mỗi màu: ô màu + nhãn + hex + số vùng */
  const legend = useMemo(() => {
    if (!ready) return []
    return ready.rec.palette.map((rgb, i) => ({
      index: i,
      label: colorLabel(i),
      hex: toHex(rgb),
      count: ready.countPerColor[i] ?? 0,
    }))
  }, [ready])

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

  if (!ready) {
    return (
      <Shell className="max-w-lg">
        <Card className="flex items-center gap-3 p-6">
          <Loader2 className="animate-spin text-neon-400" size={20} />
          <div>
            <p className="font-semibold text-slate-900">Đang chuyển tranh sang dạng vector…</p>
            <p className="text-sm text-slate-500">Tranh nhiều vùng có thể mất vài chục giây.</p>
          </div>
        </Card>
      </Shell>
    )
  }

  return (
    <>
      <style>{PRINT_CSS}</style>

      <Shell className="screen-only max-w-4xl">
        {/* screen-only: @media print an ca khoi nay nen nen khong len giay */}
        <AmbientBackground seed="print" />
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 flex flex-wrap items-center justify-between gap-3"
        >
          <PageTitle>In: {ready.rec.title}</PageTitle>
          <Link to={`/play/${id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft size={16} />
              Về màn tô
            </Button>
          </Link>
        </motion.header>

        <Card className="mb-4 p-4">
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 text-sm font-bold text-slate-900">Khổ in</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ['one', 'Vừa 1 trang A4', 'Cả tranh trên một tờ'],
                ['quad', 'Chia 2×2 trang', `To hơn, mép chồng ${OVERLAP_MM}mm để dán lại`],
              ] as const).map(([key, label, hint]) => (
                <label
                  key={key}
                  className={
                    'cursor-pointer rounded-xl border-2 p-3 transition-colors ' +
                    (layout === key
                      ? 'border-neon-400 bg-neon-500/12'
                      : 'border-slate-300 bg-slate-50 hover:border-slate-400')
                  }
                >
                  <input
                    type="radio"
                    name="layout"
                    checked={layout === key}
                    onChange={() => setLayout(key)}
                    className="sr-only"
                  />
                  <span className="block text-sm font-bold text-slate-900">{label}</span>
                  <span className="block text-[11px] text-slate-500">{hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={withSolution}
              onChange={(e) => setWithSolution(e.target.checked)}
              className="h-4 w-4 accent-neon-500"
            />
            In kèm trang bản giải
          </label>
        </Card>

        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => window.print()}>
            <Printer size={16} />
            In
          </Button>
          <Button variant="secondary" onClick={() => download('outline')}>
            <Download size={16} />
            SVG bản để tô
          </Button>
          <Button variant="ghost" onClick={() => download('solution')}>
            <Download size={16} />
            SVG bản giải
          </Button>
        </div>

        <p className="text-sm text-slate-500">Xem trước bên dưới đúng như khi in.</p>
      </Shell>

      {/* ------------------------- phần được in ------------------------- */}
      <div className="print-root">
        {layout === 'one' ? (
          <section className="page">
            <div className="art" dangerouslySetInnerHTML={{ __html: ready.outline }} />
          </section>
        ) : (
          [0, 1, 2, 3].map((q) => (
            <section className="page" key={q}>
              <div className="page-label">
                Trang {q + 1}/4 — {q < 2 ? 'trên' : 'dưới'} {q % 2 === 0 ? 'trái' : 'phải'}
              </div>
              <div
                className="art quad"
                style={{
                  // dịch 4 phần tư, kèm mép chồng
                  ['--tx' as string]: `${q % 2 === 0 ? 0 : -100}%`,
                  ['--ty' as string]: `${q < 2 ? 0 : -100}%`,
                }}
                dangerouslySetInnerHTML={{ __html: ready.outline }}
              />
            </section>
          ))
        )}

        <section className="page legend-page">
          <h2>Bảng màu — {ready.rec.title}</h2>
          <table className="legend">
            <thead>
              <tr>
                <th>Màu</th>
                <th>Nhãn</th>
                <th>Mã màu</th>
                <th>Số vùng</th>
              </tr>
            </thead>
            <tbody>
              {legend.map((l) => (
                <tr key={l.index}>
                  <td>
                    <span className="swatch" style={{ background: l.hex }} />
                  </td>
                  <td className="mono">{l.label}</td>
                  <td className="mono">{l.hex}</td>
                  <td>{l.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {withSolution && (
          <section className="page">
            <div className="page-label">Bản giải</div>
            <div className="art" dangerouslySetInnerHTML={{ __html: ready.solution }} />
          </section>
        )}
      </div>
    </>
  )
}

function toHex(rgb: readonly number[]): string {
  const h = (n: number): string => Math.round(n).toString(16).padStart(2, '0')
  return `#${h(rgb[0])}${h(rgb[1])}${h(rgb[2])}`
}

/**
 * `@page size: A4` + `margin: 10mm` theo spec §7.
 *
 * `.screen-only` bị ẩn khi in và `.print-root` bị ẩn trên màn hình... KHÔNG:
 * print-root hiện cả hai nơi để người dùng xem trước đúng cái sẽ in ra. Chỉ
 * phần điều khiển (`.screen-only`) là bị ẩn khi in.
 */
const PRINT_CSS = `
@page { size: A4; margin: 10mm; }

.print-root { max-width: 1000px; margin: 0 auto; padding: 0 24px 48px; }
.page {
  position: relative;
  background: #fff;
  border: 1px solid #e2e8f0;
  margin: 0 auto 24px;
  padding: 8px;
  /* tỉ lệ A4 trừ lề: 190 x 277mm */
  aspect-ratio: 190 / 277;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.page-label { position: absolute; top: 4px; left: 8px; font-size: 10px; color: #64748b; }
.art { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.art svg { max-width: 100%; max-height: 100%; height: auto; width: auto; }
/* 2x2: phóng gấp đôi rồi dịch, cộng mép chồng ${OVERLAP_MM}mm */
.art.quad { overflow: hidden; }
.art.quad svg {
  max-width: none; max-height: none;
  width: calc(200% + ${OVERLAP_MM * 2}mm);
  transform: translate(var(--tx), var(--ty));
}
.legend-page { display: block; aspect-ratio: auto; min-height: 0; }
table.legend { border-collapse: collapse; width: 100%; font-size: 12px; }
table.legend th, table.legend td { border: 1px solid #cbd5e1; padding: 4px 8px; text-align: left; }
.swatch { display: inline-block; width: 28px; height: 14px; border: 1px solid rgba(0,0,0,.25); }
.mono { font-family: ui-monospace, monospace; }

@media print {
  /*
    ÉP MÀU CHO GIẤY. Giao diện app là dark theme (chữ sáng trên nền tối), và nếu
    không ghi đè ở đây thì bản in ra là chữ SÁNG TRÊN GIẤY TRẮNG — gần như vô
    hình. Đây là hệ quả trực tiếp của việc chuyển sang dark theme, và nó chỉ lộ
    ra khi in thật chứ không thấy trên màn hình.
  */
  html, body {
    background: #fff !important;
    color: #000 !important;
  }
  .screen-only { display: none !important; }
  .print-root { max-width: none; margin: 0; padding: 0; }
  .page {
    border: 0; margin: 0; padding: 0;
    aspect-ratio: auto; width: 100%; height: 100%;
    break-after: page; page-break-after: always;
  }
  .page:last-child { break-after: auto; page-break-after: auto; }
}
`
