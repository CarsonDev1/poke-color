import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { AmbientBackground, CelebrationBurst, FloatingAccents } from '@/ui/components/decor'

/** mọi ảnh trang trí trong document, kể cả cái đang ẩn */
const decorImgs = (): HTMLImageElement[] =>
  Array.from(document.querySelectorAll('img[src^="/decor/"]'))

describe('AmbientBackground', () => {
  it('render một ảnh nền từ manifest', () => {
    render(<AmbientBackground seed="library" />)
    expect(decorImgs().length).toBe(1)
    expect(decorImgs()[0].getAttribute('src')).toMatch(/^\/decor\/bg\//)
  })

  /**
   * Cùng seed PHẢI ra cùng ảnh. Nếu dùng Math.random thì mỗi lần re-render (đổi
   * state, resize, StrictMode mount kép) sẽ đổi ảnh nền — nền nhấp nháy liên tục.
   */
  it('cùng seed ⇒ cùng ảnh (ổn định, không random)', () => {
    const { unmount } = render(<AmbientBackground seed="library" />)
    const first = decorImgs()[0].getAttribute('src')
    unmount()
    render(<AmbientBackground seed="library" />)
    expect(decorImgs()[0].getAttribute('src')).toBe(first)
  })

  it('seed khác ⇒ có thể ra ảnh khác (không phải hằng số cứng)', () => {
    const seen = new Set<string>()
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const { unmount } = render(<AmbientBackground seed={seed} />)
      seen.add(decorImgs()[0].getAttribute('src') ?? '')
      unmount()
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  /**
   * Ảnh CÓ được commit, nhưng nhánh này vẫn cần: một file thiếu hoặc hỏng (hoặc
   * ai đổi danh sách asset mà chưa chạy lại build_decor.py) sẽ làm trình duyệt
   * hiện icon ảnh vỡ giữa trang — tệ hơn hẳn việc không có trang trí.
   */
  it('ảnh 404 ⇒ TỰ ẨN hoàn toàn, không để lại icon ảnh vỡ', () => {
    render(<AmbientBackground seed="library" />)
    const img = decorImgs()[0]
    fireEvent.error(img)
    expect(decorImgs().length).toBe(0)
  })

  it('thuần trang trí: aria-hidden và không ăn click', () => {
    const { container } = render(<AmbientBackground seed="library" />)
    const wrap = container.querySelector('[aria-hidden]')
    expect(wrap).not.toBeNull()
    expect(wrap!.className).toContain('pointer-events-none')
  })

  it('không có role/nhãn nào lọt vào accessibility tree', () => {
    render(<AmbientBackground seed="library" />)
    // ảnh trang trí phải có alt rỗng
    expect(decorImgs()[0].getAttribute('alt')).toBe('')
  })
})

describe('FloatingAccents', () => {
  it('render đúng số icon yêu cầu', () => {
    render(<FloatingAccents seed="x" count={4} />)
    expect(decorImgs().length).toBe(4)
  })

  it('count 0 ⇒ không render gì', () => {
    render(<FloatingAccents seed="x" count={0} />)
    expect(decorImgs().length).toBe(0)
  })

  it('một ảnh lỗi ⇒ ẩn CẢ nhóm, không để lại vài icon vỡ lẫn icon lành', () => {
    render(<FloatingAccents seed="x" count={4} />)
    fireEvent.error(decorImgs()[0])
    expect(decorImgs().length).toBe(0)
  })

  it('vị trí ổn định theo seed', () => {
    const { unmount } = render(<FloatingAccents seed="same" count={3} />)
    const before = decorImgs().map((i) => (i as HTMLElement).style.left)
    unmount()
    render(<FloatingAccents seed="same" count={3} />)
    expect(decorImgs().map((i) => (i as HTMLElement).style.left)).toEqual(before)
  })
})

describe('CelebrationBurst', () => {
  it('running=false ⇒ không render gì', () => {
    render(<CelebrationBurst running={false} />)
    expect(decorImgs().length).toBe(0)
  })

  it('running=true ⇒ bung nhiều mảnh', () => {
    render(<CelebrationBurst running />)
    expect(decorImgs().length).toBeGreaterThan(8)
  })

  it('ảnh lỗi ⇒ ẩn hết', () => {
    render(<CelebrationBurst running />)
    fireEvent.error(decorImgs()[0])
    expect(decorImgs().length).toBe(0)
  })

  it('aria-hidden — không thông báo gì cho trình đọc màn hình', () => {
    const { container } = render(<CelebrationBurst running />)
    expect(container.querySelector('[aria-hidden]')).not.toBeNull()
  })

  /** Không tự tắt thì hiệu ứng đứng mãi che bức tranh người chơi vừa hoàn thành. */
  it('gọi onDone để bên gọi tắt hiệu ứng', async () => {
    let done = false
    render(<CelebrationBurst running onDone={() => (done = true)} />)
    await new Promise((r) => setTimeout(r, 1900))
    expect(done).toBe(true)
  }, 5000)
})
