// Vitest ở đây chạy KHÔNG bật `test.globals` (mọi file test tự import
// `describe`/`it`/`expect` từ 'vitest'), nên cơ chế auto-cleanup của
// `@testing-library/react` — vốn chỉ tự đăng ký khi phát hiện `afterEach` là
// một biến TOÀN CỤC — không kích hoạt. Thiếu dọn dẹp thì các test gọi
// render() nhiều lần trong cùng file sẽ chồng DOM lên nhau: getByLabelText
// khớp phải nhiều node từ những lần render trước đó chưa được unmount.
// Đây KHÔNG phải jest-dom (không thêm matcher nào) — chỉ đăng ký cleanup thủ công.
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { setSupabaseForTests } from '@/data/supabase'

afterEach(() => {
  cleanup()
})

/**
 * CHẶN MỌI TEST GỌI MẠNG THẬT.
 *
 * Vitest dùng cơ chế nạp `.env` của Vite, nên `import.meta.env.VITE_SUPABASE_URL`
 * CÓ GIÁ TRỊ THẬT trong test. Không chặn thì `getSupabase()` tạo client thật và
 * test gọi thẳng vào Supabase production — đã xảy ra: một lượt chạy suite kéo 3
 * puzzle thật vào test khiến assertion "1 thẻ" nhận 2, và tệ hơn là
 * `syncProgress` UPSERT tiến độ trở lại production. Lần đó không mất dữ liệu chỉ
 * vì OR-merge luỹ đẳng nên ghi lại đúng giá trị cũ — thuần may mắn.
 *
 * Client giả này trả về RỖNG cho mọi thứ. Test nào cần hành vi khác thì tự gọi
 * `setSupabaseForTests` với client riêng — nó ghi đè cái này.
 */
function offlineClient(): never {
  const empty = { data: null, error: null }
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'order', 'limit', 'is']) {
    builder[m] = () => builder
  }
  builder.maybeSingle = () => Promise.resolve(empty)
  builder.single = () => Promise.resolve(empty)
  builder.then = undefined
  builder.upsert = () => Promise.resolve({ error: null })
  builder.insert = () => Promise.resolve({ error: null })
  builder.update = () => builder
  builder.delete = () => builder

  return {
    from: () => builder,
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ error: null }),
        download: () => Promise.resolve({ data: null, error: { message: 'offline trong test' } }),
        list: () => Promise.resolve({ data: [], error: null }),
      }),
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  } as never
}

// `beforeEach` chứ không phải một lần duy nhất: một test có thể tiêm client
// riêng, và nếu không đặt lại thì client đó rò rỉ sang những test sau nó.
beforeEach(() => {
  setSupabaseForTests(offlineClient())
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
