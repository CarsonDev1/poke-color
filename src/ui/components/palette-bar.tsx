import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { colorLabel } from '@/core/label-alphabet'
import type { Rgb } from '@/core/types'
import { cn } from '@/lib/utils'
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
    /*
      Cuộn NGANG, không wrap xuống nhiều dòng: với 30 màu thì wrap tạo ra một
      khối cao 3–4 hàng chiếm gần nửa màn hình điện thoại. Một dải cuộn ngang giữ
      chiều cao cố định và vẫn tới được mọi màu.
    */
    <div
      role="radiogroup"
      aria-label="Bảng màu"
      className="flex gap-2 overflow-x-auto px-3 py-3 [scrollbar-width:thin]"
    >
      {palette.map((c, i) => {
        const left = remaining[i] ?? 0
        const done = left === 0
        const active = selected === i
        // một biến cho cả aria-label và text hiển thị: hai chỗ không thể lệch
        const label = colorLabel(i)

        return (
          <motion.button
            key={i}
            type="button"
            role="radio"
            aria-checked={active}
            // nút bị disabled THẬT, không chỉ mờ: chọn được một màu đã xong rồi
            // bấm khắp tranh mà không gì xảy ra trông như app hỏng
            disabled={done}
            aria-label={done ? `Màu ${label}, đã tô xong` : `Màu ${label}, còn ${left} vùng`}
            onClick={() => onSelect(i)}
            whileTap={done ? undefined : { scale: 0.92 }}
            animate={active ? { y: -6 } : { y: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            className={cn(
              'relative flex h-16 w-14 shrink-0 flex-col items-center justify-center gap-1',
              'rounded-2xl border-2 transition-colors',
              active
                ? 'border-neon-600 bg-white shadow-glow'
                : 'border-slate-300 bg-white/70 hover:border-slate-400',
              done && 'opacity-40',
            )}
          >
            <span
              aria-hidden
              className="h-6 w-8 rounded-md border border-black/25"
              style={{ background: rgbCss(c) }}
            />
            {/*
              Nhãn để mono + tabular: nhãn chữ-số có bề rộng rất khác nhau
              (`1` so với `m`), nên font tỉ lệ làm các nút trông xô lệch.
            */}
            <span className="font-mono text-[13px] font-bold leading-none text-slate-900">
              {label}
            </span>
            <span className="text-[10px] leading-none text-slate-500">
              {done ? <Check size={11} className="text-sun-600" /> : left}
            </span>

            {/* vòng sáng chạy quanh màu đang chọn */}
            {active && (
              <motion.span
                layoutId="palette-ring"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="pointer-events-none absolute -inset-0.5 rounded-2xl ring-2 ring-neon-400"
              />
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
