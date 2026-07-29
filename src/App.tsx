import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import LibraryRoute from '@/routes/library'
import LoginRoute from '@/routes/login'
import NewPuzzleRoute from '@/routes/new'
import PlayRoute from '@/routes/play'

/**
 * Hash router, KHÔNG phải browser router: deploy static không có server
 * rewrite, nên với browser router thì F5 ở /play/abc sẽ ra 404. Hash router
 * chạy được ở mọi kiểu hosting tĩnh.
 */
const router = createHashRouter([
  { path: '/', element: <Navigate to="/library" replace /> },
  { path: '/library', element: <LibraryRoute /> },
  // KHÔNG gate route nào sau đăng nhập: app chạy được hoàn toàn khi chưa đăng
  // nhập (dữ liệu ở IndexedDB), đăng nhập chỉ thêm đồng bộ đa thiết bị.
  { path: '/login', element: <LoginRoute /> },
  { path: '/new', element: <NewPuzzleRoute /> },
  { path: '/play/:id', element: <PlayRoute /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
