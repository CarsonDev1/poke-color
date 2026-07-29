import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { consumeAuthRedirect, sendMagicLink, signOut } from '@/data/auth'
import { useSession } from '@/ui/hooks/use-session'

type Phase =
  | { kind: 'form' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'error'; message: string }

export default function LoginRoute() {
  const { session, loading } = useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  const inputRef = useRef<HTMLInputElement>(null)

  // Hoàn tất đăng nhập từ liên kết trong email. Chạy MỘT lần: token dùng một
  // lần, gọi lại lần hai sẽ lỗi.
  const consumedRef = useRef(false)
  useEffect(() => {
    if (consumedRef.current) return
    consumedRef.current = true

    const hash = window.location.hash
    const search = window.location.search
    if (!hash.includes('access_token=') && !hash.includes('code=') && !search.includes('code=')) {
      return
    }

    void consumeAuthRedirect(hash, search).then((s) => {
      // XOÁ token khỏi URL bất kể thành công hay không: để lại thì F5 sẽ replay
      // token đã dùng, và nó cũng nằm trong history của browser.
      window.history.replaceState(null, '', `${window.location.pathname}#/login`)
      if (s) navigate('/library', { replace: true })
      else setPhase({ kind: 'error', message: 'Liên kết đăng nhập đã hết hạn hoặc đã dùng rồi. Hãy gửi lại.' })
    })
  }, [navigate])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setPhase({ kind: 'sending' })
      const r = await sendMagicLink(email)
      if (r.ok) setPhase({ kind: 'sent', email: email.trim() })
      else setPhase({ kind: 'error', message: r.message })
    },
    [email],
  )

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <p>Đang kiểm tra đăng nhập…</p>
      </main>
    )
  }

  if (session) {
    return (
      <main style={{ padding: 24, display: 'grid', gap: 16, maxWidth: 420 }}>
        <h1 style={{ margin: 0 }}>Đã đăng nhập</h1>
        <p style={{ margin: 0 }}>
          Bạn đang đăng nhập bằng <strong>{session.email || 'tài khoản này'}</strong>.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link to="/library">Về thư viện</Link>
          <button
            type="button"
            onClick={() => {
              void signOut()
            }}
          >
            Đăng xuất
          </button>
        </div>
      </main>
    )
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16, maxWidth: 420 }}>
      <h1 style={{ margin: 0 }}>Đăng nhập</h1>
      <p style={{ margin: 0, color: '#475569' }}>
        Nhập email, chúng tôi gửi bạn một liên kết đăng nhập. Không cần mật khẩu.
      </p>

      {phase.kind === 'sent' ? (
        <div role="status" style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0 }}>
            Đã gửi liên kết tới <strong>{phase.email}</strong>. Mở email đó để đăng nhập.
          </p>
          <button type="button" onClick={() => setPhase({ kind: 'form' })}>
            Gửi lại
          </button>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            Email
            <input
              ref={inputRef}
              type="email"
              value={email}
              disabled={phase.kind === 'sending'}
              onChange={(e) => setEmail(e.target.value)}
              style={{ padding: 8 }}
            />
          </label>
          <button type="submit" disabled={phase.kind === 'sending'}>
            {phase.kind === 'sending' ? 'Đang gửi…' : 'Gửi liên kết đăng nhập'}
          </button>
        </form>
      )}

      {phase.kind === 'error' && (
        <p role="alert" style={{ margin: 0, color: '#b91c1c' }}>
          {phase.message}
        </p>
      )}

      <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
        Chưa đăng nhập vẫn tô được — puzzle lưu trong máy này. Đăng nhập để đồng bộ sang thiết bị khác.
      </p>

      <Link to="/library">Về thư viện</Link>
    </main>
  )
}
