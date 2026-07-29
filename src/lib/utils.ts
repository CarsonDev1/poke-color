import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Gộp class Tailwind — khuôn chuẩn của shadcn/ui.
 *
 * `twMerge` cần thiết chứ không chỉ để cho gọn: nó GIẢI QUYẾT XUNG ĐỘT. Không
 * có nó thì `cn('p-4', 'p-2')` cho ra cả hai class và kết quả phụ thuộc thứ tự
 * trong file CSS — nghĩa là một prop `className` truyền vào component sẽ im lặng
 * không có tác dụng, tuỳ vào việc utility nào tình cờ đứng sau trong bundle.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
