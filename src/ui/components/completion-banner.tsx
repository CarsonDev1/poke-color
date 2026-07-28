import { useDialogFocus } from '@/ui/dialog-focus'

export function CompletionBanner({
  originalUrl,
  onClose,
}: {
  originalUrl: string | null
  onClose: () => void
}) {
  // I9: aria-modal="true" giới hạn buffer đọc của NVDA/JAWS vào subtree này —
  // nếu focus đứng ngoài (hành vi mặc định khi mount một node mới), nội dung
  // hoàn toàn không đọc được. Banner này là ca rõ nhất: nó tự xuất hiện khi
  // vùng cuối cùng được tô xong, không do người dùng chủ động bấm gì, nên
  // không có tín hiệu nào khác báo cho AT biết có nội dung mới.
  const closeRef = useDialogFocus<HTMLButtonElement>(onClose)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Đã hoàn thành"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,.72)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        zIndex: 10,
      }}
    >
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 900, textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Hoàn thành! 🎉</h2>
        <p>Bạn đã tô xong toàn bộ bức tranh.</p>
        {originalUrl && (
          <div>
            <p style={{ color: '#475569', fontSize: 14 }}>Ảnh gốc:</p>
            <img
              src={originalUrl}
              alt="Ảnh gốc"
              style={{ maxWidth: '100%', maxHeight: '50vh', borderRadius: 8 }}
            />
          </div>
        )}
        <button ref={closeRef} type="button" onClick={onClose} style={{ marginTop: 16 }}>
          Đóng
        </button>
      </div>
    </div>
  )
}
