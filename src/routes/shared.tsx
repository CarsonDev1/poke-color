import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { decodePuzzleBin, decodeRegions } from '@/core/codec/puzzle-format'
import { gunzip } from '@/data/compress'
import { loadPuzzleRecord, savePuzzle } from '@/data/local-cache'
import { downloadSharedFiles, getSharedPuzzle } from '@/data/share-repo'

/**
 * `/s/:token` — mở một puzzle được chia sẻ.
 *
 * Không cần đăng nhập (§11): RPC `get_shared_puzzle` là `security definer`, và
 * Storage policy cho đọc `puzzle.bin` + `regions.json.gz` của puzzle đang chia
 * sẻ. Ảnh gốc thì KHÔNG — đó là toàn bộ ý nghĩa: người nhận tô để khám phá bức
 * tranh, nên `savePuzzle` ở đây lưu một Blob RỖNG làm ảnh gốc.
 */
export default function SharedRoute() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('Đang mở tranh được chia sẻ…')
  const [error, setError] = useState<string | null>(null)
  const onceRef = useRef(false)

  useEffect(() => {
    if (onceRef.current) return
    onceRef.current = true
    let alive = true

    void (async () => {
      try {
        const meta = await getSharedPuzzle(token)
        if (!meta) throw new Error('Liên kết không còn hiệu lực hoặc đã bị tắt chia sẻ.')
        if (!alive) return

        // Đã có trong máy rồi (mở lại link lần hai) ⇒ vào chơi luôn, giữ tiến độ.
        const existing = await loadPuzzleRecord(meta.id)
        if (existing) {
          navigate(`/play/${meta.id}`, { replace: true })
          return
        }

        setStatus('Đang tải dữ liệu tranh…')
        const files = await downloadSharedFiles(meta)
        if (!files) throw new Error('Không tải được dữ liệu tranh. Kiểm tra mạng rồi thử lại.')
        if (!alive) return

        // Giải nén để đọc palette và số vùng thật — metadata từ RPC có thể lệch
        // nếu chủ sở hữu vừa sửa vùng.
        const bin = decodePuzzleBin(await gunzip(files.binGz))
        const regions = decodeRegions(new TextDecoder().decode(await gunzip(files.regionsGz)))

        setStatus('Đang lưu vào máy…')
        await savePuzzle(
          {
            id: meta.id,
            title: meta.title,
            createdAt: Date.now(),
            width: bin.width,
            height: bin.height,
            colorCount: bin.palette.length,
            regionCount: regions.length,
            palette: bin.palette,
            // params không đến từ RPC (không cần cho việc tô) — để rỗng thay vì
            // bịa số, và editor sẽ không dùng được trên puzzle nhận qua share.
            params: {} as never,
            usedMinArea: 0,
          },
          files.binGz,
          files.regionsGz,
          // Blob RỖNG: người nhận KHÔNG được xem ảnh gốc (D7/§11). Nút "Xem ảnh
          // gốc" ở màn chơi sẽ không có gì để hiện — đúng như thiết kế.
          new Blob([], { type: 'image/webp' }),
        )
        if (!alive) return
        navigate(`/play/${meta.id}`, { replace: true })
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      }
    })()

    return () => {
      alive = false
    }
  }, [token, navigate])

  if (error) {
    return (
      <main style={{ padding: 24, display: 'grid', gap: 12, maxWidth: 480 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Không mở được tranh</h1>
        <p role="alert" style={{ margin: 0, color: '#b91c1c' }}>
          {error}
        </p>
        <Link to="/library">Về thư viện</Link>
      </main>
    )
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 8 }}>
      <p>{status}</p>
      <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
        Bạn sẽ không thấy ảnh gốc — tô xong mới biết đó là gì.
      </p>
    </main>
  )
}
