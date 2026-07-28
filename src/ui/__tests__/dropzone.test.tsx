import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dropzone } from '@/ui/components/dropzone'

function pngFile(name = 'a.png', size = 100): File {
  const f = new File([new Uint8Array(size)], name, { type: 'image/png' })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('Dropzone', () => {
  it('hiện hướng dẫn bằng tiếng Việt', () => {
    render(<Dropzone onFile={vi.fn()} error={null} />)
    expect(screen.getByText(/chọn ảnh|kéo ảnh/i)).toBeTruthy()
  })

  it('chọn file hợp lệ → gọi onFile', async () => {
    const onFile = vi.fn()
    render(<Dropzone onFile={onFile} error={null} />)

    await userEvent.upload(screen.getByLabelText(/chọn ảnh/i), pngFile())
    expect(onFile).toHaveBeenCalledTimes(1)
  })

  it('file HEIC → KHÔNG gọi onFile, hiện lỗi hướng dẫn chuyển định dạng', async () => {
    const onFile = vi.fn()
    render(<Dropzone onFile={onFile} error={null} />)

    const heic = new File([new Uint8Array(10)], 'IMG.HEIC', { type: '' })
    // Input có `accept="image/png,image/jpeg,image/webp"` để gợi ý dialog hệ
    // điều hành; mặc định user-event mô phỏng đúng việc dialog đó LỌC BỎ file
    // không khớp accept trước khi bắn sự kiện change (isAcceptableFile trong
    // upload.js), nên file HEIC sẽ không bao giờ tới tay app. Nhưng trên thực
    // tế người dùng vẫn đưa được HEIC vào (mục "All files", hoặc kéo-thả —
    // kéo-thả bỏ qua accept hoàn toàn), nên validateUpload vẫn phải xử lý
    // đúng trường hợp này. Tắt applyAccept để test được đường validate của
    // chính app thay vì hành vi lọc của dialog trình duyệt.
    const user = userEvent.setup({ applyAccept: false })
    await user.upload(screen.getByLabelText(/chọn ảnh/i), heic)

    expect(onFile).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/HEIC/i)
  })

  it('file quá lớn → hiện lỗi nêu 15 MB', async () => {
    const onFile = vi.fn()
    render(<Dropzone onFile={onFile} error={null} />)

    await userEvent.upload(screen.getByLabelText(/chọn ảnh/i), pngFile('big.png', 16 * 1024 * 1024))
    expect(onFile).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/15/)
  })

  it('lỗi truyền từ ngoài vào được hiện ra', () => {
    render(<Dropzone onFile={vi.fn()} error="Vỡ ở bước Gộp vùng vụn" />)
    expect(screen.getByRole('alert').textContent).toMatch(/Gộp vùng vụn/)
  })

  it('I8: input chọn ảnh nằm trong tab order — người dùng chỉ dùng bàn phím tới được được nó', async () => {
    render(<Dropzone onFile={vi.fn()} error={null} />)
    const input = screen.getByLabelText(/chọn ảnh/i)

    // `display: none` (và `visibility: hidden`) loại phần tử khỏi cả tab
    // order lẫn accessibility tree. `<label>` không tự nhận focus, nên nếu
    // input bị loại, không có cách nào mở được dialog chọn file bằng bàn
    // phím — không thể tạo puzzle nào. `input.focus()` trực tiếp KHÔNG bắt
    // được lỗi này: jsdom không mô phỏng việc trình duyệt từ chối focus lập
    // trình trên phần tử display:none, nhưng thuật toán tính tab order riêng
    // của user-event (bắt buộc vì jsdom không có Tab điều hướng gốc) thì có
    // — đây là lý do dùng `userEvent.tab()` thay vì gọi `.focus()` thẳng.
    await userEvent.tab()
    expect(document.activeElement).toBe(input)
  })

  it('chọn được file hợp lệ sau khi có lỗi cũ → lỗi cũ không còn hiện nữa', async () => {
    const onFile = vi.fn()
    render(<Dropzone onFile={onFile} error="Vỡ ở bước Gộp vùng vụn" />)
    expect(screen.getByRole('alert')).toBeTruthy()

    await userEvent.upload(screen.getByLabelText(/chọn ảnh/i), pngFile())

    expect(onFile).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
