import { useCallback, useEffect, useState } from 'react'
import { drainOutbox } from '@/data/drain'
import { countOutbox } from '@/data/local-cache'
import { SOLO_USER_ID } from '@/data/solo'

export interface SyncState {
  /** số thay đổi chưa đẩy lên */
  pending: number
  online: boolean
  syncing: boolean
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
      await drainOutbox(SOLO_USER_ID)
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

  return { pending, online, syncing, syncNow }
}
