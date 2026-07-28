import { useId, useState, type DragEvent } from 'react'
import { validateUpload } from '@/data/validate-upload'

export function Dropzone({
  onFile,
  error,
}: {
  onFile: (f: File) => void
  error: string | null
}) {
  const inputId = useId()
  const [localError, setLocalError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const accept = (file: File | undefined): void => {
    if (!file) return
    const bad = validateUpload({ name: file.name, type: file.type, size: file.size })
    if (bad) {
      setLocalError(bad.message)
      return
    }
    setLocalError(null)
    onFile(file)
  }

  const onDrop = (e: DragEvent<HTMLLabelElement>): void => {
    e.preventDefault()
    setDragging(false)
    accept(e.dataTransfer.files[0])
  }

  const shown = localError ?? error

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          display: 'block',
          border: `2px dashed ${dragging ? '#2563eb' : '#cbd5e1'}`,
          borderRadius: 12,
          padding: '2.5rem 1.5rem',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? '#eff6ff' : '#f8fafc',
        }}
      >
        Kéo ảnh vào đây, hoặc bấm để chọn ảnh
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
          PNG, JPG hoặc WebP · tối đa 15 MB
        </div>
        <input
          id={inputId}
          aria-label="Chọn ảnh"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </label>

      {shown && (
        <p role="alert" style={{ color: '#b91c1c', marginTop: 12 }}>
          {shown}
        </p>
      )}
    </div>
  )
}
