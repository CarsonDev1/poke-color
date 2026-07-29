import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AmbientBackground } from '@/ui/components/decor'
import EditRoute from '@/routes/edit'
import LibraryRoute from '@/routes/library'
import NewPuzzleRoute from '@/routes/new'
import PlayRoute from '@/routes/play'
import PrintRoute from '@/routes/print'
import SharedRoute from '@/routes/shared'
import StatsRoute from '@/routes/stats'

/**
 * Hash router, KHÔNG phải browser router: deploy static không có server
 * rewrite, nên với browser router thì F5 ở /play/abc sẽ ra 404. Hash router
 * chạy được ở mọi kiểu hosting tĩnh.
 */
const router = createHashRouter([
  { path: '/', element: <Navigate to="/library" replace /> },
  { path: '/library', element: <LibraryRoute /> },
  { path: '/new', element: <NewPuzzleRoute /> },
  { path: '/play/:id', element: <PlayRoute /> },
  { path: '/print/:id', element: <PrintRoute /> },
  { path: '/edit/:id', element: <EditRoute /> },
  { path: '/stats', element: <StatsRoute /> },
  // `/s/:token` chứ không phải `/shared/:token` — link chia sẻ càng ngắn càng dễ
  // dán vào tin nhắn mà không bị cắt dòng.
  { path: '/s/:token', element: <SharedRoute /> },
])

export default function App() {
  return (
    <>
      {/*
        Nền đặt ở GỐC app, không trong từng route, và dùng z-index DƯƠNG.

        Bản trước đặt trong từng route với `-z-10`. Cách đó dựa vào việc nền
        `body` được "propagate lên canvas" (vẽ dưới mọi thứ) — và nó vỡ ngay khi
        có bất kỳ tổ tiên nào tạo stacking context, thứ mà framer-motion tạo ra
        rất dễ dàng (chỉ cần một `transform` đang animate). Kết quả: nền nằm sau
        một lớp đục nào đó và không thấy gì.

        Ở đây không còn chỗ mơ hồ: nền là `fixed inset-0 z-0`, nội dung nằm trong
        một khối `relative z-10` — một phần tử có z-index CAO HƠN thì luôn vẽ
        trên, không phụ thuộc canvas hay stacking context của ai.
      */}
      <AmbientBackground seed="app" />
      <div className="relative z-10">
        <RouterProvider router={router} />
      </div>
    </>
  )
}
