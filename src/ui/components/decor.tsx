import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { DECOR_ACCENT, DECOR_BG, DECOR_CELEBRATE } from '@/ui/decor-manifest'

/**
 * Chọn một phần tử theo `seed` — ỔN ĐỊNH, không random.
 *
 * Dùng seed thay vì `Math.random()` vì background phải giữ nguyên qua mỗi lần
 * re-render: random sẽ đổi ảnh mỗi khi component render lại (đổi state, resize,
 * StrictMode mount kép), tạo ra hiện tượng nền nhấp nháy đổi ảnh liên tục.
 */
function pickStable<T>(list: readonly T[], seed: string): T | null {
  if (list.length === 0) return null
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return list[Math.abs(h) % list.length]
}

/**
 * Nền anime mờ cho một trang.
 *
 * Ba lớp: ảnh (mờ đậm + tối đi) → gradient phủ → nội dung. Làm mờ mạnh và hạ
 * opacity là CỐ Ý: đây là nền trang trí, và một ảnh minh hoạ rõ nét phía sau chữ
 * làm chữ không đọc được — mất nhiều hơn được.
 *
 * `aria-hidden` + `pointer-events-none`: thuần trang trí, không được lọt vào
 * accessibility tree hay ăn cú click.
 *
 * Tự ẩn khi ảnh 404: `public/decor/` bị gitignore nên một bản clone sạch sẽ
 * KHÔNG có ảnh, và để nguyên thì trình duyệt hiện icon ảnh vỡ giữa trang.
 */
export function AmbientBackground({ seed, className }: { seed: string; className?: string }) {
  const src = useMemo(() => pickStable(DECOR_BG, seed), [seed])
  const [ok, setOk] = useState(true)

  // đổi seed ⇒ thử lại ảnh mới (ảnh trước 404 không có nghĩa ảnh này cũng thiếu)
  useEffect(() => setOk(true), [seed])

  if (!src || !ok) return null

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none fixed inset-0 -z-10 overflow-hidden', className)}
    >
      <motion.img
        src={src}
        alt=""
        onError={() => setOk(false)}
        initial={{ opacity: 0, scale: 1.15 }}
        animate={{ opacity: 0.22, scale: 1 }}
        transition={{ duration: 1.6, ease: 'easeOut' }}
        className="h-full w-full scale-110 object-cover blur-2xl saturate-150"
      />
      {/*
        Lớp phủ tối. Cần thiết chứ không phải cho đẹp: không có nó thì độ tương
        phản chữ tuỳ vào việc ảnh nền ngẫu nhiên sáng hay tối — có ảnh sẽ làm chữ
        gần như không đọc được.
      */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/85 via-ink-950/75 to-ink-950/95" />
    </div>
  )
}

/**
 * Vài icon nhỏ trôi lững lờ ở góc — thêm sinh khí cho trang trống.
 *
 * Số lượng ít (mặc định 5) có chủ đích: nhiều hơn thì mắt bị kéo khỏi nội dung,
 * và mỗi icon là một phần tử animate liên tục — hàng chục cái sẽ ngốn CPU thật
 * trên điện thoại.
 */
export function FloatingAccents({ seed, count = 5 }: { seed: string; count?: number }) {
  const items = useMemo(() => {
    if (DECOR_ACCENT.length === 0) return []
    const out: Array<{ src: string; left: number; top: number; delay: number; size: number }> = []
    for (let i = 0; i < count; i++) {
      const src = pickStable(DECOR_ACCENT, `${seed}-${i}`)
      if (!src) continue
      // vị trí cũng suy ra từ seed ⇒ không nhảy chỗ mỗi lần render
      const a = ((i * 2654435761) ^ seed.length) >>> 0
      out.push({
        src,
        left: 4 + ((a >>> 3) % 92),
        top: 6 + ((a >>> 11) % 84),
        delay: ((a >>> 17) % 30) / 10,
        size: 22 + ((a >>> 23) % 22),
      })
    }
    return out
  }, [seed, count])

  const [broken, setBroken] = useState(false)
  if (broken || items.length === 0) return null

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {items.map((it, i) => (
        <motion.img
          key={i}
          src={it.src}
          alt=""
          onError={() => setBroken(true)}
          style={{ left: `${it.left}%`, top: `${it.top}%`, width: it.size }}
          className="absolute opacity-[0.16]"
          animate={{ y: [0, -18, 0], rotate: [0, 8, 0] }}
          transition={{
            duration: 7 + it.delay,
            delay: it.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

/**
 * Bùng nổ stamp khi tô xong một bức tranh.
 *
 * Chỉ chạy MỘT lượt rồi tự dọn (`onDone`) — không lặp: hiệu ứng ăn mừng lặp vô
 * hạn sẽ che mất chính bức tranh mà người chơi vừa hoàn thành và muốn ngắm.
 */
export function CelebrationBurst({
  running,
  onDone,
}: {
  running: boolean
  onDone?: () => void
}) {
  const pieces = useMemo(() => {
    if (DECOR_CELEBRATE.length === 0) return []
    return Array.from({ length: 18 }, (_, i) => {
      const src = DECOR_CELEBRATE[i % DECOR_CELEBRATE.length]
      const angle = (i / 18) * Math.PI * 2 + (i % 3) * 0.2
      const dist = 130 + (i % 5) * 55
      return {
        src,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist - 40, // lệch lên: rơi xuống trông tự nhiên hơn
        rot: (i % 2 === 0 ? 1 : -1) * (90 + (i % 4) * 60),
        size: 30 + (i % 4) * 14,
        delay: (i % 6) * 0.045,
      }
    })
  }, [])

  const [broken, setBroken] = useState(false)

  useEffect(() => {
    if (!running || !onDone) return
    const t = setTimeout(onDone, 1800)
    return () => clearTimeout(t)
  }, [running, onDone])

  if (broken || pieces.length === 0) return null

  return (
    <AnimatePresence>
      {running && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-40 grid place-items-center">
          {pieces.map((p, i) => (
            <motion.img
              key={i}
              src={p.src}
              alt=""
              onError={() => setBroken(true)}
              style={{ width: p.size }}
              className="absolute"
              initial={{ x: 0, y: 0, scale: 0.2, opacity: 0, rotate: 0 }}
              animate={{
                x: p.x,
                y: [p.y, p.y + 70],
                scale: [0.2, 1.15, 0.95],
                opacity: [0, 1, 0],
                rotate: p.rot,
              }}
              transition={{ duration: 1.5, delay: p.delay, ease: 'easeOut' }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  )
}
