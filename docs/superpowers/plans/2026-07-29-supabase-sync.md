# Supabase: đăng nhập + đồng bộ đa thiết bị — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App hiện lưu 100% cục bộ trong IndexedDB — đổi máy là mất hết. Plan này thêm tài khoản, lưu đám mây, và đồng bộ đa thiết bị vẫn chơi được khi mất mạng.

**Architecture:** IndexedDB vẫn là **nguồn sự thật cho session đang chơi** (ghi đồng bộ với hành động, không đợi mạng). Một outbox trong IndexedDB xếp hàng thay đổi, debounce 1.5s đẩy lên Supabase. Xung đột hợp nhất bằng **OR bitset** — cả hai thiết bị chỉ *thêm* vùng đã tô nên OR không mất dữ liệu.

**Tech Stack:** `@supabase/supabase-js` ^2.109 · Postgres + RLS · Storage bucket private · Auth magic-link

**Spec:** §13 Data model · §14 Đồng bộ & offline · §15 Module · §"RLS" · §"Storage" · §"RPC"

## Global Constraints

- **Luật phụ thuộc**: `core/` không import từ `data/`/`ui/`/`render/`/`worker/`, không chạm `window`/`document`. `mergeProgress` là hàm thuần nhưng nhận `ProgressRecord` (kiểu của tầng data) nên đặt ở `src/data/sync.ts` theo §15 — KHÔNG kéo nó vào `core/`.
- **Bảng nhãn/label**: không liên quan plan này, đừng chạm.
- `erasableSyntaxOnly: true` — không parameter property, không `enum`, không namespace.
- **Chạy test bằng PowerShell**, không dùng Bash tool: `vitest` qua Bash trên máy Windows này fail giả mọi file với `Cannot read properties of undefined (reading 'config')`.
- **Không bao giờ commit `.env`** (đã gitignore, đã xác nhận bằng `git check-ignore`). `.env.example` chỉ chứa placeholder.
- **Không dùng service_role key ở client** — `readSupabaseConfig` đã chặn, giữ nguyên guard đó.
- Test tiêm client giả qua `setSupabaseForTests`, KHÔNG gọi mạng thật trong test.
- UI tiếng Việt, hardcode. Commit tiếng Việt, Conventional Commits, kèm `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Điều kiện tiên quyết (NGƯỜI DÙNG làm, không phải agent)

`supabase/migrations/0001_init.sql` phải chạy xong trong SQL Editor, và Email provider phải bật. Publishable key không làm được DDL. **Task 1 và 2 không phụ thuộc điều này**; T3 trở đi cần bảng thật để kiểm tay.

## File Structure

```
src/data/sync.ts                    T1  MỚI — mergeProgress, hàm thuần
src/data/__tests__/sync.test.ts     T1
src/data/auth.ts                    T2  MỚI — signInWithEmail, session, signOut
src/data/__tests__/auth.test.ts     T2
src/ui/hooks/use-session.ts         T2  MỚI — React binding cho auth
src/routes/login.tsx                T2  MỚI
src/data/outbox.ts                  T3  MỚI — queue trong IndexedDB, replay idempotent
src/data/__tests__/outbox.test.ts   T3
src/data/puzzle-repo.ts             T4  MỚI — Storage upload + insert row
src/data/progress-repo.ts           T5  MỚI — pull/push + merge
src/ui/components/sync-banner.tsx   T6  MỚI — "chưa đồng bộ · N thay đổi"
src/routes/*.tsx                    T6  đấu dây
```

---

### Task 1: `mergeProgress` — hợp nhất tiến độ hai thiết bị

**Files:**
- Create: `src/data/sync.ts`
- Test: `src/data/__tests__/sync.test.ts`

**Interfaces:**
- Consumes: `Bitset` (`@/core/codec/bitset`) — có `or()`, `toBytes()`, `countOnes()`, `static fromBytes(bytes, bitLength)`; `ProgressRecord` (`@/data/local-cache`) = `{ puzzleId, filled: Uint8Array, filledCount, activeSeconds, completedAt: number|null, updatedAt: number }`
- Produces: `mergeProgress(a: ProgressRecord, b: ProgressRecord, regionCount: number): ProgressRecord`

**Quy tắc hợp nhất (spec §14), mỗi trường một lý do:**

| trường | phép | vì sao |
|---|---|---|
| `filled` | **OR** | hai bên chỉ THÊM vùng đã tô, không bên nào xoá ⇒ OR không mất dữ liệu |
| `filledCount` | **đếm lại từ bitset đã OR** | KHÔNG phải `max(a,b)`: thiết bị A tô vùng {1,2}, B tô {3} ⇒ max = 2 nhưng đúng là 3 |
| `activeSeconds` | `max` | thời gian không cộng dồn được: hai thiết bị có thể chạy song song, cộng sẽ đếm trùng |
| `completedAt` | **min khác null** | lần hoàn thành ĐẦU TIÊN mới là mốc thật |
| `updatedAt` | `max` | |

- [ ] **Step 1: Viết test**

```ts
import { describe, expect, it } from 'vitest'
import { Bitset } from '@/core/codec/bitset'
import { mergeProgress } from '@/data/sync'
import type { ProgressRecord } from '@/data/local-cache'

function rec(bits: number[], over: Partial<ProgressRecord> = {}): ProgressRecord {
  const b = new Bitset(10)
  for (const i of bits) b.set(i, true)
  return {
    puzzleId: 'p1',
    filled: b.toBytes(),
    filledCount: b.countOnes(),
    activeSeconds: 0,
    completedAt: null,
    updatedAt: 0,
    ...over,
  }
}

describe('mergeProgress', () => {
  it('OR hai tập vùng rời nhau — không mất bên nào', () => {
    const out = mergeProgress(rec([1, 2]), rec([3]), 10)
    const bs = Bitset.fromBytes(out.filled, 10)
    expect(bs.get(1)).toBe(true)
    expect(bs.get(2)).toBe(true)
    expect(bs.get(3)).toBe(true)
  })

  it('filledCount ĐẾM LẠI, không lấy max — đây là chỗ dễ sai nhất', () => {
    // A tô 2 vùng, B tô 1 vùng khác ⇒ đúng là 3, max(2,1) = 2 là SAI
    const out = mergeProgress(rec([1, 2]), rec([3]), 10)
    expect(out.filledCount).toBe(3)
  })

  it('vùng trùng nhau không bị đếm hai lần', () => {
    const out = mergeProgress(rec([1, 2]), rec([2, 3]), 10)
    expect(out.filledCount).toBe(3)
  })

  it('activeSeconds lấy max, KHÔNG cộng dồn (hai thiết bị chạy song song)', () => {
    const out = mergeProgress(
      rec([1], { activeSeconds: 100 }),
      rec([2], { activeSeconds: 60 }),
      10,
    )
    expect(out.activeSeconds).toBe(100)
  })

  it('completedAt lấy MIN khác null — lần hoàn thành đầu tiên', () => {
    const out = mergeProgress(
      rec([1], { completedAt: 5000 }),
      rec([2], { completedAt: 3000 }),
      10,
    )
    expect(out.completedAt).toBe(3000)
  })

  it('một bên null thì lấy bên kia', () => {
    expect(mergeProgress(rec([1], { completedAt: null }), rec([2], { completedAt: 7 }), 10).completedAt).toBe(7)
    expect(mergeProgress(rec([1], { completedAt: 7 }), rec([2], { completedAt: null }), 10).completedAt).toBe(7)
  })

  it('cả hai null thì vẫn null', () => {
    expect(mergeProgress(rec([1]), rec([2]), 10).completedAt).toBeNull()
  })

  it('updatedAt lấy max', () => {
    expect(mergeProgress(rec([1], { updatedAt: 9 }), rec([2], { updatedAt: 4 }), 10).updatedAt).toBe(9)
  })

  it('GIAO HOÁN: merge(a,b) === merge(b,a) — thứ tự đẩy/kéo không được đổi kết quả', () => {
    const a = rec([1, 4], { activeSeconds: 10, completedAt: 500, updatedAt: 3 })
    const b = rec([4, 7], { activeSeconds: 80, completedAt: 200, updatedAt: 9 })
    expect(mergeProgress(a, b, 10)).toEqual(mergeProgress(b, a, 10))
  })

  it('LUỸ ĐẲNG: merge(a,a) === a — replay outbox nhiều lần không đổi gì', () => {
    const a = rec([1, 4], { activeSeconds: 10, completedAt: 500, updatedAt: 3 })
    expect(mergeProgress(a, a, 10)).toEqual(a)
  })

  it('khác puzzleId ⇒ lỗi, không âm thầm trộn tiến độ của hai puzzle', () => {
    expect(() => mergeProgress(rec([1]), rec([2], { puzzleId: 'p2' }), 10)).toThrow(/p1|p2/)
  })
})
```

- [ ] **Step 2: Chạy để xác nhận RED**

Run (PowerShell): `npx vitest run src/data/__tests__/sync.test.ts`
Expected: FAIL — không resolve được `@/data/sync`

- [ ] **Step 3: Implement**

```ts
import { Bitset } from '@/core/codec/bitset'
import type { ProgressRecord } from '@/data/local-cache'

/**
 * Hợp nhất tiến độ cùng một puzzle từ hai nguồn (local vs remote, hoặc hai
 * thiết bị). Giao hoán và luỹ đẳng — nhờ vậy replay outbox nhiều lần, hoặc
 * đẩy/kéo theo thứ tự nào, đều cho cùng kết quả.
 */
