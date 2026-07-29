import { getSupabase } from '@/data/supabase'

export interface AuthSession {
  userId: string
  email: string
}

export type SendResult = { ok: true } | { ok: false; message: string }

/**
 * Kiểm tối thiểu ở client để không tốn một round-trip cho lỗi đánh máy.
 * Server vẫn kiểm lại — đây KHÔNG phải lớp bảo mật.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface RawUser {
  id?: string
  email?: string | null
}
interface RawSession {
  user?: RawUser | null
}

/** email rỗng thay vì undefined: UI hiện "Đã gửi tới ..." nên cần chuỗi. */
function toSession(s: RawSession | null | undefined): AuthSession | null {
  if (!s?.user?.id) return null
  return { userId: s.user.id, email: s.user.email ?? '' }
}

export async function sendMagicLink(email: string): Promise<SendResult> {
  const clean = email.trim()
  if (!EMAIL_RE.test(clean)) {
    return { ok: false, message: 'Email không đúng định dạng. Ví dụ: ten@vidu.com' }
  }
  try {
    const { error } = await (await getSupabase()).auth.signInWithOtp({
      email: clean,
      // quay lại đúng route /login của hash router để consumeAuthRedirect xử lý
      options: {
        emailRedirectTo: `${window.location.origin}${window.location.pathname}#/login`,
      },
    })
    if (error) {
      return { ok: false, message: `Không gửi được liên kết đăng nhập: ${error.message}` }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: 'Không kết nối được tới máy chủ. Kiểm tra mạng rồi thử lại.' }
  }
}

/**
 * KHÔNG bao giờ ném. App phải chạy tiếp được khi offline hoặc chưa cấu hình
 * Supabase — không có session thì coi như khách, dữ liệu vẫn nằm ở IndexedDB.
 */
export async function getCurrentSession(): Promise<AuthSession | null> {
  try {
    const { data } = await (await getSupabase()).auth.getSession()
    return toSession(data?.session as RawSession | null)
  } catch {
    return null
  }
}

/**
 * Trả hàm unsubscribe NGAY (đồng bộ) dù việc đăng ký là bất đồng bộ, vì SDK nạp
 * lazy. Nếu caller unsubscribe trước khi SDK nạp xong — rất thường gặp dưới
 * StrictMode, nơi effect bị cleanup ngay lập tức — thì `cancelled` đảm bảo ta
 * không gọi `cb` nữa và hủy luôn subscription vừa tạo. Không có cờ này thì
 * component đã unmount vẫn nhận callback.
 */
export function onAuthChange(cb: (s: AuthSession | null) => void): () => void {
  let cancelled = false
  let unsubscribe: (() => void) | null = null

  void (async () => {
    try {
      const supabase = await getSupabase()
      if (cancelled) return
      const { data } = supabase.auth.onAuthStateChange((_event, s) => {
        if (cancelled) return
        cb(toSession(s as RawSession | null))
      })
      unsubscribe = () => data.subscription.unsubscribe()
      if (cancelled) unsubscribe()
    } catch {
      // chưa cấu hình Supabase ⇒ không có gì để theo dõi, app vẫn chạy offline
    }
  })()

  return () => {
    cancelled = true
    unsubscribe?.()
  }
}

export async function signOut(): Promise<void> {
  try {
    await (await getSupabase()).auth.signOut()
  } catch {
    // Đăng xuất cục bộ phải luôn thành công. Nếu để lỗi mạng nổi lên thì người
    // dùng bị kẹt ở trạng thái "đã bấm đăng xuất mà vẫn đang đăng nhập".
  }
}

/**
 * Tách tham số ra khỏi một chuỗi fragment/query bất kể dấu phân cách.
 *
 * Cần tự tách vì app dùng **hash routing**, nên fragment ĐÃ chứa `/login` trước
 * khi Supabase nối token vào — thành `#/login&access_token=...`. Đó không phải
 * query string hợp lệ nên `new URLSearchParams(hash)` sẽ đọc sai. Thêm `&` vào
 * đầu để tham số đứng ngay đầu chuỗi cũng khớp được.
 */
function param(raw: string, name: string): string | null {
  const s = '&' + raw.replace(/^[#?]/, '')
  const m = s.match(new RegExp(`[&?]${name}=([^&?#]*)`))
  if (!m || m[1] === '') return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

/**
 * Hoàn tất đăng nhập từ liên kết trong email.
 *
 * Xử lý CẢ HAI luồng vì tuỳ cấu hình project và phiên bản supabase-js mà magic
 * link trả về khác nhau:
 * - **implicit**: `access_token` + `refresh_token` trong fragment
 * - **PKCE**: `code` trong query string
 *
 * `detectSessionInUrl: false` ở supabase.ts nên việc này là thủ công có chủ ý:
 * để supabase-js tự dò sẽ đụng vào fragment mà hash router đang dùng.
 *
 * Caller PHẢI xoá token khỏi URL sau khi gọi — không xoá thì refresh trang sẽ
 * replay token đã dùng và nhận lỗi.
 */
export async function consumeAuthRedirect(
  hash: string,
  search: string,
): Promise<AuthSession | null> {
  const accessToken = param(hash, 'access_token')
  const refreshToken = param(hash, 'refresh_token')

  if (accessToken && refreshToken) {
    try {
      const { data, error } = await (await getSupabase()).auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (error) return null
      return toSession(data?.session as RawSession | null)
    } catch {
      return null
    }
  }

  // PKCE: code có thể nằm ở query hoặc (ít gặp) ở fragment
  const code = param(search, 'code') ?? param(hash, 'code')
  if (code) {
    try {
      const { data, error } = await (await getSupabase()).auth.exchangeCodeForSession(code)
      if (error) return null
      return toSession(data?.session as RawSession | null)
    } catch {
      return null
    }
  }

  return null
}
