/**
 * Tính toán thống kê — hàm THUẦN, không chạm DB.
 *
 * Tách khỏi tầng data có chủ đích: chuỗi ngày liên tiếp là chỗ dễ sai nhất trong
 * cả tính năng (múi giờ, ngày nhảy tháng, ngày trùng lặp) và ở đây nó test được
 * bằng dữ liệu bịa, không cần Postgres.
 */

export interface PuzzleStat {
  puzzleId: string
  title: string
  regionCount: number
  filledCount: number
  activeSeconds: number
  completedAt: number | null
}

export interface PuzzleMetrics extends PuzzleStat {
  /** 0..1 */
  progress: number
  /** vùng mỗi phút; null khi chưa có thời gian hoạt động */
  regionsPerMinute: number | null
  done: boolean
}

export function puzzleMetrics(s: PuzzleStat): PuzzleMetrics {
  const progress = s.regionCount > 0 ? s.filledCount / s.regionCount : 0
  // Chia cho 0 cho ra Infinity và UI in ra "Infinity vùng/phút". Trả null để
  // chỗ hiển thị buộc phải xử lý ca "chưa tô gì".
  const regionsPerMinute =
    s.activeSeconds > 0 ? s.filledCount / (s.activeSeconds / 60) : null
  return { ...s, progress, regionsPerMinute, done: s.completedAt !== null }
}

export interface Totals {
  puzzlesCompleted: number
  regionsFilled: number
  activeSeconds: number
}

export function totals(list: readonly PuzzleStat[]): Totals {
  let puzzlesCompleted = 0
  let regionsFilled = 0
  let activeSeconds = 0
  for (const s of list) {
    if (s.completedAt !== null) puzzlesCompleted++
    regionsFilled += s.filledCount
    activeSeconds += s.activeSeconds
  }
  return { puzzlesCompleted, regionsFilled, activeSeconds }
}

/**
 * Chuỗi ngày liên tiếp tính TỚI `today`.
 *
 * `days` là các ngày có hoạt động, dạng `YYYY-MM-DD` (ngày LOCAL của người dùng
 * — `daily_activity.day` được client ghi theo ngày local, xem spec §14).
 *
 * Quy tắc: chuỗi còn sống nếu ngày gần nhất là hôm nay HOẶC hôm qua. Tính "hôm
 * qua cũng được" là có chủ đích: nếu bắt buộc phải có hôm nay thì mọi người mở
 * app buổi sáng đều thấy chuỗi bằng 0 cho tới khi họ tô, và con số nhảy 0 → N
 * trông như lỗi.
 *
 * So sánh bằng CHUỖI ngày chứ không bằng số ms: cộng 86400000ms qua mốc đổi giờ
 * mùa hè sẽ lệch một ngày, còn cộng theo ngày lịch thì không.
 */
export function currentStreak(days: readonly string[], today: string): number {
  if (days.length === 0) return 0

  const set = new Set(days)
  const last = [...set].sort().at(-1)!

  const yesterday = addDays(today, -1)
  if (last !== today && last !== yesterday) return 0

  let streak = 0
  let cursor = last
  while (set.has(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

/**
 * Cộng/trừ ngày trên chuỗi `YYYY-MM-DD`, đi qua UTC để tránh lệch múi giờ.
 *
 * Dùng `Date.UTC` chứ không `new Date(str)`: `new Date('2026-03-01')` được parse
 * là UTC nhưng `getDate()` trả theo giờ địa phương, nên ở múi giờ âm nó cho ra
 * ngày HÔM TRƯỚC — một lỗi lệch-một-ngày chỉ xuất hiện với người dùng ở châu Mỹ.
 */
export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + delta * 86_400_000
  const dt = new Date(t)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** `YYYY-MM-DD` theo ngày LOCAL của một mốc thời gian */
export function localDay(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** `1h 05m` / `45s` — ngắn gọn cho bảng thống kê */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h ${String(m % 60).padStart(2, '0')}m`
}