export function mergeProgress(
  a: ProgressRecord,
  b: ProgressRecord,
  regionCount: number,
): ProgressRecord {
  if (a.puzzleId !== b.puzzleId) {
    throw new Error(`Không thể hợp nhất tiến độ của hai puzzle khác nhau: ${a.puzzleId} vs ${b.puzzleId}`)
  }

  const merged = Bitset.fromBytes(a.filled, regionCount)
  merged.or(Bitset.fromBytes(b.filled, regionCount))

  return {
    puzzleId: a.puzzleId,
    filled: merged.toBytes(),
    // ĐẾM LẠI từ bitset đã OR. max(a,b) sai: A tô {1,2}, B tô {3} ⇒ max=2, đúng=3
    filledCount: merged.countOnes(),
    // max chứ không cộng: hai thiết bị có thể chạy song song, cộng là đếm trùng
    activeSeconds: Math.max(a.activeSeconds, b.activeSeconds),
    completedAt: minNonNull(a.completedAt, b.completedAt),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  }
}

/** lần hoàn thành ĐẦU TIÊN mới là mốc thật */
function minNonNull(x: number | null, y: number | null): number | null {
  if (x === null) return y
  if (y === null) return x
  return Math.min(x, y)
}
```

- [ ] **Step 4: Chạy test**

Run (PowerShell): `npx vitest run src/data/__tests__/sync.test.ts`
Expected: 12 passed

- [ ] **Step 5: `npm run typecheck` rồi commit**

```bash
git add src/data/sync.ts src/data/__tests__/sync.test.ts
git commit -m "feat(data): mergeProgress hợp nhất tiến độ bằng OR bitset

