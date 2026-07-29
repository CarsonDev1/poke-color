import { motion } from 'framer-motion'
import { ImagePlus } from 'lucide-react'
import { useEffect, useId, useState, type DragEvent } from 'react'
import { validateUpload } from '@/data/validate-upload'
import { cn } from '@/lib/utils'

export function Dropzone({
  onFile,
  error,
}: {
  onFile: (f: File) => void
  error: string | null
}) {
  const inputId = useId()
  // Lỗi hiện tại cần thấy, dù nguồn là validate cục bộ hay `error` truyền từ
  // ngoài vào. Đây KHÔNG được ghép bằng `localError ?? error`: khi accept()
  // chấp nhận một file mới hợp lệ, nó đặt lại về null — nhưng `null ?? error`
  // lại rơi về `error` cũ, tức là hiện lại đúng lỗi vừa được xoá. File mới đã
  // được chấp nhận thì lỗi của lần thử trước (dù đến từ đâu) đã lỗi thời và
  // không được hiện tiếp, cho tới khi ngoài truyền vào một lỗi MỚI.
  const [displayError, setDisplayError] = useState<string | null>(error)
  const [dragging, setDragging] = useState(false)

  // đồng bộ khi ngoài truyền vào lỗi mới (vd: lần sinh lại tiếp theo thất bại)
  useEffect(() => {
    setDisplayError(error)
  }, [error])

  const accept = (file: File | undefined): void => {
    if (!file) return
    const bad = validateUpload({ name: file.name, type: file.type, size: file.size })
    if (bad) {
      setDisplayError(bad.message)
      return
    }
    setDisplayError(null)
    onFile(file)
  }

  const onDrop = (e: DragEvent<HTMLLabelElement>): void => {
    e.preventDefault()
    setDragging(false)
    accept(e.dataTransfer.files[0])
  }

  const shown = displayError

  return (
    <div>
      {/*
        `<label>` THƯỜNG, không phải `motion.label` với whileTap: framer-motion
        tự thêm `tabIndex="0"` cho phần tử có gesture tap (để bấm được bằng bàn
        phím), và điều đó đưa label vào tab order TRƯỚC input — Tab dừng ở label,
        vốn không mở được dialog chọn file, nên người dùng bàn phím bị kẹt (đúng
        lỗi I8 mà test bắt được). Hiệu ứng phóng nhẹ làm bằng CSS transition, cho
        cùng cảm giác mà không chạm vào tab order.
      */}
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'relative block cursor-pointer rounded-xl2 border-2 border-dashed px-6 py-14 text-center',
          'transition-[colors,transform] duration-200 hover:scale-[1.01] active:scale-[0.99]',
          dragging
            ? 'border-neon-400 bg-neon-500/10 shadow-glow'
            : 'border-slate-300 bg-white/70 hover:border-slate-400',
        )}
      >
        <div
          className={cn(
            'mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl transition-colors',
            dragging ? 'bg-neon-500/25 text-neon-400' : 'bg-slate-200 text-slate-500',
          )}
        >
          <ImagePlus size={28} className={dragging ? undefined : 'animate-float'} />
        </div>
        <span className="font-display block text-base font-bold text-slate-900">
          {dragging ? 'Thả ảnh vào đây' : 'Kéo ảnh vào đây, hoặc bấm để chọn ảnh'}
        </span>
        <span className="mt-1.5 block text-sm text-slate-500">
          PNG, JPG hoặc WebP · tối đa 15 MB
        </span>
        <input
          id={inputId}
          aria-label="Chọn ảnh"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          // sr-only, KHÔNG `display: none`/`visibility: hidden`: cả hai loại phần
          // tử khỏi tab order lẫn accessibility tree, và `<label>` (dù forward
          // click tới input) không tự nhận focus — người dùng chỉ dùng bàn phím
          // sẽ không có cách nào mở được dialog chọn file (I8). Giữ trong layout
          // (position absolute, không dùng display/visibility) để trình duyệt vẫn
          // coi input là focusable.
          className="absolute h-px w-px overflow-hidden opacity-0"
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </label>

      {shown && (
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-200"
        >
          {shown}
        </motion.p>
      )}
    </div>
  )
}
