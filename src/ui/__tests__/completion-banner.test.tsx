import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompletionBanner } from '@/ui/components/completion-banner'

describe('CompletionBanner (I9 — dialog aria-modal cần quản lý focus)', () => {
  it('focus tự động vào nút Đóng khi banner xuất hiện (aria-modal="true" mà focus đứng ngoài làm NVDA/JAWS không đọc được nội dung bên trong)', () => {
    render(<CompletionBanner originalUrl={null} onClose={vi.fn()} />)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /đóng/i }))
  })

  it('Escape gọi onClose', async () => {
    const onClose = vi.fn()
    render(<CompletionBanner originalUrl={null} onClose={onClose} />)

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('đóng (unmount) thì focus quay lại phần tử đã focus trước khi banner mở', () => {
    document.body.innerHTML = '<button id="opener">mở</button>'
    const opener = document.getElementById('opener') as HTMLButtonElement
    opener.focus()

    const { unmount } = render(<CompletionBanner originalUrl={null} onClose={vi.fn()} />)
    unmount()

    expect(document.activeElement).toBe(opener)
  })
})
