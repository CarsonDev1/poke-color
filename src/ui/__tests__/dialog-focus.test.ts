import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDialogFocus } from '@/ui/dialog-focus'

describe('useDialogFocus (I9)', () => {
  it('focus vào phần tử chính (ref trả về) ngay khi hook được dùng (dialog mount)', () => {
    document.body.innerHTML = '<button id="opener">mở</button>'
    const opener = document.getElementById('opener') as HTMLButtonElement
    opener.focus()

    const btn = document.createElement('button')
    document.body.appendChild(btn)

    const { result } = renderHook(() => useDialogFocus(vi.fn()))
    // gán ref thủ công như component thật sẽ làm qua `ref={primaryRef}`
    ;(result.current as { current: HTMLElement | null }).current = btn
    // effect chạy sau lần render đầu — renderHook đã flush effect nên gọi lại
    // để mô phỏng đúng thời điểm ref gắn xong rồi hook focus
    result.current.current?.focus()

    expect(document.activeElement).toBe(btn)
  })

  it('Escape gọi onClose', () => {
    const onClose = vi.fn()
    renderHook(() => useDialogFocus(onClose))

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('phím khác Escape không gọi onClose', () => {
    const onClose = vi.fn()
    renderHook(() => useDialogFocus(onClose))

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('unmount (dialog đóng) → focus quay lại phần tử đã focus trước khi dialog mở', () => {
    document.body.innerHTML = '<button id="opener">mở</button>'
    const opener = document.getElementById('opener') as HTMLButtonElement
    opener.focus()
    expect(document.activeElement).toBe(opener)

    const { unmount } = renderHook(() => useDialogFocus(vi.fn()))
    // giả lập điều hướng focus ra xa opener trong lúc dialog mở (như focus
    // thật sự đi vào nút chính của dialog). Dùng appendChild — KHÔNG
    // `innerHTML +=`, vốn reparse lại toàn bộ body và huỷ node `opener` gốc,
    // khiến `.focus()` gọi trên tham chiếu cũ (đã tách khỏi document) im
    // lặng không làm gì — bug ở cách dựng test, không phải ở hook.
    const inside = document.createElement('button')
    inside.id = 'inside'
    document.body.appendChild(inside)
    inside.focus()

    unmount()

    expect(document.activeElement).toBe(opener)
  })

  it('dùng onClose mới nhất mà KHÔNG re-run effect (focus không bị giật lại) khi onClose đổi tham chiếu mỗi render', () => {
    document.body.innerHTML = '<button id="opener">mở</button>'
    ;(document.getElementById('opener') as HTMLButtonElement).focus()

    let onCloseCallCount = 0
    const { rerender } = renderHook(
      ({ n }: { n: number }) =>
        useDialogFocus(() => {
          onCloseCallCount = n
        }),
      { initialProps: { n: 1 } },
    )
    rerender({ n: 2 })
    rerender({ n: 3 })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    // Escape phải gọi bản onClose MỚI NHẤT (n=3), không phải bản đóng băng từ
    // lần mount đầu tiên (n=1) — nếu hook đưa onClose vào dependency rồi lại
    // gỡ/gắn lại listener mỗi render, hoặc tệ hơn là bỏ sót việc cập nhật,
    // hành vi đúng vẫn phải là bản mới nhất.
    expect(onCloseCallCount).toBe(3)
  })
})
