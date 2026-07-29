import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/** Nhãn nhỏ tròn — dùng cho số vùng, mức zoom, trạng thái. */
export function Badge({
  className,
  tone = 'neutral',
  ...props
}: React.ComponentProps<'span'> & { tone?: 'neutral' | 'neon' | 'aqua' | 'sun' | 'danger' }) {
  const tones = {
    neutral: 'bg-ink-800 text-ink-200 border-ink-700',
    neon: 'bg-neon-500/15 text-neon-400 border-neon-500/40',
    aqua: 'bg-aqua-500/15 text-aqua-400 border-aqua-500/40',
    sun: 'bg-sun-400/15 text-sun-400 border-sun-400/40',
    danger: 'bg-red-500/15 text-red-300 border-red-500/40',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}

/**
 * Thanh tiến độ có hiệu ứng chạy sáng.
 *
 * Dùng `<div role="progressbar">` với aria-value* thay vì `<progress>`: thẻ
 * `<progress>` gần như không style được nhất quán giữa các browser, và ở đây
 * cần gradient + shimmer bên trong.
 */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('h-2.5 w-full overflow-hidden rounded-full bg-ink-800', className)}
    >
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-aqua-400 via-neon-400 to-sun-400"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
    </div>
  )
}

/** Tiêu đề trang có gradient chữ — dùng nhất quán ở mọi màn. */
export function PageTitle({ className, ...props }: React.ComponentProps<'h1'>) {
  return (
    <h1
      className={cn(
        'font-display text-2xl font-extrabold tracking-tight sm:text-3xl',
        'bg-gradient-to-r from-white via-neon-400 to-aqua-400 bg-clip-text text-transparent',
        className,
      )}
      {...props}
    />
  )
}

/** Khung nội dung chuẩn — giữ chiều rộng và padding giống nhau ở mọi trang. */
export function Shell({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      className={cn('mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8', className)}
      {...props}
    />
  )
}

/** Khung xương chờ tải, có shimmer. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-ink-800',
        'after:absolute after:inset-0 after:animate-shimmer',
        'after:bg-[linear-gradient(90deg,transparent,oklch(1_0_0_/_0.07),transparent)]',
        'after:bg-[length:200%_100%]',
        className,
      )}
    />
  )
}
