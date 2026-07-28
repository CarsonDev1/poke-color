import type { Rgb } from '@/core/types'
import { rgbCss } from '@/render/layers'

export function PaletteBar({
  palette,
  remaining,
  selected,
  onSelect,
}: {
  palette: Rgb[]
  remaining: Uint32Array
  selected: number | null
  onSelect: (i: number) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Bảng màu"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 8 }}
    >
      {palette.map((c, i) => {
        const left = remaining[i] ?? 0
        const done = left === 0
        const active = selected === i
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={active}
            // nút bị disabled thật, không chỉ mờ: chọn được một màu đã xong
            // rồi bấm khắp tranh mà không gì xảy ra trông như app hỏng
            disabled={done}
            aria-label={done ? `Màu ${i + 1}, đã tô xong` : `Màu ${i + 1}, còn ${left} vùng`}
            onClick={() => onSelect(i)}
            style={{
              width: 52,
              padding: 4,
              borderRadius: 8,
              border: active ? '3px solid #111827' : '1px solid #cbd5e1',
              background: '#fff',
              opacity: done ? 0.4 : 1,
              cursor: done ? 'default' : 'pointer',
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'block',
                height: 26,
                borderRadius: 4,
                background: rgbCss(c),
                border: '1px solid rgba(0,0,0,.15)',
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
            <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>
              {done ? '✓' : left}
            </span>
          </button>
        )
      })}
    </div>
  )
}
