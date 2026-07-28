import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TunePanel } from '@/ui/components/tune-panel'
import { PRESETS } from '@/core/types'

const value = { preset: 'vua' as const, k: 12, targetRegions: 500, smoothing: 2 }

describe('TunePanel', () => {
  it('hiện đủ 3 preset', () => {
    render(<TunePanel value={value} onChange={vi.fn()} disabled={false} />)
    expect(screen.getByRole('radio', { name: /dễ/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /vừa/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /khó/i })).toBeTruthy()
  })

  it('chọn preset Khó → áp k và targetRegions của preset đó', async () => {
    const onChange = vi.fn()
    render(<TunePanel value={value} onChange={onChange} disabled={false} />)

    await userEvent.click(screen.getByRole('radio', { name: /khó/i }))
    expect(onChange).toHaveBeenCalledWith({
      preset: 'kho',
      k: PRESETS.kho.k,
      targetRegions: PRESETS.kho.targetRegions,
      smoothing: 2,
    })
  })

  it('kéo slider số màu → preset chuyển sang tuỳ chỉnh', async () => {
    const onChange = vi.fn()
    render(<TunePanel value={value} onChange={onChange} disabled={false} />)

    const slider = screen.getByLabelText(/số màu/i)
    // input[type=range] không phải phần tử "editable" theo user-event (chỉ
    // text/number/email/... mới được clear()/type()), nên mô phỏng việc kéo
    // slider bằng fireEvent.change thay vì clear+type.
    fireEvent.change(slider, { target: { value: '16' } })

    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(last.preset).toBe('tuy-chinh')
  })

  it('slider số màu giới hạn 6..24', () => {
    render(<TunePanel value={value} onChange={vi.fn()} disabled={false} />)
    const slider = screen.getByLabelText(/số màu/i)
    expect(slider.getAttribute('min')).toBe('6')
    expect(slider.getAttribute('max')).toBe('24')
  })

  it('disabled thì mọi điều khiển bị vô hiệu', () => {
    render(<TunePanel value={value} onChange={vi.fn()} disabled />)
    expect((screen.getByLabelText(/số màu/i) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('radio', { name: /dễ/i }) as HTMLInputElement).disabled).toBe(true)
  })
})
