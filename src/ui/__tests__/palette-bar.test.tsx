import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaletteBar } from '@/ui/components/palette-bar'
import type { Rgb } from '@/core/types'

const palette: Rgb[] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
]

describe('PaletteBar', () => {
  it('hiện một nút cho mỗi màu, đánh số từ 1', () => {
    render(
      <PaletteBar palette={palette} remaining={new Uint32Array([3, 2, 1])} selected={null} onSelect={vi.fn()} />,
    )
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /màu 1/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /màu 3/i })).toBeTruthy()
  })

  it('hiện số vùng còn lại của từng màu', () => {
    render(
      <PaletteBar palette={palette} remaining={new Uint32Array([7, 2, 0])} selected={null} onSelect={vi.fn()} />,
    )
    expect(screen.getByRole('radio', { name: /màu 1/i }).textContent).toMatch(/7/)
  })

  it('bấm nút → gọi onSelect với colorIndex', async () => {
    const onSelect = vi.fn()
    render(
      <PaletteBar palette={palette} remaining={new Uint32Array([1, 1, 1])} selected={null} onSelect={onSelect} />,
    )
    await userEvent.click(screen.getByRole('radio', { name: /màu 2/i }))
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('màu đang chọn có aria-checked', () => {
    render(
      <PaletteBar palette={palette} remaining={new Uint32Array([1, 1, 1])} selected={1} onSelect={vi.fn()} />,
    )
    expect(screen.getByRole('radio', { name: /màu 2/i }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /màu 1/i }).getAttribute('aria-checked')).toBe('false')
  })

  it('màu đã tô xong bị DISABLED, không chỉ làm mờ', async () => {
    const onSelect = vi.fn()
    render(
      <PaletteBar palette={palette} remaining={new Uint32Array([1, 1, 0])} selected={null} onSelect={onSelect} />,
    )
    const done = screen.getByRole('radio', { name: /màu 3/i }) as HTMLButtonElement
    expect(done.disabled).toBe(true)

    await userEvent.click(done)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('nhãn của màu đã xong nói rõ là đã xong', () => {
    render(
      <PaletteBar palette={palette} remaining={new Uint32Array([1, 1, 0])} selected={null} onSelect={vi.fn()} />,
    )
    expect(screen.getByRole('radio', { name: /màu 3.*xong/i })).toBeTruthy()
  })

  it('nút thứ 11 trở đi hiện nhãn chữ trong cả text và aria-label', () => {
    const long: Rgb[] = Array.from({ length: 12 }, (_, i) => [i * 20, 100, 150] as Rgb)
    render(
      <PaletteBar
        palette={long}
        remaining={new Uint32Array(12).fill(1)}
        selected={null}
        onSelect={vi.fn()}
      />,
    )
    // colorIndex 10 ⇒ 'a', 11 ⇒ 'b'. Nhãn số hai chữ số không được xuất hiện.
    const a = screen.getByRole('radio', { name: /màu a, còn 1 vùng/i })
    expect(a.textContent).toMatch(/a/)
    expect(screen.getByRole('radio', { name: /màu b, còn 1 vùng/i })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: /màu 11/i })).toBeNull()
    expect(screen.queryByRole('radio', { name: /màu 12/i })).toBeNull()
  })

  it('có role radiogroup với nhãn', () => {
    render(
      <PaletteBar palette={palette} remaining={new Uint32Array([1, 1, 1])} selected={null} onSelect={vi.fn()} />,
    )
    expect(screen.getByRole('radiogroup', { name: /bảng màu/i })).toBeTruthy()
  })
})
