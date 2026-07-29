import { useEffect, useState } from 'react'

export const BGM_STORAGE_KEY = 'pokemon-color:bgm'

/** ID video YouTube dùng làm nhạc nền màn tô */
export const BGM_VIDEO_ID = '6CjpgFOOtuI'

function readEnabled(): boolean {
  try {
    // mặc định BẬT: người dùng yêu cầu vào màn tô là có nhạc
    return localStorage.getItem(BGM_STORAGE_KEY) !== '0'
  } catch {
    // localStorage bị chặn (chế độ riêng tư) — không phải lỗi đáng dừng app
    return true
  }
}

function writeEnabled(v: boolean): void {
  try {
    localStorage.setItem(BGM_STORAGE_KEY, v ? '1' : '0')
  } catch {
    // như trên: chặn lưu thì chỉ mất phần ghi nhớ, không ảnh hưởng phiên hiện tại
  }
}

export function useBgmEnabled(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState(readEnabled)
  return [
    enabled,
    (v: boolean) => {
      setEnabled(v)
      writeEnabled(v)
    },
  ]
}

/**
 * Nhạc nền từ YouTube, KHÔNG hiện hình.
 *
 * Vì sao `1×1px + opacity 0` chứ không `display: none`: iframe bị `display: none`
 * KHÔNG được phép phát media ở Chrome — nó bị coi là không render nên bị dừng.
 * Phải giữ iframe trong luồng layout và chỉ làm nó vô hình về mặt thị giác.
 *
 * `loop=1` một mình KHÔNG lặp video đơn — YouTube bắt buộc kèm
 * `playlist=<cùng id>`, nếu thiếu thì phát một lần rồi dừng.
 *
 * Toàn bộ tham số đi qua `URLSearchParams`, không nối chuỗi tay: một tham số
 * thiếu `&` sẽ làm YouTube âm thầm bỏ qua phần còn lại (mất luôn `loop`).
 *
 * Không mount khi `enabled` false — dừng nhạc bằng cách GỠ iframe thay vì gọi
 * postMessage của IFrame API. Đổi lại là không giữ được vị trí đang phát, nhưng
 * tránh phải nạp thêm script API của YouTube chỉ để bật/tắt.
 */
export function BackgroundMusic({ enabled }: { enabled: boolean }) {
  // Chờ mount xong mới chèn iframe. Chèn ngay trong lượt render đầu của SPA
  // thỉnh thoảng bị Chrome tính là chưa có user activation; sau một nhịp thì
  // cú click điều hướng vào màn này đã được ghi nhận.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 0)
    return () => clearTimeout(t)
  }, [])

  if (!enabled || !ready) return null

  const params = new URLSearchParams({
    autoplay: '1',
    loop: '1',
    playlist: BGM_VIDEO_ID, // BẮT BUỘC để loop hoạt động với video đơn
    controls: '0',
    disablekb: '1',
    modestbranding: '1',
    playsinline: '1',
    rel: '0',
    iv_load_policy: '3',
  })

  return (
    <iframe
      // key theo videoId: đổi bài thì buộc iframe tạo lại thay vì giữ bài cũ
      key={BGM_VIDEO_ID}
      title="Nhạc nền"
      aria-hidden
      tabIndex={-1}
      src={`https://www.youtube-nocookie.com/embed/${BGM_VIDEO_ID}?${params.toString()}`}
      allow="autoplay; encrypted-media"
      // 1×1 + opacity 0, KHÔNG display:none (xem docblock). pointer-events-none
      // để nó không ăn cú click nào dù nằm trong layout.
      className="pointer-events-none fixed bottom-0 left-0 h-px w-px border-0 opacity-0"
    />
  )
}
