import { cva, type VariantProps } from 'class-variance-authority'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Nút theo khuôn shadcn/ui (cva + forwardRef) nhưng render bằng `motion.button`
 * để có phản hồi nhấn.
 *
 * `whileTap` scale 0.96 không phải trang trí: trên cảm ứng không có trạng thái
 * hover, nên nếu không có phản hồi tức thì thì người dùng không biết cú bấm đã
 * được nhận hay chưa và sẽ bấm lại lần nữa.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap ' +
    'transition-colors select-none ' +
    'disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary:
          'bg-neon-500 text-white hover:bg-neon-400 shadow-[0_6px_20px_-6px_oklch(0.7_0.23_340_/_0.7)]',
        secondary: 'bg-ink-800 text-ink-200 hover:bg-ink-700 border border-ink-700',
        ghost: 'bg-transparent text-ink-200 hover:bg-ink-800',
        danger: 'bg-red-500/90 text-white hover:bg-red-500',
        aqua:
          'bg-aqua-500 text-ink-950 hover:bg-aqua-400 shadow-[0_6px_20px_-6px_oklch(0.75_0.16_200_/_0.7)]',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonProps = Omit<HTMLMotionProps<'button'>, 'ref'> &
  VariantProps<typeof buttonVariants>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={props.type ?? 'button'}
      whileTap={{ scale: 0.96 }}
      whileHover={{ y: -1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
})

export { buttonVariants }
