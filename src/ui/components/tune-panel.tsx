import { MAX_LABELLED_COLORS } from '@/core/label-alphabet'
import { cn } from '@/lib/utils'
import { PRESETS, type PresetName } from '@/core/types'

export interface TuneValue {
  preset: PresetName | 'tuy-chinh'
  k: number
  targetRegions: number
  smoothing: number
}

const PRESET_LABELS: Record<PresetName, string> = {
  de: 'Dễ',
  vua: 'Vừa',
  kho: 'Khó',
  sach: 'Ngang sách',
}

export function TunePanel({
  value,
  onChange,
  disabled,
}: {
  value: TuneValue
  onChange: (v: TuneValue) => void
  disabled: boolean
}) {
  const pickPreset = (p: PresetName): void => {
    onChange({ preset: p, k: PRESETS[p].k, targetRegions: PRESETS[p].targetRegions, smoothing: value.smoothing })
  }

  // mọi thay đổi bằng slider đều chuyển preset sang 'tuy-chinh' để UI không
  // nói dối là đang ở preset trong khi tham số đã lệch
  const tweak = (patch: Partial<TuneValue>): void => {
    onChange({ ...value, ...patch, preset: 'tuy-chinh' })
  }

  return (
    <div className="grid gap-5">
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 text-sm font-bold text-white">Độ khó</legend>
        {/*
          Preset là các thẻ bấm được, không phải radio tí xíu cạnh chữ: đây là lựa
          chọn quan trọng nhất trên màn này và vùng bấm phải đủ lớn cho ngón tay.
          Vẫn là `<input type="radio">` thật bên dưới (chỉ ẩn về mặt hình ảnh) nên
          bàn phím và screen reader không mất gì.
        */}
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(PRESETS) as PresetName[]).map((p) => {
            const active = value.preset === p
            return (
              <label
                key={p}
                className={cn(
                  'cursor-pointer rounded-xl border-2 p-2.5 transition-colors',
                  active
                    ? 'border-neon-400 bg-neon-500/12'
                    : 'border-ink-700 bg-ink-950/40 hover:border-ink-600',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <input
                  type="radio"
                  name="preset"
                  disabled={disabled}
                  checked={active}
                  onChange={() => pickPreset(p)}
                  className="sr-only"
                />
                <span className="block text-sm font-bold text-white">{PRESET_LABELS[p]}</span>
                <span className="block text-[11px] text-ink-400">
                  {PRESETS[p].k} màu · ~{PRESETS[p].targetRegions} vùng
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <Slider
        label="Số màu"
        value={value.k}
        min={6}
        max={MAX_LABELLED_COLORS}
        step={1}
        disabled={disabled}
        onChange={(k) => tweak({ k })}
      />

      <Slider
        label="Độ chi tiết"
        value={value.targetRegions}
        suffix=" vùng"
        min={200}
        max={6000}
        step={100}
        disabled={disabled}
        onChange={(targetRegions) => tweak({ targetRegions })}
      />

      <Slider
        label="Làm phẳng"
        value={value.smoothing}
        suffix=" lượt"
        min={0}
        max={3}
        step={1}
        disabled={disabled}
        onChange={(smoothing) => tweak({ smoothing })}
      />
    </div>
  )
}

/**
 * Slider có nhãn và giá trị hiện ngay cạnh.
 *
 * `accent-color` để thumb và track dùng màu nhấn của app mà không phải tự vẽ lại
 * toàn bộ slider bằng CSS — tự vẽ thì mỗi engine một kiểu và rất dễ mất khả năng
 * điều khiển bằng bàn phím.
 */
function Slider({
  label,
  value,
  min,
  max,
  step,
  disabled,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  disabled: boolean
  suffix?: string
  onChange: (v: number) => void
}) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-baseline justify-between text-sm font-semibold text-ink-200">
        {label}
        <span className="font-mono text-xs text-aqua-400">
          {value}
          {suffix}
        </span>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-700 accent-neon-500 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  )
}
