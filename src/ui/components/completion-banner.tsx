export function CompletionBanner({
  originalUrl,
  onClose,
}: {
  originalUrl: string | null
  onClose: () => void
}) {
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
        <button type="button" onClick={onClose} style={{ marginTop: 16 }}>
          Đóng
        </button>
      </div>
    </div>
  )
}
