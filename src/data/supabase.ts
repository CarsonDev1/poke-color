import type { SupabaseClient } from '@supabase/supabase-js'

export interface SupabaseConfig {
  url: string
  publishableKey: string
}

/**
 * Đọc và KIỂM TRA cấu hình từ env.
 *
 * Kiểm tường minh thay vì để `createClient(undefined, undefined)` đi qua: client
 * hỏng kiểu đó chỉ lỗi lúc gọi request đầu tiên, và thông báo lúc đó là
 * "Failed to fetch" — không hề chỉ ra rằng thiếu biến môi trường.
 */
export function readSupabaseConfig(env: Record<string, string | undefined>): SupabaseConfig {
  const url = env.VITE_SUPABASE_URL
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY

  const missing: string[] = []
  if (!url) missing.push('VITE_SUPABASE_URL')
  if (!publishableKey) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY')
  if (missing.length > 0) {
    throw new Error(
      `Thiếu biến môi trường: ${missing.join(', ')}. Sao chép .env.example thành .env rồi điền giá trị.`,
    )
  }

  // service_role bỏ qua RLS. Nếu nó lọt vào biến VITE_* thì Vite sẽ nhúng thẳng
  // vào bundle JS gửi cho mọi khách truy cập, và toàn bộ RLS thành vô nghĩa.
  // Thà vỡ lúc khởi động hơn là âm thầm ship một khoá toàn quyền.
  if (publishableKey!.includes('service_role') || publishableKey!.startsWith('sb_secret_')) {
    throw new Error(
      'VITE_SUPABASE_PUBLISHABLE_KEY đang chứa secret/service_role key. Khoá đó bỏ qua RLS và sẽ bị nhúng vào bundle JS công khai. Dùng publishable key.',
    )
  }

  return { url: url!, publishableKey: publishableKey! }
}

let client: SupabaseClient | null = null

/**
 * Client dùng chung, tạo lazy VÀ nạp code lazy.
 *
 * `import()` động chứ không import tĩnh: `@supabase/supabase-js` nặng ~209 KB
 * (54 KB gzip). App chạy trọn vẹn khi CHƯA đăng nhập — dữ liệu ở IndexedDB —
 * nên bắt mọi khách tải SDK auth mà phần lớn không dùng là vô lý, nhất là trên
 * điện thoại (R3). Import tĩnh đẩy bundle từ 327 KB lên 536 KB.
 *
 * Lazy ở mức INSTANCE cũng có chủ đích: tạo client lúc import module sẽ làm MỌI
 * test import gián tiếp file này bị vỡ khi không có biến env, dù test đó chẳng
 * gọi mạng.
 */
export async function getSupabase(): Promise<SupabaseClient> {
  if (client) return client
  const cfg = readSupabaseConfig(import.meta.env as unknown as Record<string, string | undefined>)
  const { createClient } = await import('@supabase/supabase-js')
  // Kiểm lại: một lời gọi song song có thể đã tạo client xong trong lúc `await`
  // ở trên đang chờ. Không kiểm là tạo hai client, mỗi cái một GoTrueClient
  // nghe cùng một khoá localStorage — supabase-js sẽ cảnh báo và việc refresh
  // token trở nên bấp bênh.
  if (client) return client
  client = createClient(cfg.url, cfg.publishableKey, {
    auth: {
      // magic link trả về qua URL fragment; app dùng hash routing nên phải tự
      // xử lý, nếu để supabase-js tự dò nó sẽ đụng vào hash của router
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  return client
}

/** Seam để test tiêm client giả — cùng lối với WorkerLike ở generate-client. */
export function setSupabaseForTests(c: SupabaseClient | null): void {
  client = c
}
