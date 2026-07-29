import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumeAuthRedirect,
  getCurrentSession,
  onAuthChange,
  sendMagicLink,
  signOut,
} from '@/data/auth'
import { setSupabaseForTests } from '@/data/supabase'

type Fn = ReturnType<typeof vi.fn>

function fakeClient(over: Record<string, unknown> = {}) {
  const auth = {
    signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi
      .fn()
      .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    setSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    ...over,
  }
  return { client: { auth } as never, auth: auth as unknown as Record<string, Fn> }
}

const SESSION = { user: { id: 'u1', email: 'a@b.com' } }

beforeEach(() => setSupabaseForTests(null))

describe('sendMagicLink', () => {
  it('email hợp lệ ⇒ gọi signInWithOtp và trả ok', async () => {
    const f = fakeClient()
    setSupabaseForTests(f.client)
    const r = await sendMagicLink('a@b.com')
    expect(r.ok).toBe(true)
    expect(f.auth.signInWithOtp).toHaveBeenCalled()
  })

  it('cắt khoảng trắng quanh email trước khi gửi', async () => {
    const f = fakeClient()
    setSupabaseForTests(f.client)
    await sendMagicLink('  a@b.com  ')
    expect(f.auth.signInWithOtp.mock.calls[0][0].email).toBe('a@b.com')
  })

  it('email sai định dạng ⇒ TỪ CHỐI TẠI CLIENT, không gọi mạng', async () => {
    const f = fakeClient()
    setSupabaseForTests(f.client)
    for (const bad of ['', '   ', 'khong-co-a-mail', 'a@', '@b.com', 'a@b']) {
      const r = await sendMagicLink(bad)
      expect(r.ok, `"${bad}" phải bị từ chối`).toBe(false)
    }
    expect(f.auth.signInWithOtp).not.toHaveBeenCalled()
  })

  it('lỗi từ Supabase ⇒ trả message TIẾNG VIỆT, không ném raw', async () => {
    const f = fakeClient({
      signInWithOtp: vi.fn().mockResolvedValue({ data: null, error: { message: 'rate limit' } }),
    })
    setSupabaseForTests(f.client)
    const r = await sendMagicLink('a@b.com')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/[À-ỹ]/)
  })

  it('mạng chết ⇒ vẫn trả kết quả, KHÔNG ném ra ngoài', async () => {
    const f = fakeClient({ signInWithOtp: vi.fn().mockRejectedValue(new Error('offline')) })
    setSupabaseForTests(f.client)
    const r = await sendMagicLink('a@b.com')
    expect(r.ok).toBe(false)
  })
})

describe('getCurrentSession', () => {
  it('có session ⇒ trả userId + email', async () => {
    const f = fakeClient({
      getSession: vi.fn().mockResolvedValue({ data: { session: SESSION }, error: null }),
    })
    setSupabaseForTests(f.client)
    expect(await getCurrentSession()).toEqual({ userId: 'u1', email: 'a@b.com' })
  })

  it('không có session ⇒ null', async () => {
    setSupabaseForTests(fakeClient().client)
    expect(await getCurrentSession()).toBeNull()
  })

  it('lỗi đọc session ⇒ null, KHÔNG ném — app phải chạy tiếp offline', async () => {
    const f = fakeClient({ getSession: vi.fn().mockRejectedValue(new Error('mạng')) })
    setSupabaseForTests(f.client)
    expect(await getCurrentSession()).toBeNull()
  })

  it('session không có email ⇒ email rỗng, không phải undefined', async () => {
    const f = fakeClient({
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null }),
    })
    setSupabaseForTests(f.client)
    expect(await getCurrentSession()).toEqual({ userId: 'u1', email: '' })
  })
})

