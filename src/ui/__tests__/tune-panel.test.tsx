import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TunePanel } from '@/ui/components/tune-panel'
import { MAX_LABELLED_COLORS } from '@/core/label-alphabet'
import { PRESETS } from '@/core/types'

const value = { preset: 'vua' as const, k: 12, targetRegions: 500, smoothing: 2 }

describe('TunePanel', () => {
  it('hiện đủ 4 preset gồm Ngang sách', () => {
    render(<TunePanel value={value} onChange={vi.fn()} disabled={false} />)
    expect(screen.getByRole('radio', { name: /dễ/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /vừa/i })).toBeTruthy()
    // /khó/i cũng khớp "Khó" trong bất kỳ nhãn nào chứa nó — dùng getAllBy để
    // chắc chắn chỉ có đúng một, tránh test xanh giả nếu thêm nhãn trùng
    expect(screen.getAllByRole('radio', { name: /khó/i })).toHaveLength(1)
    expect(screen.getByRole('radio', { name: /ngang sách/i })).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(4)
  })

  it('chọn Ngang sách áp k 30 và 4500 vùng', async () => {
    const onChange = vi.fn()
    render(<TunePanel value={value} onChange={onChange} disabled={false} />)

    await userEvent.click(screen.getByRole('radio', { name: /ngang sách/i }))
    expect(onChange).toHaveBeenCalledWith({
      preset: 'sach',
      k: 30,
      targetRegions: 4500,
      smoothing: 2,
    })
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

  it('trần slider khớp spec §22', () => {
    render(<TunePanel value={value} onChange={vi.fn()} disabled={false} />)
    const mau = screen.getByLabelText(/số màu/i)
    expect(mau.getAttribute('min')).toBe('6')
    expect(mau.getAttribute('max')).toBe('30')

    const chiTiet = screen.getByLabelText(/độ chi tiết/i)
    expect(chiTiet.getAttribute('min')).toBe('200')
    expect(chiTiet.getAttribute('max')).toBe('6000')
  })

  // Nếu trần slider vượt bảng nhãn thì colorLabel() sẽ throw giữa lúc vẽ, và
  // lỗi nổ trong requestAnimationFrame — rất xa chỗ người dùng kéo slider.
  it('trần số màu không vượt bảng nhãn', () => {
    render(<TunePanel value={value} onChange={vi.fn()} disabled={false} />)
    const max = Number(screen.getByLabelText(/số màu/i).getAttribute('max'))
    expect(max).toBeLessThanOrEqual(MAX_LABELLED_COLORS)
  })

  it('disabled thì mọi điều khiển bị vô hiệu', () => {
    render(<TunePanel value={value} onChange={vi.fn()} disabled />)
    expect((screen.getByLabelText(/số màu/i) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('radio', { name: /dễ/i }) as HTMLInputElement).disabled).toBe(true)
  })
})
