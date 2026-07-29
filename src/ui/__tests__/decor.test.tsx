import { describe, expect, it } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { AmbientBackground, BG_ROTATE_MS } from '@/ui/components/decor'

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

  /**
   * Yêu cầu: đổi nền mỗi 5 phút. Test dùng `rotateMs` ngắn để không phải chờ —
   * nhưng vẫn đi qua ĐÚNG đường code của bản thật (setInterval), không mock.
   */
  it('tự đổi ảnh sau mỗi chu kỳ rotateMs', async () => {
    render(<AmbientBackground seed="library" rotateMs={40} />)
    const first = decorImgs()[0].getAttribute('src')
    await waitFor(
      () => expect(decorImgs().some((i) => i.getAttribute('src') !== first)).toBe(true),
      { timeout: 1500 },
    )
  })

  it('mặc định đúng 5 phút', () => {
    expect(BG_ROTATE_MS).toBe(5 * 60 * 1000)
  })

  it('lớp phủ là TRẮNG (light mode), không phải tối', () => {
    const { container } = render(<AmbientBackground seed="library" />)
    const overlay = container.querySelector('.absolute.inset-0:not(img)')
    expect(overlay?.className).toContain('white')
  })

  /**
   * Bản đầu tôi đặt opacity 0.22 + blur-2xl + phủ 75–95% nên ảnh gần như vô hình
   * — mất hẳn thứ nó tồn tại để làm. Test này khoá lại việc ảnh phải HIỆN RÕ.
   */
  it('ảnh KHÔNG bị làm mờ/nhạt tới mức vô hình', () => {
    render(<AmbientBackground seed="library" />)
    const cls = decorImgs()[0].className
    expect(cls).not.toContain('blur-2xl')
    expect(cls).not.toContain('blur-xl')
    expect(cls).not.toMatch(/opacity-\[0\.[012]/)
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