Giao hoán và luỹ đẳng nên replay outbox nhiều lần hoặc đẩy/kéo theo thứ tự
nào cũng cùng kết quả. filledCount ĐẾM LẠI từ bitset đã OR, không lấy max.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Auth magic-link

**Files:**
- Create: `src/data/auth.ts`, `src/ui/hooks/use-session.ts`, `src/routes/login.tsx`
- Test: `src/data/__tests__/auth.test.ts`
- Modify: `src/routes/` router config (thêm `/login`)

**Interfaces:**
- Consumes: `getSupabase()`, `setSupabaseForTests()` (`@/data/supabase`)
- Produces:
  - `sendMagicLink(email: string): Promise<{ ok: true } | { ok: false; message: string }>`
  - `getCurrentSession(): Promise<AuthSession | null>` với `AuthSession = { userId: string; email: string }`
  - `onAuthChange(cb: (s: AuthSession | null) => void): () => void` — trả hàm unsubscribe
  - `signOut(): Promise<void>`
  - `consumeAuthRedirect(hash: string): Promise<AuthSession | null>`
  - hook `useSession(): { session: AuthSession | null; loading: boolean }`

**Vì sao `detectSessionInUrl: false`** (đã đặt ở `supabase.ts`): app dùng **hash routing** (`createHashRouter`, vì static hosting không rewrite được). Magic link trả token qua **URL fragment** — đúng chỗ mà router đang dùng. Để supabase-js tự dò sẽ đụng nhau, nên `consumeAuthRedirect` phải tự tách token rồi gọi `setSession`, và phải **xoá token khỏi URL** sau khi dùng để refresh không replay lại.

