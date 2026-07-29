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
        // 90% chu khong phai 78%: the phai du duc de chu trong no net tren mot nen
        // anh dang hien ro. Van chua ha het de con thay lop nen ben duoi.
        'rounded-xl2 border border-slate-200/80 bg-white/90 backdrop-blur-xl',
        'shadow-card',
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
      className={cn('font-display text-lg font-bold tracking-tight text-slate-900', className)}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-sm text-slate-500', className)} {...props} />
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />
}
