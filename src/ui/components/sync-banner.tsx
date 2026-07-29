import type { SyncState } from '@/ui/hooks/use-sync'

/**
 * Banner trạng thái đồng bộ.
 *
 * Im lặng khi không có gì để nói — không có việc chờ và đang online thì không
 * hiện gì. Banner "đã đồng bộ ✓" thường trực chỉ chiếm chỗ và dạy người dùng
 * bỏ qua chính chỗ mà lát nữa sẽ báo lỗi thật.
 */
export function SyncBanner({ state }: { state: SyncState }) {
  const { pending, online, syncing } = state

  if (!online) {
    return (
      <div role="status" style={wrap('#fee2e2', '#991b1b')}>
        <span>
          Mất mạng — vẫn tô được bình thường
          {pending > 0 ? `, ${pending} thay đổi chờ đồng bộ` : ''}. Có mạng lại sẽ tự đẩy lên.
        </span>
      </div>
    )
  }

  if (syncing) {
    return (
      <div role="status" style={wrap('#e0f2fe', '#075985')}>
        <span>Đang đồng bộ…</span>
      </div>
    )
  }

  if (pending > 0) {
    return (
      <div role="status" style={wrap('#fef9c3', '#854d0e')}>
        <span>Chưa đồng bộ · {pending} thay đổi</span>
        <button type="button" onClick={state.syncNow} style={btn}>
          Đồng bộ ngay
        </button>
      </div>
    )
  }

  return null
}

function wrap(bg: string, fg: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    padding: '8px 12px',
    background: bg,
    color: fg,
    fontSize: 14,
  }
}

const btn: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid currentColor',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
}