- [ ] **Step 1: Viết test với client giả**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendMagicLink, getCurrentSession, signOut } from '@/data/auth'
import { setSupabaseForTests } from '@/data/supabase'

function fakeClient(over: Record<string, unknown> = {}) {
  return {
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      setSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      ...over,
    },
  } as never
}

beforeEach(() => setSupabaseForTests(null))

describe('sendMagicLink', () => {
  it('email hợp lệ ⇒ gọi signInWithOtp và trả ok', async () => {
    const c = fakeClient()
    setSupabaseForTests(c)
    const r = await sendMagicLink('a@b.com')
    expect(r.ok).toBe(true)
    expect((c as never as { auth: { signInWithOtp: ReturnType<typeof vi.fn> } }).auth.signInWithOtp)
      .toHaveBeenCalled()
  })

  it('email rỗng/sai định dạng ⇒ TỪ CHỐI TẠI CLIENT, không gọi mạng', async () => {
    const c = fakeClient()
    setSupabaseForTests(c)
    for (const bad of ['', '   ', 'khong-co-a-mail', 'a@', '@b.com']) {
      const r = await sendMagicLink(bad)
      expect(r.ok, bad).toBe(false)
    }
    expect((c as never as { auth: { signInWithOtp: ReturnType<typeof vi.fn> } }).auth.signInWithOtp)
      .not.toHaveBeenCalled()
  })

  it('lỗi từ Supabase ⇒ trả message TIẾNG VIỆT, không ném raw', async () => {
    setSupabaseForTests(
      fakeClient({ signInWithOtp: vi.fn().mockResolvedValue({ data: null, error: { message: 'rate limit' } }) }),
    )
    const r = await sendMagicLink('a@b.com')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/[À-ỹ]/)
  })
})

describe('getCurrentSession', () => {
  it('có session ⇒ trả userId + email', async () => {
    setSupabaseForTests(
      fakeClient({
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: 'u1', email: 'a@b.com' } } },
          error: null,
        }),
      }),
    )
    expect(await getCurrentSession()).toEqual({ userId: 'u1', email: 'a@b.com' })
  })

  it('không có session ⇒ null, không ném', async () => {
    setSupabaseForTests(fakeClient())
    expect(await getCurrentSession()).toBeNull()
  })

  it('lỗi đọc session ⇒ null, không ném (app phải chạy tiếp offline)', async () => {
    setSupabaseForTests(
      fakeClient({ getSession: vi.fn().mockRejectedValue(new Error('mạng')) }),
    )
    expect(await getCurrentSession()).toBeNull()
  })
})

