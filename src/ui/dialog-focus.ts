import { useEffect, useRef, type RefObject } from 'react'

/**
 * Focus-quản lý tối thiểu cho một dialog `aria-modal="true"` được render CÓ
 * ĐIỀU KIỆN (mount khi mở, unmount khi đóng — không phải ẩn/hiện qua CSS,
 * đúng như cả ba dialog trong app này: reset-confirm, delete-confirm,
 * completion banner).
 *
 * `aria-modal="true"` khiến NVDA/JAWS giới hạn buffer đọc vào đúng subtree
 * của dialog — nếu focus vẫn đứng NGOÀI dialog lúc nó xuất hiện (hành vi mặc
 * định của trình duyệt: mount một node mới không tự di focus), toàn bộ nội
 * dung dialog trở nên không đọc được bằng trình đọc màn hình. Ba việc tối
 * thiểu để sửa, không hơn (xem ghi chú "không phình thành thư viện modal"
 * trong yêu cầu gốc):
 *   1. Focus phần tử chính ngay khi dialog mount.
 *   2. Escape đóng dialog.
 *   3. Khi dialog unmount, trả focus lại đúng phần tử đã mở nó.
 */
export function useDialogFocus<T extends HTMLElement>(onClose: () => void): RefObject<T | null> {
  const primaryRef = useRef<T>(null)
  const openerRef = useRef<Element | null>(null)
  // Giữ bản `onClose` MỚI NHẤT qua ref, không đưa vào dependency của effect
  // dưới: nếu không, một `onClose` được truyền dưới dạng arrow function inline
  // (đổi tham chiếu mỗi render, cách gọi phổ biến nhất) sẽ khiến effect chạy
  // lại liên tục — gỡ rồi gắn lại listener và (nghiêm trọng hơn) focus lại
  // primaryRef mỗi lần cha re-render, giật focus ra khỏi bất cứ đâu người
  // dùng vừa tab tới bên trong dialog.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    openerRef.current = document.activeElement
    primaryRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus()
    }
  }, [])

  return primaryRef
}
