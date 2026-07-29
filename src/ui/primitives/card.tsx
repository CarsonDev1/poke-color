import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * Thẻ kính mờ. `backdrop-blur` cần một chút trong suốt để thấy được nền
 * gradient bên dưới — đục hoàn toàn thì thẻ trông như dán lên, mất hẳn cảm giác
 * lớp mà cả giao diện này dựa vào.
 */
export function Card({ className, ...props }: HTMLMotionProps<'div'>) {
  return (
    <motion.div
      className={cn(
        'rounded-xl2 border border-ink-800/80 bg-ink-900/60 backdrop-blur-xl',
        'shadow-[0_16px_50px_-24px_oklch(0.16_0.03_275_/_0.9)]',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return (
    <h3
      className={cn('font-display text-lg font-bold tracking-tight text-white', className)}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-sm text-ink-400', className)} {...props} />
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />
}