describe('signOut', () => {
  it('gọi signOut của client', async () => {
    const c = fakeClient()
    setSupabaseForTests(c)
    await signOut()
    expect((c as never as { auth: { signOut: ReturnType<typeof vi.fn> } }).auth.signOut).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Chạy để xác nhận RED**

Run (PowerShell): `npx vitest run src/data/__tests__/auth.test.ts`
Expected: FAIL — không resolve được `@/data/auth`

- [ ] **Step 3: Implement `src/data/auth.ts`**

```ts
import { getSupabase } from '@/data/supabase'

export interface AuthSession {
  userId: string
  email: string
}

/** Kiểm tối thiểu tại client: có @ và có ký tự hai bên. Server vẫn kiểm lại. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type SendResult = { ok: true } | { ok: false; message: string }

export async function sendMagicLink(email: string): Promise<SendResult> {
  const clean = email.trim()
  if (!EMAIL_RE.test(clean)) {
    return { ok: false, message: 'Email không đúng định dạng.' }
  }
  try {
    const { error } = await getSupabase().auth.signInWithOtp({
      email: clean,
      options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}#/login` },
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
 * Không bao giờ ném: app phải chạy tiếp được khi offline hoặc chưa cấu hình
 * Supabase. Không có session thì coi như khách, dữ liệu vẫn ở IndexedDB.
 */
export async function getCurrentSession(): Promise<AuthSession | null> {
  try {
    const { data } = await getSupabase().auth.getSession()
    const s = data?.session
    if (!s?.user?.id) return null
    return { userId: s.user.id, email: s.user.email ?? '' }
  } catch {
    return null
  }
}

export function onAuthChange(cb: (s: AuthSession | null) => void): () => void {
  try {
    const { data } = getSupabase().auth.onAuthStateChange((_e, s) => {
      cb(s?.user?.id ? { userId: s.user.id, email: s.user.email ?? '' } : null)
    })
    return () => data.subscription.unsubscribe()
  } catch {
    return () => {}
  }
}

export async function signOut(): Promise<void> {
  try {
    await getSupabase().auth.signOut()
  } catch {
    // đăng xuất cục bộ vẫn phải thành công dù mạng lỗi
  }
}
```

- [ ] **Step 4: `consumeAuthRedirect` — token nằm cùng chỗ với hash router**

Thêm vào `auth.ts`:

```ts
/**
 * Magic link trả `access_token`/`refresh_token` qua URL fragment, ĐÚNG chỗ mà
 * hash router đang dùng. Vì thế `detectSessionInUrl: false` và ta tự xử lý:
 * tách token, setSession, rồi XOÁ token khỏi URL — không xoá thì refresh trang
 * sẽ replay lại token đã dùng.
 */
export async function consumeAuthRedirect(hash: string): Promise<AuthSession | null> {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  // fragment có thể là `/login&access_token=...` hoặc `access_token=...`
  const qIndex = raw.indexOf('access_token=')
  if (qIndex < 0) return null
  const params = new URLSearchParams(raw.slice(raw.indexOf('&', 0) === -1 ? 0 : 0).replace(/^[^&]*&/, ''))
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (!access_token || !refresh_token) return null
  try {
    const { data, error } = await getSupabase().auth.setSession({ access_token, refresh_token })
    if (error || !data.session?.user?.id) return null
    return { userId: data.session.user.id, email: data.session.user.email ?? '' }
  } catch {
    return null
  }
}
```

- [ ] **Step 5: `useSession` hook + `/login` route, chạy toàn bộ test, typecheck, commit**

`src/ui/hooks/use-session.ts` giữ `session` + `loading`, gọi `getCurrentSession()` một lần rồi `onAuthChange` để theo dõi, cleanup bằng hàm unsubscribe trả về. `/login` là form một ô email + nút gửi, hiện thông báo "Đã gửi liên kết tới <email>, mở mail để đăng nhập", dùng `useDialogFocus`-style focus vào input khi mount.

Run (PowerShell): `npm test`, `npm run typecheck`

---

### Task 3–6 (phác thảo, chi tiết hoá khi tới)

Bốn task sau **cần bảng thật** để kiểm tay, nên chỉ chốt chi tiết sau khi migration chạy:

- **T3 outbox**: object store `outbox` trong IndexedDB (`{ seq, kind, puzzleId, payload }`), `enqueue`/`drain`. Replay phải **luỹ đẳng** — dựa vào `mergeProgress` luỹ đẳng ở T1, cộng upsert `on conflict` ở Postgres.
- **T4 puzzle-repo**: upload 3 file lên `puzzles/<owner>/<puzzle>/`, rồi insert row. Thứ tự đó có chủ đích: row trỏ tới file đã tồn tại, không tạo row mồ côi.
- **T5 progress-repo**: `pull` → `mergeProgress` với bản local → ghi IndexedDB → `push`. `bytea` của Postgres qua supabase-js là hex/base64, phải có test round-trip `Uint8Array`.
- **T6 đấu dây**: banner "chưa đồng bộ · N thay đổi", listener `online` để drain outbox, gate `/login`, nút đăng xuất.

## Self-review

**Spec coverage:** §14 "OR bitset" → T1 · "outbox replay idempotent" → T1 (luỹ đẳng) + T3 · magic-link → T2 · "ghi local đồng bộ, debounce 1.5s" → T5/T6 · "banner chưa đồng bộ" → T6 · §13 bảng → migration đã có · RLS/Storage → migration đã có.

**Chưa phủ, ghi rõ ở đây để không tưởng là đã xong:** `daily_activity` upsert (§14) và bảng hoàn thành (§12) thuộc plan chia sẻ + thống kê, KHÔNG nằm trong plan này.

**Type consistency:** `AuthSession = { userId, email }` dùng thống nhất ở T2. `ProgressRecord` lấy nguyên từ `local-cache`, không định nghĩa lại. `mergeProgress` nhận `regionCount` vì `Bitset.fromBytes` cần `bitLength` — `filled.length * 8` sẽ tính cả bit rác ở byte cuối.
