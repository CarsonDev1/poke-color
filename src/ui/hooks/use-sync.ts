import { useCallback, useEffect, useState } from 'react'
import { drainOutbox, pullDown } from '@/data/drain'
import { countOutbox } from '@/data/local-cache'
import { SOLO_USER_ID } from '@/data/solo'

export interface SyncState {
  /** số thay đổi chưa đẩy lên */
  pending: number
  online: boolean
  syncing: boolean
  /**
   * Tăng mỗi khi một lượt đồng bộ KÉO ĐƯỢC dữ liệu mới về. Thư viện dùng nó làm
   * tín hiệu nạp lại — không có tín hiệu này thì puzzle vừa tải xong nằm trong
   * IndexedDB mà màn hình vẫn trống tới khi người dùng tự F5.
   */
  pulledAt: number
  /** đẩy ngay, không đợi sự kiện online */
  syncNow: () => void
}

/**
 * Đồng bộ với Supabase — KHÔNG cần đăng nhập (chế độ một người dùng).
 *
 * Trước đây hook này gác theo session; giờ luôn đồng bộ dưới `SOLO_USER_ID`.
 */
export function useSync(): SyncState {
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [syncing, setSyncing] = useState(false)
  const [pulledAt, setPulledAt] = useState(0)

  const refresh = useCallback(async () => {
    try {
      setPending(await countOutbox())
    } catch {
      // IndexedDB có thể chưa mở được; không đáng làm vỡ UI
    }
  }, [])

  const run = useCallback(async () => {
    setSyncing(true)
    try {
      // ĐẨY trước rồi mới KÉO: đẩy trước thì việc tô ở máy này lên server đã,
      // sau đó kéo về sẽ hợp nhất được cả hai phía. Kéo trước rồi đẩy thì lượt
      // hợp nhất bỏ sót đúng những gì vừa tô ở máy này.
      await drainOutbox(SOLO_USER_ID)
      const out = await pullDown(SOLO_USER_ID)
      if (out.pulled > 0 || out.merged > 0) setPulledAt(Date.now())
    } finally {
      setSyncing(false)
      await refresh()
    }
  }, [refresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Đẩy ngay khi mount và mỗi khi có mạng lại. Không có cú đẩy lúc mount thì
  // những gì tô offline ở lần chạy trước phải đợi tới sự kiện `online` kế tiếp —
  // có thể không bao giờ xảy ra nếu máy vốn đã online sẵn.
  useEffect(() => {
    if (online) void run()
  }, [online, run])

  useEffect(() => {
    const goOnline = (): void => setOnline(true)
    const goOffline = (): void => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const syncNow = useCallback(() => {
    void run()
  }, [run])

  return { pending, online, syncing, pulledAt, syncNow }
}
