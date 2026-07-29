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
    <div style={{ display: 'grid', gap: 16 }}>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 8 }}>Độ khó</legend>
        <div style={{ display: 'flex', gap: 12 }}>
          {(Object.keys(PRESETS) as PresetName[]).map((p) => (
            <label key={p} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="preset"
                disabled={disabled}
                checked={value.preset === p}
                onChange={() => pickPreset(p)}
              />
              {PRESET_LABELS[p]}
              <span style={{ color: '#64748b', fontSize: 13 }}>
                ({PRESETS[p].k} màu · ~{PRESETS[p].targetRegions} vùng)
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label style={{ display: 'grid', gap: 4 }}>
        Số màu: {value.k}
        <input
          aria-label="Số màu"
          type="range"
          min={6}
          max={24}
          step={1}
          disabled={disabled}
          value={value.k}
          onChange={(e) => tweak({ k: Number(e.target.value) })}
        />
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        Độ chi tiết: ~{value.targetRegions} vùng
        <input
          aria-label="Độ chi tiết"
          type="range"
          min={50}
          max={2000}
          step={50}
          disabled={disabled}
          value={value.targetRegions}
          onChange={(e) => tweak({ targetRegions: Number(e.target.value) })}
        />
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        Làm phẳng: {value.smoothing} lượt
        <input
          aria-label="Làm phẳng"
          type="range"
          min={0}
          max={3}
          step={1}
          disabled={disabled}
          value={value.smoothing}
          onChange={(e) => tweak({ smoothing: Number(e.target.value) })}
        />
      </label>
    </div>
  )
}
