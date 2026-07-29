// Vitest ở đây chạy KHÔNG bật `test.globals` (mọi file test tự import
// `describe`/`it`/`expect` từ 'vitest'), nên cơ chế auto-cleanup của
// `@testing-library/react` — vốn chỉ tự đăng ký khi phát hiện `afterEach` là
// một biến TOÀN CỤC — không kích hoạt. Thiếu dọn dẹp thì các test gọi
// render() nhiều lần trong cùng file sẽ chồng DOM lên nhau: getByLabelText
// khớp phải nhiều node từ những lần render trước đó chưa được unmount.
// Đây KHÔNG phải jest-dom (không thêm matcher nào) — chỉ đăng ký cleanup thủ công.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

/**
 * jsdom KHÔNG có ResizeObserver, và `/play` dùng nó để đo chỗ trống cho canvas.
 * Thiếu nó thì effect ném `ReferenceError` và CẢ màn chơi không render — mọi
 * truy vấn sau đó fail với "unable to find role", một thông báo không hề chỉ tới
 * nguyên nhân thật.
 *
 * Stub không cần bắn callback: component tự gọi `measure()` một lần trước khi
 * `observe`, nên kích thước ban đầu vẫn có (jsdom trả 0 cho mọi phép đo, và code
 * đã kẹp bằng giá trị tối thiểu). Đây là polyfill cho môi trường TEST — mọi
 * browser mà app nhắm tới đều có ResizeObserver.
 */
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub
}
