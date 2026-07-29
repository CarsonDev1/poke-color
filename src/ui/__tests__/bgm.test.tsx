import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { BackgroundMusic, BGM_STORAGE_KEY, BGM_VIDEO_ID, useBgmEnabled } from '@/ui/components/bgm'

const iframes = (): HTMLIFrameElement[] =>
  Array.from(document.querySelectorAll('iframe[title="Nhạc nền"]'))

beforeEach(() => {
  localStorage.clear()
})

describe('BackgroundMusic', () => {
  it('enabled=false ⇒ KHÔNG chèn iframe (dừng nhạc bằng cách gỡ hẳn)', async () => {
    render(<BackgroundMusic enabled={false} />)
    await new Promise((r) => setTimeout(r, 10))
    expect(iframes()).toHaveLength(0)
  })

  it('enabled=true ⇒ chèn iframe YouTube', async () => {
    render(<BackgroundMusic enabled />)
    await waitFor(() => expect(iframes()).toHaveLength(1))
    expect(iframes()[0].src).toContain(BGM_VIDEO_ID)
  })

  /**
   * `loop=1` MỘT MÌNH không lặp video đơn — YouTube bắt buộc kèm
   * `playlist=<cùng id>`. Thiếu là nhạc phát một lần rồi im, đúng thứ người dùng
   * KHÔNG muốn.
   */
  it('có CẢ loop=1 VÀ playlist=<id> — thiếu playlist là không lặp', async () => {
    render(<BackgroundMusic enabled />)
    await waitFor(() => expect(iframes()).toHaveLength(1))
    const url = new URL(iframes()[0].src)
    expect(url.searchParams.get('loop')).toBe('1')
    expect(url.searchParams.get('playlist')).toBe(BGM_VIDEO_ID)
  })

  it('autoplay=1 và allow="autoplay" — thiếu attribute allow thì iframe bị chặn tiếng', async () => {
    render(<BackgroundMusic enabled />)
    await waitFor(() => expect(iframes()).toHaveLength(1))
    expect(new URL(iframes()[0].src).searchParams.get('autoplay')).toBe('1')
    expect(iframes()[0].getAttribute('allow')).toContain('autoplay')
  })

  it('KHÔNG mute — cả điểm của tính năng là để nghe', async () => {
    render(<BackgroundMusic enabled />)
    await waitFor(() => expect(iframes()).toHaveLength(1))
    expect(new URL(iframes()[0].src).searchParams.get('mute')).toBeNull()
  })

  it('ẩn hình: không controls, không nhận focus, không ăn click', async () => {
    render(<BackgroundMusic enabled />)
    await waitFor(() => expect(iframes()).toHaveLength(1))
    const f = iframes()[0]
    expect(new URL(f.src).searchParams.get('controls')).toBe('0')
    expect(f.getAttribute('tabindex')).toBe('-1')
    expect(f.getAttribute('aria-hidden')).toBe('true')
    expect(f.className).toContain('pointer-events-none')
  })

  /**
   * `display: none` khiến Chrome coi iframe là không render và CHẶN phát media.
   * Phải ẩn bằng kích thước 1px + opacity, giữ nó trong luồng layout.
   */
  it('KHÔNG dùng display:none để ẩn (Chrome chặn media trong iframe display:none)', async () => {
    render(<BackgroundMusic enabled />)
    await waitFor(() => expect(iframes()).toHaveLength(1))
    const cls = iframes()[0].className
    expect(cls).not.toContain('hidden')
    expect(cls).toContain('opacity-0')
  })

  it('gỡ component ⇒ iframe biến mất (nhạc dừng khi rời màn tô)', async () => {
    const { unmount } = render(<BackgroundMusic enabled />)
    await waitFor(() => expect(iframes()).toHaveLength(1))
    unmount()
    expect(iframes()).toHaveLength(0)
  })

  it('dùng youtube-nocookie để không set cookie theo dõi', async () => {
    render(<BackgroundMusic enabled />)
    await waitFor(() => expect(iframes()).toHaveLength(1))
    expect(iframes()[0].src).toContain('youtube-nocookie.com')
  })
})

describe('useBgmEnabled', () => {
  function Probe() {
    const [on, set] = useBgmEnabled()
    return (
      <button type="button" onClick={() => set(!on)}>
        {on ? 'on' : 'off'}
      </button>
    )
  }

  it('mặc định BẬT khi chưa có gì trong localStorage', () => {
    const { container } = render(<Probe />)
    expect(container.querySelector('button')!.textContent).toBe('on')
  })

  it('ghi nhớ lựa chọn vào localStorage', () => {
    const { container } = render(<Probe />)
    act(() => container.querySelector('button')!.click())
    expect(container.querySelector('button')!.textContent).toBe('off')
    expect(localStorage.getItem(BGM_STORAGE_KEY)).toBe('0')
  })

  it('đọc lại trạng thái đã lưu khi mount lần sau', () => {
    localStorage.setItem(BGM_STORAGE_KEY, '0')
    const { container } = render(<Probe />)
    expect(container.querySelector('button')!.textContent).toBe('off')
  })
})
