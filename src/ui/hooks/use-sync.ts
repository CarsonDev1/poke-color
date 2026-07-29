import { useCallback, useEffect, useState } from 'react'
import { drainOutbox } from '@/data/drain'
import { countOutbox } from '@/data/local-cache'
import { useSession } from '@/ui/hooks/use-session'

export interface SyncState {
  /** số thay đổi chưa đẩy lên */
  pending: number
  online: boolean
  syncing: boolean
  /** đăng nhập rồi thì mới có gì để đồng bộ */
  signedIn: boolean
  /** đẩy ngay, không đợi sự kiện online */
  syncNow: () => void
}

export function useSync(): SyncState {
  const { session } = useSession()
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
    if (!session) return
    setSyncing(true)
    try {
      await drainOutbox(session.userId)
    } finally {
      setSyncing(false)
      await refresh()
    }
  }, [session, refresh])

  // đếm lại khi mount và khi đăng nhập/đăng xuất
  useEffect(() => {
    void refresh()
  }, [refresh, session])

  // Đẩy ngay khi vừa đăng nhập: người dùng có thể đã tô offline hàng chục vùng
  // trước khi đăng nhập, và không có cú đẩy này thì phải đợi tới lần `online`
  // kế tiếp — có thể không bao giờ xảy ra trong một session.
  useEffect(() => {
    if (session && online) void run()
  }, [session, online, run])

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

  return { pending, online, syncing, signedIn: session !== null, syncNow }
}