describe('consumeAuthRedirect', () => {
  it('luồng implicit: token trong fragment ⇒ setSession', async () => {
    const f = fakeClient({
      setSession: vi.fn().mockResolvedValue({ data: { session: SESSION }, error: null }),
    })
    setSupabaseForTests(f.client)

    const s = await consumeAuthRedirect('#access_token=AAA&refresh_token=BBB&type=magiclink', '')
    expect(s).toEqual({ userId: 'u1', email: 'a@b.com' })
    expect(f.auth.setSession).toHaveBeenCalledWith({
      access_token: 'AAA',
      refresh_token: 'BBB',
    })
  })

  /**
   * App dùng hash routing nên fragment ĐÃ có `/login` trước khi Supabase nối
   * token vào. Parser phải chịu được dạng này, không chỉ dạng token-thuần.
   */
  it('token nối SAU route của hash router ⇒ vẫn tách được', async () => {
    const f = fakeClient({
      setSession: vi.fn().mockResolvedValue({ data: { session: SESSION }, error: null }),
    })
    setSupabaseForTests(f.client)

    const s = await consumeAuthRedirect('#/login&access_token=AAA&refresh_token=BBB', '')
    expect(s).toEqual({ userId: 'u1', email: 'a@b.com' })
    expect(f.auth.setSession).toHaveBeenCalledWith({
      access_token: 'AAA',
      refresh_token: 'BBB',
    })
  })

  it('luồng PKCE: code trong QUERY ⇒ exchangeCodeForSession', async () => {
    const f = fakeClient({
      exchangeCodeForSession: vi
        .fn()
        .mockResolvedValue({ data: { session: SESSION }, error: null }),
    })
    setSupabaseForTests(f.client)

    const s = await consumeAuthRedirect('#/login', '?code=CCC')
    expect(s).toEqual({ userId: 'u1', email: 'a@b.com' })
    expect(f.auth.exchangeCodeForSession).toHaveBeenCalledWith('CCC')
  })

  it('không có token cũng không có code ⇒ null, không gọi gì', async () => {
    const f = fakeClient()
    setSupabaseForTests(f.client)
    expect(await consumeAuthRedirect('#/library', '')).toBeNull()
    expect(f.auth.setSession).not.toHaveBeenCalled()
    expect(f.auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('chỉ có access_token mà thiếu refresh_token ⇒ null, không gọi setSession', async () => {
    const f = fakeClient()
    setSupabaseForTests(f.client)
    expect(await consumeAuthRedirect('#access_token=AAA', '')).toBeNull()
    expect(f.auth.setSession).not.toHaveBeenCalled()
  })

  it('token URL-encoded được decode', async () => {
    const f = fakeClient({
      setSession: vi.fn().mockResolvedValue({ data: { session: SESSION }, error: null }),
    })
    setSupabaseForTests(f.client)
    await consumeAuthRedirect('#access_token=a%2Bb&refresh_token=c%2Fd', '')
    expect(f.auth.setSession).toHaveBeenCalledWith({ access_token: 'a+b', refresh_token: 'c/d' })
  })

  it('Supabase trả lỗi ⇒ null, không ném', async () => {
    const f = fakeClient({
      setSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: { message: 'token hết hạn' } }),
    })
    setSupabaseForTests(f.client)
    expect(await consumeAuthRedirect('#access_token=AAA&refresh_token=BBB', '')).toBeNull()
  })
})

describe('onAuthChange', () => {
  /** SDK nạp lazy nên việc đăng ký là bất đồng bộ — phải đợi nó xong. */
  function subscribeHarness() {
    const unsubscribe = vi.fn()
    let handler: ((e: string, s: unknown) => void) | null = null
    const f = fakeClient({
      onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
        handler = cb
        return { data: { subscription: { unsubscribe } } }
      }),
    })
    setSupabaseForTests(f.client)
    return { unsubscribe, getHandler: () => handler, onAuthStateChange: f.auth.onAuthStateChange }
  }

  it('map session của Supabase sang AuthSession và trả hàm unsubscribe', async () => {
    const h = subscribeHarness()
    const seen: unknown[] = []
    const off = onAuthChange((s) => seen.push(s))

    await vi.waitFor(() => expect(h.getHandler()).not.toBeNull())
    h.getHandler()!('SIGNED_IN', SESSION)
    h.getHandler()!('SIGNED_OUT', null)
    expect(seen).toEqual([{ userId: 'u1', email: 'a@b.com' }, null])

    off()
    expect(h.unsubscribe).toHaveBeenCalled()
  })

  /**
   * Trường hợp thật hay gặp: StrictMode cleanup effect NGAY, trước khi SDK nạp
   * xong. Không có cờ `cancelled` thì component đã unmount vẫn nhận callback,
   * và subscription vừa tạo bị bỏ rơi không ai hủy.
   */
  it('unsubscribe TRƯỚC khi SDK nạp xong ⇒ không gọi cb và không rò subscription', async () => {
    const h = subscribeHarness()
    const seen: unknown[] = []
    const off = onAuthChange((s) => seen.push(s))

    off() // hủy ngay, trước khi await bên trong kịp chạy

    // để microtask của lần nạp SDK chạy hết
    await new Promise((r) => setTimeout(r, 20))

    // Bất biến thật: KHÔNG rò subscription còn sống. Thoả bằng một trong hai
    // cách — chưa từng đăng ký, hoặc đã đăng ký rồi hủy. Cả hai đều đúng, nên
    // test không được ép một cách cụ thể.
    if (h.onAuthStateChange.mock.calls.length > 0) {
      expect(h.unsubscribe).toHaveBeenCalled()
    }

    // và dù đường nào, cb tuyệt đối không được gọi
    h.getHandler()?.('SIGNED_IN', SESSION)
    expect(seen).toEqual([])
  })
})

describe('signOut', () => {
  it('gọi signOut của client', async () => {
    const f = fakeClient()
    setSupabaseForTests(f.client)
    await signOut()
    expect(f.auth.signOut).toHaveBeenCalled()
  })

  it('mạng lỗi vẫn KHÔNG ném — đăng xuất cục bộ phải luôn thành công', async () => {
    const f = fakeClient({ signOut: vi.fn().mockRejectedValue(new Error('offline')) })
    setSupabaseForTests(f.client)
    await expect(signOut()).resolves.toBeUndefined()
  })
})
