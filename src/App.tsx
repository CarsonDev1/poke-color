import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
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
  return <RouterProvider router={router} />
}
