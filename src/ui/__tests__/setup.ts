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
