import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { decodeRegions } from '@/core/codec/puzzle-format'
import { colorLabel } from '@/core/label-alphabet'
import type { PuzzleRecord } from '@/data/local-cache'
import { gunzip } from '@/data/compress'
import { loadBlobs, loadPuzzleRecord } from '@/data/local-cache'
import { vectorizeInWorker } from '@/data/vectorize-client'

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
      <main style={{ padding: 24 }}>
        <p role="alert" style={{ color: '#b91c1c' }}>
          {error}
        </p>
        <Link to="/library">Về thư viện</Link>
      </main>
    )
  }

  if (!ready) {
    return (
      <main style={{ padding: 24 }}>
        <p>Đang chuyển tranh sang dạng vector để in…</p>
        <p style={{ color: '#64748b', fontSize: 14 }}>
          Tranh nhiều vùng có thể mất vài chục giây.
        </p>
      </main>
    )
  }

  return (
    <>
      <style>{PRINT_CSS}</style>

      <main className="screen-only" style={{ maxWidth: 1000, margin: '0 auto', padding: 24, display: 'grid', gap: 16 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>In: {ready.rec.title}</h1>
          <Link to={`/play/${id}`}>Về màn tô</Link>
        </header>

        <fieldset style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 12 }}>
          <legend>Khổ in</legend>
          <label style={{ marginRight: 16 }}>
            <input
              type="radio"
              name="layout"
              checked={layout === 'one'}
              onChange={() => setLayout('one')}
            />{' '}
            Vừa 1 trang A4
          </label>
          <label>
            <input
              type="radio"
              name="layout"
              checked={layout === 'quad'}
              onChange={() => setLayout('quad')}
            />{' '}
            Chia 2×2 trang (to hơn, dán lại)
          </label>
        </fieldset>

        <label>
          <input
            type="checkbox"
            checked={withSolution}
            onChange={(e) => setWithSolution(e.target.checked)}
          />{' '}
          In kèm trang bản giải
        </label>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => window.print()}>
            In
          </button>
          <button type="button" onClick={() => download('outline')}>
            Tải SVG bản để tô
          </button>
          <button type="button" onClick={() => download('solution')}>
            Tải SVG bản giải
          </button>
        </div>

        <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
          Xem trước bên dưới đúng như khi in. Chia 2×2 có mép chồng {OVERLAP_MM}mm để dán lại
          không hở.
        </p>
      </main>

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
