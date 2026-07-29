import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import App from '@/App'

/**
 * Nền app phải THẤY ĐƯỢC — và nó đã hai lần không thấy vì lý do CẤU TRÚC, không
 * phải vì màu sắc:
 *
 *  1. đặt trong từng route với `-z-10`, dựa vào việc nền `body` được propagate
 *     lên canvas; vỡ ngay khi một tổ tiên tạo stacking context (framer-motion
 *     tạo cái đó chỉ với một `transform` đang animate),
 *  2. lớp phủ trắng quá đậm (đã sửa riêng, có test trong decor.test.tsx).
 *
 * Những test dưới đây khoá phần CẤU TRÚC, thứ mà đọc code bằng mắt không bắt được.
 */
describe('nền ở gốc app', () => {
  it('render ảnh nền ngay ở gốc, không phụ thuộc route', () => {
    const { container } = render(<App />)
    const img = container.querySelector('img[src^="/decor/bg/"]')
    expect(img).not.toBeNull()
  })

  it('KHÔNG dùng z-index âm — đó là nguyên nhân lần đầu không thấy nền', () => {
    const { container } = render(<App />)
    const wrap = container.querySelector('img[src^="/decor/bg/"]')!.parentElement!
    expect(wrap.className).toContain('z-0')
    expect(wrap.className).not.toContain('-z-10')
  })

  /**
   * Nội dung phải là phần tử ĐƯỢC ĐỊNH VỊ với z-index CAO HƠN nền. Nếu nó là
   * phần tử tĩnh thường thì nền (`position: fixed`, `z-0`) sẽ vẽ ĐÈ LÊN nội dung
   * — sai theo hướng ngược lại.
   */
  it('nội dung nằm trong khối relative z-10, vẽ trên nền', () => {
    const { container } = render(<App />)
    const content = container.querySelector('div.relative.z-10')
    expect(content).not.toBeNull()
    expect(content!.querySelector('img[src^="/decor/bg/"]')).toBeNull()
  })

  it('nền bị ẩn khi in — nó nằm ngoài khối screen-only của /print', () => {
    const { container } = render(<App />)
    const wrap = container.querySelector('img[src^="/decor/bg/"]')!.parentElement!
    expect(wrap.className).toContain('print:hidden')
  })

  it('nền không ăn click và không lọt vào accessibility tree', () => {
    const { container } = render(<App />)
    const wrap = container.querySelector('img[src^="/decor/bg/"]')!.parentElement!
    expect(wrap.className).toContain('pointer-events-none')
    expect(wrap.getAttribute('aria-hidden')).toBe('true')
  })
})
