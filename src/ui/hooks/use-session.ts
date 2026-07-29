import { useEffect, useState } from 'react'
import { getCurrentSession, onAuthChange, type AuthSession } from '@/data/auth'

export interface SessionState {
  session: AuthSession | null
  /** true tới khi biết chắc đang đăng nhập hay không */
  loading: boolean
}

/**
 * Trạng thái đăng nhập cho React.
 *
 * `loading` tồn tại để UI không nháy: nếu khởi tạo `session = null` rồi render
 * ngay, người đã đăng nhập sẽ thấy nút "Đăng nhập" nhấp nháy một khung hình
 * trước khi session đọc xong từ localStorage.
 */
export function useSession(): SessionState {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // StrictMode gọi effect hai lần trên cùng một fiber; cờ này ngăn lần chạy
    // đã bị cleanup ghi state sau khi unmount.
    let alive = true

    void getCurrentSession().then((s) => {
      if (!alive) return
      setSession(s)
      setLoading(false)
    })

    const off = onAuthChange((s) => {
      if (!alive) return
      setSession(s)
      setLoading(false)
    })

    return () => {
      alive = false
      off()
    }
  }, [])

  return { session, loading }
}
