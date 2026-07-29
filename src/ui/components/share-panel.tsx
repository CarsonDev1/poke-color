import { useCallback, useEffect, useState } from 'react'
import { disableShare, enableShare, getShareToken, listCompletions, type Completion } from '@/data/share-repo'
import { formatDuration } from '@/core/engine/stats'

/**
 * Bật/tắt chia sẻ một puzzle và hiện bảng hoàn thành (§11, §12).
 *
 * Chế độ một người dùng: không cần đăng nhập. Điều kiện duy nhất là puzzle đã
 * được đẩy lên Supabase — chưa đẩy thì `enableShare` sẽ không tìm thấy hàng nào
 * để gắn token.
 */
export function SharePanel({ puzzleId }: { puzzleId: string }) {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [completions, setCompletions] = useState<Completion[]>([])

  useEffect(() => {
    let alive = true
    void (async () => {
      const t = await getShareToken(puzzleId)
      if (!alive) return
      setToken(t)
      setLoading(false)
      if (t) setCompletions(await listCompletions(puzzleId))
    })()
    return () => {
      alive = false
    }
  }, [puzzleId])

  const link = token
    ? `${window.location.origin}${window.location.pathname}#/s/${token}`
    : null

  const turnOn = useCallback(async () => {
    setBusy(true)
    setError(null)
    const r = await enableShare(puzzleId)
    if (r.ok) setToken(r.token)
    else setError(r.message)
    setBusy(false)
  }, [puzzleId])

  const turnOff = useCallback(async () => {
    setBusy(true)
    setError(null)
    if (await disableShare(puzzleId)) {
      setToken(null)
      setCompletions([])
    } else {
      setError('Không tắt được chia sẻ. Kiểm tra mạng rồi thử lại.')
    }
    setBusy(false)
  }, [puzzleId])

  const copy = useCallback(async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard bị chặn (không phải secure context, hoặc người dùng từ chối)
      // — link vẫn hiện trong input để chọn tay, nên đây không phải lỗi chặn
      setError('Không copy tự động được. Hãy chọn và copy liên kết bên dưới.')
    }
  }, [link])

  if (loading) return <p style={{ margin: 0 }}>Đang kiểm tra trạng thái chia sẻ…</p>

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {token === null ? (
        <div>
          <button type="button" disabled={busy} onClick={() => void turnOn()}>
            {busy ? 'Đang bật…' : 'Bật chia sẻ'}
          </button>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>
            Người nhận tô được nhưng KHÔNG thấy ảnh gốc — họ phải tô xong mới biết đó là gì.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              readOnly
              aria-label="Liên kết chia sẻ"
              value={link ?? ''}
              onFocus={(e) => e.currentTarget.select()}
              style={{ flex: '1 1 260px', padding: 6, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
            />
            <button type="button" onClick={() => void copy()}>
              {copied ? 'Đã copy ✓' : 'Copy'}
            </button>
            <button type="button" disabled={busy} onClick={() => void turnOff()}>
              Tắt chia sẻ
            </button>
          </div>

          {completions.length > 0 && (
            <div>
              <h3 style={{ fontSize: 15, margin: '4px 0' }}>Bảng hoàn thành</h3>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
                {completions.map((c, i) => (
                  <li key={i}>
                    {c.displayName} — {formatDuration(c.activeSeconds)}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: 14 }}>
          {error}
        </p>
      )}
    </div>
  )
}
